import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { SupabaseService } from './supabase.service';

/** Fila de la vista falm.v_clasificacion. */
export interface FilaClasificacion {
  competicion_id: string;
  equipo_falm_id: string;
  partidos_jugados: number;
  puntos_clasificacion: number;
  puntos_favor: number;
  puntos_contra: number;
  victorias: number;
  victorias_minimas: number;
  empates: number;
  derrotas_minimas: number;
  derrotas: number;
  posicion: number;
  // nombre del equipo (via join en la query)
  equipo_nombre?: string;
}

export interface Competicion {
  id: string;
  tipo: 'LIGA' | 'CHAMPIONS' | 'CLAUSURA';
  nombre: string;
}

export interface Equipo {
  id: string;
  nombre: string;
  presupuesto: number;
  beneficio?: number;
}

export interface ItemPlantilla {
  activo_id: string;
  tipo: 'JUGADOR' | 'DEFENSA';
  posicion: 'PORTERO' | 'DEFENSA' | 'MEDIO' | 'DELANTERO';
  nombre: string;       // jugador real o "Defensa <Club>" para porteros virtuales
  club: string;         // equipo LFP
  precio: number;
  foto?: string | null;
  escudo?: string | null;
}

export interface PremioItem {
  tipo: string;
  posicion: number;
  importe: number;
  pagado: boolean;
  concepto: string;     // "Jornada N" o nombre de competición
}

export interface JornadaFalm {
  id: string;
  numero: number;
}

export interface EnfrentamientoFila {
  enfrentamiento_id: string;
  equipo_local: string;
  equipo_visitante: string;
  puntos_local: number;
  puntos_visitante: number;
  puntos_clasif_local: number;
  puntos_clasif_visitante: number;
  jornada_jugada: boolean;
}

export interface ActivoLibre {
  activo_id: string;
  tipo: 'JUGADOR' | 'DEFENSA';
  posicion: string;
  nombre: string;
  club: string;
  precio_mercado: number;
  foto?: string | null;
  escudo?: string | null;
}

export type RolAlineacion = 'TITULAR' | 'SUPLENTE_DEFENSA' | 'SUPLENTE_MEDIO' | 'SUPLENTE_DELANTERO' | null;

export interface AlineacionGuardada {
  formacion: string;
  roles: Record<string, RolAlineacion>; // activo_id -> rol
}

export const FORMACIONES = ['5-4-1', '5-3-2', '4-5-1', '4-4-2', '4-3-3', '3-4-3', '3-5-2'];

/** Acceso de lectura al schema falm. Las mutaciones críticas van por RPC/Edge (no aquí). */
@Injectable({ providedIn: 'root' })
export class FalmService {
  constructor(private sb: SupabaseService) {}

  /** Competiciones de la temporada activa. */
  async competiciones(): Promise<Competicion[]> {
    const { data, error } = await this.sb.client
      .from('competicion')
      .select('id, tipo, nombre, temporada!inner(activa)')
      .eq('temporada.activa', true);
    if (error) throw error;
    return (data ?? []).map((c: any) => ({ id: c.id, tipo: c.tipo, nombre: c.nombre }));
  }

