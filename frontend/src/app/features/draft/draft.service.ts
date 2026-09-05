import { Injectable, computed, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { ActivoLibre, FalmService } from '../../core/falm.service';
import { SupabaseService } from '../../core/supabase.service';

export interface DraftTurno {
  ronda: number;
  posicion_en_ronda: number;
  orden_global: number;
  equipo_falm_id: string;
  equipo: string;
}

export interface DraftEstado {
  id: string;
  nombre: string;
  estado: string;
  total_rondas: number;
  picks_hechos: number;
  picks_totales: number;
  turno: DraftTurno | null;
}

export interface DraftOrdenFila {
  equipo_falm_id: string;
  ronda: number;
  posicion_en_ronda: number;
  orden_global: number;
  completado: boolean;
}

export interface DraftPickFila {
  id: string;
  activo_id: string;
  equipo_falm_id: string;
  ronda: number;
  orden_seleccion: number;
}

/** Un pick con los datos del jugador, para el resumen final. */
export interface PickDetalle {
  /** id del pick: lo necesita el admin para corregirlo o anularlo. */
  id: string;
  activo_id: string;
  equipo_falm_id: string;
  ronda: number;
  orden_seleccion: number;
  nombre: string;
  posicion: string;
  club: string;
  escudo: string | null;
  es_porteria: boolean;
}

export interface ItemCola {
  activo_id: string;
  prioridad: number;
}

/** Porterías mínimas por equipo, dentro de las 23 rondas. Igual que en draft_pick. */
export const MIN_PORTERIAS = 2;

/**
 * Estado del draft en vivo. La fuente de verdad es la BD: los picks llegan por
 * Realtime y se aplican sobre el estado local, con refresco completo al
 * suscribirse, al reconectar y al volver a la pestaña.
 *
 * No es `providedIn: 'root'`: lo provee el componente, para que al salir del
 * tablero se cierre el canal y se suelte el catálogo.
 */
@Injectable()
export class DraftService {
  readonly draft = signal<DraftEstado | null>(null);
  readonly orden = signal<DraftOrdenFila[]>([]);
  readonly picks = signal<DraftPickFila[]>([]);
  readonly catalogo = signal<ActivoLibre[]>([]);
  readonly cola = signal<ItemCola[]>([]);
  readonly equipos = signal<{ id: string; nombre: string }[]>([]);
  /**
   * Picks con nombre y club. Hace falta para el resumen del final: al consolidar,
   * los jugadores pasan a la plantilla y salen de v_activo_libre, así que
   * cruzarlos con el catálogo daría una lista vacía justo al terminar.
   */
  readonly detalle = signal<PickDetalle[]>([]);
  readonly miEquipoId = signal<string | null>(null);
  readonly conectado = signal(true);
  /** ADMIN o GESTOR: puede fichar en nombre del equipo al que le toca el turno. */
  readonly soyGestor = signal(false);
  readonly cargando = signal(true);
  readonly error = signal('');

  private canal: RealtimeChannel | null = null;
  private sondeo: ReturnType<typeof setInterval> | null = null;

  constructor(private sb: SupabaseService, private falm: FalmService) {}

  /** activo_id -> equipo que lo fichó. */
  readonly tomadoPor = computed(() => {
    const m = new Map<string, string>();
    for (const p of this.picks()) m.set(p.activo_id, p.equipo_falm_id);
    return m;
  });

  readonly equipoPorId = computed(() => {
    const m = new Map<string, string>();
    for (const e of this.equipos()) m.set(e.id, e.nombre);
    return m;
  });

  /** El turno actual es la primera fila del orden sin completar. */
  readonly turno = computed<DraftOrdenFila | null>(
    () => this.orden().find((o) => !o.completado) ?? null
  );

  readonly esMiTurno = computed(() => {
    const t = this.turno();
    const yo = this.miEquipoId();
    return !!t && !!yo && t.equipo_falm_id === yo;
  });

  readonly misPicks = computed(() => {
    const yo = this.miEquipoId();
    return yo ? this.picks().filter((p) => p.equipo_falm_id === yo) : [];
  });

  readonly misPorterias = computed(() => {
    const cat = new Map(this.catalogo().map((a) => [a.activo_id, a]));
    return this.misPicks().filter((p) => cat.get(p.activo_id)?.tipo === 'DEFENSA').length;
  });

  readonly misTurnosRestantes = computed(() => {
    const yo = this.miEquipoId();
    return yo ? this.orden().filter((o) => !o.completado && o.equipo_falm_id === yo).length : 0;
  });

  /** Cierto cuando ya solo caben porterías en los turnos que me quedan. */
  readonly debeElegirPorteria = computed(() => {
    const faltan = MIN_PORTERIAS - this.misPorterias();
    return faltan > 0 && this.misTurnosRestantes() <= faltan;
  });

  /**
   * Cuántos jugadores tiene cada equipo de cada club de LaLiga, para poder
   * avisar del tope antes de que el servidor rechace el pick.
   * equipo_falm_id -> (club_id -> nº)
   */
  readonly cupoPorEquipo = computed(() => {
    const cat = new Map(this.catalogo().map((a) => [a.activo_id, a]));
    const m = new Map<string, Map<string, number>>();
    for (const p of this.picks()) {
      const club = cat.get(p.activo_id)?.club_id;
      if (!club) continue;
      let porClub = m.get(p.equipo_falm_id);
      if (!porClub) { porClub = new Map(); m.set(p.equipo_falm_id, porClub); }
      porClub.set(club, (porClub.get(club) ?? 0) + 1);
    }
    return m;
  });

  /** Picks ajenos que faltan hasta que me toque. 0 = es mi turno, -1 = ya no tengo turnos. */
  readonly picksHastaMiTurno = computed(() => {
    const yo = this.miEquipoId();
    if (!yo) return -1;
    return this.orden().filter((o) => !o.completado).findIndex((o) => o.equipo_falm_id === yo);
  });

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      const eq = await this.falm.miEquipo();
      this.miEquipoId.set(eq?.id ?? null);
      const { data: gestor } = await this.sb.client.rpc('es_gestor');
      this.soyGestor.set(gestor === true);
      this.equipos.set(await this.falm.equiposFalm());

      const { data: d } = await this.sb.client
        .from('draft')
        .select('id')
        .in('estado', ['CREADO', 'EN_CURSO', 'COMPLETADO'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!d) {
        this.draft.set(null);
        return;
      }

      const draftId = (d as { id: string }).id;
      await this.refrescarEstado(draftId);
      await this.refrescarOrden(draftId);
      await this.refrescarPicks();
      this.catalogo.set(await this.falm.mercadoLibre());
      await this.refrescarCola();
      await this.cargarDetalle();
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se pudo cargar el draft.');
    } finally {
      this.cargando.set(false);
    }
  }

  private async refrescarEstado(draftId: string) {
    const { data, error } = await this.sb.client.rpc('draft_estado', { p_draft: draftId });
    if (error) throw error;
    this.draft.set((typeof data === 'string' ? JSON.parse(data) : data) as DraftEstado);
  }

  private async refrescarOrden(draftId: string) {
    const { data, error } = await this.sb.client
      .from('draft_orden')
      .select('equipo_falm_id, ronda, posicion_en_ronda, orden_global, completado')
      .eq('draft_id', draftId)
      .order('orden_global', { ascending: true });
    if (error) throw error;
    this.orden.set((data ?? []) as DraftOrdenFila[]);
  }

  /** Relee los picks y recalcula qué turnos están completados. Punto de reconciliación. */
  async refrescarPicks(): Promise<void> {
    const d = this.draft();
    if (!d) return;
    const { data, error } = await this.sb.client
      .from('draft_pick')
      .select('id, activo_id, equipo_falm_id, ronda, orden_seleccion')
      .eq('draft_id', d.id)
      .order('orden_seleccion', { ascending: true });
    if (error) throw error;
    const filas = (data ?? []) as DraftPickFila[];
    this.picks.set(filas);
    const hechos = new Set(filas.map((p) => p.orden_seleccion));
    this.orden.update((o) => o.map((f) => ({ ...f, completado: hechos.has(f.orden_global) })));
    this.draft.update((x) => (x ? { ...x, picks_hechos: filas.length } : x));
    await this.cargarDetalle();
  }

  /** Los picks con datos del jugador, leídos de la BD y no del catálogo. */
  async cargarDetalle(): Promise<void> {
    const d = this.draft();
    if (!d) return;
    const { data, error } = await this.sb.client
      .from('draft_pick')
      .select('id, activo_id, equipo_falm_id, ronda, orden_seleccion, ' +
        'activo:activo_id (tipo, equipo_lfp:equipo_lfp_id (nombre, escudo), ' +
        'jugador_lfp:jugador_lfp_id (nombre, apellido, posicion, ' +
        'equipo_lfp:equipo_lfp_id (nombre, escudo)))')
      .eq('draft_id', d.id)
      .order('orden_seleccion', { ascending: true });
    if (error) return;
    this.detalle.set((data ?? []).map((p: any) => {
      const a = p.activo;
      const esPorteria = a?.tipo === 'DEFENSA';
      return {
        id: p.id,
        activo_id: p.activo_id,
        equipo_falm_id: p.equipo_falm_id,
        ronda: p.ronda,
        orden_seleccion: p.orden_seleccion,
        nombre: esPorteria
          ? `Portería ${a?.equipo_lfp?.nombre ?? ''}`.trim()
          : `${a?.jugador_lfp?.nombre ?? ''} ${a?.jugador_lfp?.apellido ?? ''}`.trim(),
        posicion: esPorteria ? 'PORTERO' : (a?.jugador_lfp?.posicion ?? ''),
        club: esPorteria ? (a?.equipo_lfp?.nombre ?? '') : (a?.jugador_lfp?.equipo_lfp?.nombre ?? ''),
        escudo: esPorteria ? (a?.equipo_lfp?.escudo ?? null) : (a?.jugador_lfp?.equipo_lfp?.escudo ?? null),
        es_porteria: esPorteria,
      } as PickDetalle;
    }));
  }

  private async refrescarCola() {
    const d = this.draft();
    const yo = this.miEquipoId();
    if (!d || !yo) return;
    const { data } = await this.sb.client
      .from('draft_wishlist')
      .select('activo_id, prioridad')
      .eq('draft_id', d.id)
      .eq('equipo_falm_id', yo)
      .order('prioridad', { ascending: true });
    this.cola.set((data ?? []) as ItemCola[]);
  }

  /** Aplica un pick recibido por Realtime sin volver a consultar nada. */
  private aplicarPick(p: DraftPickFila) {
    if (this.picks().some((x) => x.id === p.id)) return;
    this.picks.update((v) => [...v, p]);
    this.orden.update((o) =>
      o.map((f) => (f.orden_global === p.orden_seleccion ? { ...f, completado: true } : f))
    );
    this.draft.update((d) => (d ? { ...d, picks_hechos: d.picks_hechos + 1 } : d));

    // El detalle es lo que pinta el tablero del televisor y la lista de picks
    // del admin. Sin esto, al fichar otro el turno avanzaba y el contador subía,
    // pero el jugador no aparecía hasta el siguiente refresco completo.
    // El catálogo ya trae su nombre, club y escudo, así que no hace falta ir a
    // la red; solo se pregunta si por lo que sea no estuviera.
    const a = this.catalogo().find((x) => x.activo_id === p.activo_id);
    if (!a) { this.cargarDetalle(); return; }
    const fila: PickDetalle = {
      id: p.id,
      activo_id: p.activo_id,
      equipo_falm_id: p.equipo_falm_id,
      ronda: p.ronda,
      orden_seleccion: p.orden_seleccion,
      nombre: a.nombre,
      posicion: a.posicion,
      club: a.club,
      escudo: a.escudo ?? null,
      es_porteria: a.tipo === 'DEFENSA',
    };
    this.detalle.update((v) =>
      [...v.filter((x) => x.id !== p.id), fila].sort((x, y) => x.orden_seleccion - y.orden_seleccion)
    );
  }

  suscribir(): void {
    const d = this.draft();
    if (!d || this.canal) return;
    this.canal = this.sb.client
      .channel(`draft:${d.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'falm', table: 'draft_pick', filter: `draft_id=eq.${d.id}` },
        (m) => this.aplicarPick(m.new as DraftPickFila)
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'falm', table: 'draft_pick', filter: `draft_id=eq.${d.id}` },
        () => this.refrescarPicks()
      )
      // El admin puede corregir el jugador de un pick ya hecho: eso es un UPDATE,
      // y sin esto los demás seguirían viendo al jugador equivocado.
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'falm', table: 'draft_pick', filter: `draft_id=eq.${d.id}` },
        () => this.refrescarPicks()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'falm', table: 'draft', filter: `id=eq.${d.id}` },
        (m) => this.draft.update((x) => (x ? { ...x, estado: (m.new as any).estado } : x))
      )
      .subscribe((estado) => {
        if (estado === 'SUBSCRIBED') {
          this.conectado.set(true);
          this.pararSondeo();
          this.refrescarPicks();
        } else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') {
          this.conectado.set(false);
          this.arrancarSondeo();
        }
      });
  }

  desuscribir(): void {
    this.pararSondeo();
    if (this.canal) {
      this.sb.client.removeChannel(this.canal);
      this.canal = null;
    }
  }

  private arrancarSondeo() {
    if (this.sondeo) return;
    this.sondeo = setInterval(() => this.refrescarPicks(), 5000);
  }

  private pararSondeo() {
    if (this.sondeo) {
      clearInterval(this.sondeo);
      this.sondeo = null;
    }
  }

  /** Ficha un activo. equipoId solo se pasa desde el panel de admin. */
  async fichar(activoId: string, equipoId?: string): Promise<void> {
    const d = this.draft();
    const eq = equipoId ?? this.miEquipoId();
    if (!d || !eq) throw new Error('No hay draft o equipo.');
    const { error } = await this.sb.client.rpc('draft_pick', {
      p_draft: d.id,
      p_activo: activoId,
      p_equipo: eq,
    });
    if (error) throw new Error(this.traducir(error.message));
    await this.refrescarPicks();
    await this.quitarCola(activoId).catch(() => {});
  }

  /**
   * Cambia el jugador de un pick ya hecho, sin tocar el equipo ni el turno.
   * Solo admin: la guardia está en la función de Postgres.
   */
  async corregirPick(pickId: string, activoId: string): Promise<void> {
    const { error } = await this.sb.client.rpc('draft_pick_corregir', {
      p_pick: pickId,
      p_activo: activoId,
    });
    if (error) throw new Error(this.traducir(error.message));
    await this.refrescarPicks();
  }

  /**
   * Borra un pick concreto y reabre su turno. Ojo: si es del medio, el turno en
   * curso retrocede hasta ahí, porque el turno es el primero sin completar.
   */
  async anularPick(pickId: string): Promise<void> {
    const { error } = await this.sb.client.rpc('draft_pick_anular', { p_pick: pickId });
    if (error) throw new Error(this.traducir(error.message));
    await this.refrescarPicks();
  }

  /** Los mensajes de Postgres, en cristiano. */
  private traducir(msg: string): string {
    const m = msg.toLowerCase();
    if (m.includes('ya fue elegido')) return 'Te lo han quitado hace un segundo.';
    if (m.includes('no es el turno')) return 'Ya no es tu turno.';
    if (m.includes('no está disponible')) return 'Ese jugador no está disponible.';
    if (m.includes('nombre de otro equipo')) return 'No puedes fichar por otro equipo.';
    return msg;
  }

  async agregarCola(activoId: string): Promise<void> {
    const d = this.draft();
    const yo = this.miEquipoId();
    if (!d || !yo) return;
    const prio = (this.cola().at(-1)?.prioridad ?? 0) + 1;
    const { error } = await this.sb.client
      .from('draft_wishlist')
      .insert({ draft_id: d.id, equipo_falm_id: yo, activo_id: activoId, prioridad: prio });
    if (error) throw error;
    this.cola.update((c) => [...c, { activo_id: activoId, prioridad: prio }]);
  }

  async quitarCola(activoId: string): Promise<void> {
    const d = this.draft();
    const yo = this.miEquipoId();
    if (!d || !yo) return;
    const { error } = await this.sb.client
      .from('draft_wishlist')
      .delete()
      .eq('draft_id', d.id)
      .eq('equipo_falm_id', yo)
      .eq('activo_id', activoId);
    if (error) throw error;
    this.cola.update((c) => c.filter((x) => x.activo_id !== activoId));
  }

  /** Sube (-1) o baja (+1) un elemento de la cola y reescribe las prioridades. */
  async moverCola(activoId: string, delta: number): Promise<void> {
    const d = this.draft();
    const yo = this.miEquipoId();
    if (!d || !yo) return;
    const items = [...this.cola()];
    const i = items.findIndex((x) => x.activo_id === activoId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    const filas = items.map((x, k) => ({
      draft_id: d.id,
      equipo_falm_id: yo,
      activo_id: x.activo_id,
      prioridad: k + 1,
    }));
    // Un solo upsert = una transacción: el unique diferido se valida al commit.
    const { error } = await this.sb.client
      .from('draft_wishlist')
      .upsert(filas, { onConflict: 'draft_id,equipo_falm_id,activo_id' });
    if (error) throw error;
    this.cola.set(filas.map((f) => ({ activo_id: f.activo_id, prioridad: f.prioridad })));
  }
}