  /**
   * Clasificación: stats reales importados de producción (snapshot en equipo_falm),
   * ordenados por puntos. (En producción V2 con pipeline jugado se usaría v_clasificacion.)
   */
  async clasificacion(competicionId: string): Promise<FilaClasificacion[]> {
    const { data, error } = await this.sb.client
      .from('equipo_falm')
      .select('id, nombre, puntos_clasif, puntos_totales, puntos_contra, victorias, victorias_min, empates, derrotas_min, derrotas')
      .order('puntos_clasif', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((e: any, i: number) => ({
      competicion_id: competicionId,
      equipo_falm_id: e.id,
      equipo_nombre: e.nombre,
      posicion: i + 1,
      puntos_clasificacion: e.puntos_clasif,
      puntos_favor: e.puntos_totales,
      puntos_contra: e.puntos_contra,
      victorias: e.victorias,
      victorias_minimas: e.victorias_min,
      empates: e.empates,
      derrotas_minimas: e.derrotas_min,
      derrotas: e.derrotas,
      partidos_jugados: e.victorias + e.victorias_min + e.empates + e.derrotas_min + e.derrotas,
    }));
  }

  /**
   * El equipo del usuario en la temporada activa.
   * En modo dev (environment.devEquipoNombre) se fija un equipo por nombre, para
   * poder ver Mi plantilla / Mis premios sin asociar usuarios reales.
   */
  async miEquipo(): Promise<Equipo | null> {
    let q = this.sb.client
      .from('equipo_falm')
      .select('id, nombre, presupuesto, beneficio, temporada!inner(activa)')
      .eq('temporada.activa', true);

    if (environment.devEquipoNombre) {
      q = q.eq('nombre', environment.devEquipoNombre);
    } else {
      const { data: u } = await this.sb.client.auth.getUser();
      if (!u.user) return null;
      q = q.eq('usuario_id', u.user.id);
    }

    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return data
      ? { id: data.id, nombre: data.nombre, presupuesto: data.presupuesto, beneficio: data.beneficio }
      : null;
  }

  /** Plantilla actual (sin baja) de un equipo, con datos del activo embebidos. */
  async miPlantilla(equipoId: string): Promise<ItemPlantilla[]> {
    const { data, error } = await this.sb.client
      .from('plantilla')
      .select(
        'precio, activo:activo_id (id, tipo, ' +
          'jugador_lfp:jugador_lfp_id (nombre, apellido, posicion, foto, equipo_lfp:equipo_lfp_id (nombre, tla, escudo)), ' +
          'equipo_lfp:equipo_lfp_id (nombre, tla, escudo))'
      )
      .eq('equipo_falm_id', equipoId)
      .is('fecha_baja', null);
    if (error) throw error;
    return (data ?? []).map((p: any) => {
      const a = p.activo;
      const esDefensa = a.tipo === 'DEFENSA';
      return {
        activo_id: a.id,
        tipo: a.tipo,
        posicion: esDefensa ? 'PORTERO' : a.jugador_lfp?.posicion,
        nombre: esDefensa
          ? `Defensa ${a.equipo_lfp?.nombre ?? ''}`.trim()
          : `${a.jugador_lfp?.nombre ?? ''} ${a.jugador_lfp?.apellido ?? ''}`.trim(),
        club: esDefensa ? a.equipo_lfp?.nombre ?? '' : a.jugador_lfp?.equipo_lfp?.nombre ?? '',
        precio: p.precio,
        foto: esDefensa ? null : a.jugador_lfp?.foto,
        escudo: esDefensa ? a.equipo_lfp?.escudo : a.jugador_lfp?.equipo_lfp?.escudo,
      } as ItemPlantilla;
    });
  }

  /** Jornadas de una competición. */
  async jornadas(competicionId: string): Promise<JornadaFalm[]> {
    const { data, error } = await this.sb.client
      .from('jornada_falm')
      .select('id, numero')
      .eq('competicion_id', competicionId)
      .order('numero', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  /** Enfrentamientos de una jornada (puntos reales importados) + reparto 3/2/1.5. */
  async enfrentamientos(jornadaFalmId: string): Promise<EnfrentamientoFila[]> {
    const { data, error } = await this.sb.client
      .from('enfrentamiento')
      .select('id, equipo_local_id, equipo_visitante_id, puntos_local, puntos_visitante')
      .eq('jornada_falm_id', jornadaFalmId);
    if (error) throw error;
    const filas: any[] = data ?? [];
    if (filas.length === 0) return [];

    const ids = [...new Set(filas.flatMap((f) => [f.equipo_local_id, f.equipo_visitante_id]))];
    const { data: eqs, error: e2 } = await this.sb.client
      .from('equipo_falm')
      .select('id, nombre')
      .in('id', ids);
    if (e2) throw e2;
    const n = new Map((eqs ?? []).map((e: any) => [e.id, e.nombre]));

    const reparto = (a: number, b: number): [number, number] => {
      const d = a - b;
      if (d >= 3) return [3, 0];
      if (d >= 0.5) return [2, 1];
      if (d > -0.5) return [1.5, 1.5];
      if (d > -3) return [1, 2];
      return [0, 3];
    };

    return filas.map((f) => {
      const pl = Number(f.puntos_local ?? 0), pv = Number(f.puntos_visitante ?? 0);
      const [cl, cv] = reparto(pl, pv);
      return {
        enfrentamiento_id: f.id,
        equipo_local: n.get(f.equipo_local_id) ?? '?',
        equipo_visitante: n.get(f.equipo_visitante_id) ?? '?',
        puntos_local: pl,
        puntos_visitante: pv,
        puntos_clasif_local: cl,
        puntos_clasif_visitante: cv,
        jornada_jugada: f.puntos_local != null,
      };
    });
  }

  /** Jornada de liga a editar (demo: la primera de la temporada). */
  async jornadaActualLiga(): Promise<JornadaFalm | null> {
    const comps = await this.competiciones();
    const liga = comps.find((c) => c.tipo === 'LIGA') ?? comps[0];
    if (!liga) return null;
    const js = await this.jornadas(liga.id);
    return js[0] ?? null;
  }

  /** Alineación guardada de un equipo en una jornada (con roles por activo). */
  async getAlineacion(equipoId: string, jornadaFalmId: string): Promise<AlineacionGuardada | null> {
    const { data, error } = await this.sb.client
      .from('alineacion')
      .select('formacion, alineacion_activo(activo_id, rol)')
      .eq('equipo_falm_id', equipoId)
      .eq('jornada_falm_id', jornadaFalmId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const roles: Record<string, RolAlineacion> = {};
    for (const aa of (data as any).alineacion_activo ?? []) roles[aa.activo_id] = aa.rol;
    return { formacion: (data as any).formacion, roles };
  }

  /** Guarda la alineación (escritura; requiere ser dueño del equipo por RLS). */
  async guardarAlineacion(
    equipoId: string,
    jornadaFalmId: string,
    formacion: string,
    roles: Record<string, RolAlineacion>
  ): Promise<void> {
    const { data: ali, error } = await this.sb.client
      .from('alineacion')
      .upsert(
        { equipo_falm_id: equipoId, jornada_falm_id: jornadaFalmId, formacion },
        { onConflict: 'equipo_falm_id,jornada_falm_id' }
      )
      .select('id')
      .single();
    if (error) throw error;

    await this.sb.client.from('alineacion_activo').delete().eq('alineacion_id', (ali as any).id);
    const filas = Object.entries(roles)
      .filter(([, r]) => !!r)
      .map(([activo_id, rol], i) => ({ alineacion_id: (ali as any).id, activo_id, rol, orden: i + 1 }));
    if (filas.length) {
      const { error: e2 } = await this.sb.client.from('alineacion_activo').insert(filas);
      if (e2) throw e2;
    }
  }

  /** Mercado: activos libres en la temporada activa. */
  async mercadoLibre(): Promise<ActivoLibre[]> {
    const { data, error } = await this.sb.client
      .from('v_activo_libre')
      .select('*')
      .order('precio_mercado', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ActivoLibre[];
  }

  /** Crea una petición de fichaje con opciones por prioridad (escritura; RLS dueño). */
  async crearPeticion(
    equipoId: string,
    jornadaObjetivoId: string,
    opciones: { activo_id: string; prioridad: number }[]
  ): Promise<void> {
    const { data: pet, error } = await this.sb.client
      .from('peticion_fichaje')
      .insert({ equipo_falm_id: equipoId, jornada_objetivo_id: jornadaObjetivoId, estado: 'PENDIENTE' })
      .select('id')
      .single();
    if (error) throw error;
    const filas = opciones.map((o) => ({ peticion_id: (pet as any).id, activo_id: o.activo_id, prioridad: o.prioridad }));
    const { error: e2 } = await this.sb.client.from('peticion_fichaje_opcion').insert(filas);
    if (e2) throw e2;
  }

  /** Premios ganados por un equipo. */
  async misPremios(equipoId: string): Promise<PremioItem[]> {
    const { data, error } = await this.sb.client
      .from('premio')
      .select('tipo, posicion, importe, pagado, jornada_falm:jornada_falm_id (numero), competicion:competicion_id (nombre)')
      .eq('equipo_falm_id', equipoId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((p: any) => ({
      tipo: p.tipo,
      posicion: p.posicion,
      importe: p.importe,
      pagado: p.pagado,
      concepto: p.jornada_falm ? `Jornada ${p.jornada_falm.numero}` : p.competicion?.nombre ?? p.tipo,
    }));
  }
}
