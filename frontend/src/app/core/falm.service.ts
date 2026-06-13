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
  ext_id?: number | null;
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
  fecha?: string | null;   // fecha_cierre (para emparejar Liga↔Champions por fin de semana)
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

export interface LlaveLeg { local: string; visitante: string; pl: number; pv: number; }
export interface Llave {
  a: string; b: string;
  legs: LlaveLeg[];
  aggA: number; aggB: number;
  ganador: string | null;
  subtitulo?: string;   // "Final" / "3er y 4º puesto" cuando aplica
}
export interface RondaEliminatoria { ronda: string; llaves: Llave[]; }

export interface ActivoLibre {
  activo_id: string;
  tipo: 'JUGADOR' | 'DEFENSA';
  posicion: string;
  nombre: string;
  club: string;
  precio_mercado: number;
  foto?: string | null;
  escudo?: string | null;
  ext_id?: number | null;
}

export interface ActivoMini { nombre: string; posicion: string; foto?: string | null; escudo?: string | null; }
export interface OfertaIntercambio {
  id: string;
  estado: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA' | 'CANCELADA' | 'EXPIRADA';
  comentario: string | null;
  fecha: string;
  soyOferente: boolean;
  oferente: string;
  receptor: string;
  ofrecidos: ActivoMini[];
  solicitados: ActivoMini[];
}

export type RolAlineacion = 'TITULAR' | 'SUPLENTE_DEFENSA' | 'SUPLENTE_MEDIO' | 'SUPLENTE_DELANTERO' | null;

export interface AlineacionGuardada {
  formacion: string;
  roles: Record<string, RolAlineacion>; // activo_id -> rol
}

export const FORMACIONES = ['5-4-1', '5-3-2', '4-5-1', '4-4-2', '4-3-3', '3-4-3', '3-5-2'];

export interface JornadaLfp { numero: number; descripcion: string; }

export interface PuntosJugador {
  jugador: { id: number; nombre: string; equipo: string; escudo: string; foto: string; posicion: string };
  puntosTotales: number;
  goles: number; golesPenalti: number; asistencias: number; estrellas: number;
  minutosJugados: number; imbatido: boolean;
  tarjetasAmarillas: number; tarjetasRojas: number;
}

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
   * Clasificación calculada desde los enfrentamientos de una competición
   * (Champions / Clausura, que no tienen snapshot en equipo_falm).
   * Aplica el reparto 3 / 2-1 / 1.5-1.5 y agrega V/E/D y puntos a favor/contra.
   */
  async clasificacionCalculada(competicionId: string): Promise<FilaClasificacion[]> {
    const js = await this.jornadas(competicionId);
    const jids = js.map((j) => j.id);
    if (jids.length === 0) return [];

    const { data, error } = await this.sb.client
      .from('enfrentamiento')
      .select('equipo_local_id, equipo_visitante_id, puntos_local, puntos_visitante')
      .in('jornada_falm_id', jids);
    if (error) throw error;
    const filas: any[] = data ?? [];

    const ids = [...new Set(filas.flatMap((f) => [f.equipo_local_id, f.equipo_visitante_id]))];
    const { data: eqs, error: e2 } = await this.sb.client
      .from('equipo_falm').select('id, nombre').in('id', ids);
    if (e2) throw e2;

    type Acc = { id: string; nombre: string; pj: number; pf: number; pc: number;
      v: number; vmin: number; e: number; dmin: number; d: number; pts: number };
    const acc = new Map<string, Acc>();
    for (const q of eqs ?? [])
      acc.set(q.id, { id: q.id, nombre: q.nombre, pj: 0, pf: 0, pc: 0, v: 0, vmin: 0, e: 0, dmin: 0, d: 0, pts: 0 });

    const reparto = (a: number, b: number): [number, number] => {
      const dd = a - b;
      if (dd >= 3) return [3, 0];
      if (dd >= 0.5) return [2, 1];
      if (dd > -0.5) return [1.5, 1.5];
      if (dd > -3) return [1, 2];
      return [0, 3];
    };

    for (const f of filas) {
      if (f.puntos_local == null || f.puntos_visitante == null) continue;
      const L = acc.get(f.equipo_local_id), V = acc.get(f.equipo_visitante_id);
      if (!L || !V) continue;
      const pl = Number(f.puntos_local), pv = Number(f.puntos_visitante);
      const [cl, cv] = reparto(pl, pv);
      L.pj++; V.pj++; L.pf += pl; L.pc += pv; V.pf += pv; V.pc += pl; L.pts += cl; V.pts += cv;
      if (cl === 3) { L.v++; V.d++; }
      else if (cl === 2) { L.vmin++; V.dmin++; }
      else if (cl === 1.5) { L.e++; V.e++; }
      else if (cl === 1) { L.dmin++; V.vmin++; }
      else { L.d++; V.v++; }
    }

    return [...acc.values()]
      .sort((a, b) => b.pts - a.pts || b.pf - a.pf)
      .map((a, i) => ({
        competicion_id: competicionId,
        equipo_falm_id: a.id,
        equipo_nombre: a.nombre,
        posicion: i + 1,
        puntos_clasificacion: +a.pts.toFixed(1),
        puntos_favor: +a.pf.toFixed(1),
        puntos_contra: +a.pc.toFixed(1),
        victorias: a.v,
        victorias_minimas: a.vmin,
        empates: a.e,
        derrotas_minimas: a.dmin,
        derrotas: a.d,
        partidos_jugados: a.pj,
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
          'jugador_lfp:jugador_lfp_id (nombre, apellido, posicion, foto, ext_id, equipo_lfp:equipo_lfp_id (nombre, tla, escudo)), ' +
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
        ext_id: esDefensa ? null : a.jugador_lfp?.ext_id,
      } as ItemPlantilla;
    });
  }

  /** Jornadas de una competición. */
  async jornadas(competicionId: string): Promise<JornadaFalm[]> {
    const { data, error } = await this.sb.client
      .from('jornada_falm')
      .select('id, numero, fecha_cierre')
      .eq('competicion_id', competicionId)
      .order('numero', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((j: any) => ({ id: j.id, numero: j.numero, fecha: j.fecha_cierre }));
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

  /**
   * Cuadro eliminatorio de una competición a doble partido (Champions).
   * Empareja las llaves (ida/vuelta entre el mismo par), agrega los puntos,
   * agrupa por ronda (pares de jornadas) y etiqueta desde el final
   * (Final / Semifinales / Cuartos…), detectando ronda previa y 3er/4º puesto.
   */
  async eliminatorias(competicionId: string): Promise<RondaEliminatoria[]> {
    const js = await this.jornadas(competicionId);
    const jids = js.map((j) => j.id);
    const numById = new Map(js.map((j) => [j.id, j.numero]));
    if (jids.length === 0) return [];

    const { data, error } = await this.sb.client
      .from('enfrentamiento')
      .select('jornada_falm_id, equipo_local_id, equipo_visitante_id, puntos_local, puntos_visitante')
      .in('jornada_falm_id', jids);
    if (error) throw error;
    const filas: any[] = data ?? [];
    if (filas.length === 0) return [];

    const ids = [...new Set(filas.flatMap((f) => [f.equipo_local_id, f.equipo_visitante_id]))];
    const { data: eqs, error: e2 } = await this.sb.client.from('equipo_falm').select('id, nombre').in('id', ids);
    if (e2) throw e2;
    const nombre = new Map((eqs ?? []).map((e: any) => [e.id, e.nombre]));

    // Agrupar en llaves por par de equipos (no ordenado), guardando la jornada mínima.
    type Acc = { a: string; b: string; legs: LlaveLeg[]; aggA: number; aggB: number; minJor: number };
    const llaves = new Map<string, Acc>();
    for (const f of filas) {
      const ln = nombre.get(f.equipo_local_id) ?? '?', vn = nombre.get(f.equipo_visitante_id) ?? '?';
      const [a, b] = [ln, vn].sort();
      const key = a + '||' + b;
      const jor = numById.get(f.jornada_falm_id) ?? 0;
      const pl = Number(f.puntos_local ?? 0), pv = Number(f.puntos_visitante ?? 0);
      let acc = llaves.get(key);
      if (!acc) { acc = { a, b, legs: [], aggA: 0, aggB: 0, minJor: jor }; llaves.set(key, acc); }
      acc.legs.push({ local: ln, visitante: vn, pl, pv });
      acc.aggA += ln === a ? pl : pv;
      acc.aggB += ln === a ? pv : pl;
      acc.minJor = Math.min(acc.minJor, jor);
    }

    // Agrupar llaves por ronda (bucket = pares de jornadas) y ordenar.
    const buckets = new Map<number, Acc[]>();
    for (const acc of llaves.values()) {
      const r = Math.floor((acc.minJor - 1) / 2);
      (buckets.get(r) ?? buckets.set(r, []).get(r)!).push(acc);
    }
    const rondas = [...buckets.entries()].sort((x, y) => x[0] - y[0]).map(([, v]) => v);

    // Etiquetas desde el final entre rondas "principales" (las previas alimentan a una mayor).
    const escalera = ['Final', 'Semifinales', 'Cuartos de final', 'Octavos de final', 'Dieciseisavos de final'];
    const esPrevia = rondas.map((r, i) => i + 1 < rondas.length && r.length < rondas[i + 1].length);
    const principales = rondas.map((_, i) => !esPrevia[i]);
    const idxPrinc = rondas.map((_, i) => i).filter((i) => principales[i]);
    const etiqueta = new Map<number, string>();
    idxPrinc.forEach((rIdx, k) => {
      const desdeFinal = idxPrinc.length - 1 - k;
      etiqueta.set(rIdx, escalera[desdeFinal] ?? `Ronda ${rIdx + 1}`);
    });
    rondas.forEach((_, i) => { if (esPrevia[i]) etiqueta.set(i, 'Ronda previa'); });

    const ganador = (a: Acc): string | null => a.aggA > a.aggB ? a.a : a.aggB > a.aggA ? a.b : null;

    // Para la última ronda: distinguir Final (entre ganadores de la ronda previa) y 3er/4º (perdedores).
    const ultIdx = rondas.length - 1;
    const idxPrevAlFinal = idxPrinc.length >= 2 ? idxPrinc[idxPrinc.length - 2] : -1;
    const ganadoresPrev = new Set<string>();
    if (idxPrevAlFinal >= 0) for (const t of rondas[idxPrevAlFinal]) { const g = ganador(t); if (g) ganadoresPrev.add(g); }

    return rondas.map((r, i) => {
      const llavesR: Llave[] = r.map((t) => ({ a: t.a, b: t.b, legs: t.legs, aggA: t.aggA, aggB: t.aggB, ganador: ganador(t) }));
      const titulo = etiqueta.get(i) ?? `Ronda ${i + 1}`;
      // En la última ronda: la llave entre los ganadores de la semifinal es la Final; la otra, 3er/4º puesto.
      if (i === ultIdx && llavesR.length === 2 && ganadoresPrev.size === 2) {
        for (const l of llavesR) {
          l.subtitulo = ganadoresPrev.has(l.a) && ganadoresPrev.has(l.b) ? 'Final' : '3er y 4º puesto';
        }
        llavesR.sort((x, y) => (x.subtitulo === 'Final' ? -1 : 1) - (y.subtitulo === 'Final' ? -1 : 1));
      }
      return { ronda: titulo, llaves: llavesR };
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

  /**
   * Última alineación guardada por el equipo DENTRO de una competición
   * (la más reciente por número de jornada, opcionalmente anterior a `antesDe`).
   * Sirve de "alineación por defecto" / "repetir última": se hereda si no hay
   * alineación para la jornada actual — igual que hace el sistema al cerrar la jornada.
   */
  async ultimaAlineacion(equipoId: string, competicionId?: string, antesDe?: number): Promise<AlineacionGuardada | null> {
    const { data, error } = await this.sb.client
      .from('alineacion')
      .select('formacion, jornada_falm:jornada_falm_id!inner (numero, competicion_id), alineacion_activo(activo_id, rol)')
      .eq('equipo_falm_id', equipoId);
    if (error) throw error;
    let filas: any[] = data ?? [];
    if (competicionId) filas = filas.filter((f) => f.jornada_falm?.competicion_id === competicionId);
    if (antesDe != null) filas = filas.filter((f) => (f.jornada_falm?.numero ?? 0) < antesDe);
    if (filas.length === 0) return null;
    filas.sort((a, b) => (b.jornada_falm?.numero ?? 0) - (a.jornada_falm?.numero ?? 0));
    const top = filas[0];
    const roles: Record<string, RolAlineacion> = {};
    for (const aa of top.alineacion_activo ?? []) roles[aa.activo_id] = aa.rol;
    return { formacion: top.formacion, roles };
  }

  /**
   * Copia la alineación de LIGA del MISMO fin de semana LFP a otra competición.
   * Empareja la jornada destino con la jornada de Liga cuya fecha está más cerca
   * (equivale a "misma jornada LFP" del sistema viejo, que /partidos ya no expone).
   */
  async copiarDesdeLiga(equipoId: string, fechaDestino?: string | null): Promise<AlineacionGuardada | null> {
    const comps = await this.competiciones();
    const liga = comps.find((c) => c.tipo === 'LIGA');
    if (!liga) return null;
    const js = await this.jornadas(liga.id);
    if (js.length === 0) return null;
    let ligaJornada = js[js.length - 1];
    if (fechaDestino) {
      const t = new Date(fechaDestino).getTime();
      ligaJornada = js.reduce((best, j) => {
        if (!j.fecha) return best;
        return Math.abs(new Date(j.fecha).getTime() - t) < Math.abs(new Date(best.fecha ?? 0).getTime() - t) ? j : best;
      }, js[0]);
    }
    return this.getAlineacion(equipoId, ligaJornada.id);
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

  /** Ranking de beneficios (premios) de todos los equipos. */
  async rankingBeneficios(): Promise<{ nombre: string; beneficio: number }[]> {
    const { data, error } = await this.sb.client
      .from('equipo_falm')
      .select('nombre, beneficio')
      .order('beneficio', { ascending: false });
    if (error) throw error;
    return (data ?? []) as { nombre: string; beneficio: number }[];
  }

  /** Jornadas LFP válidas (para el selector de estadísticas). */
  async jornadasLfp(): Promise<JornadaLfp[]> {
    const { data, error } = await this.sb.client.rpc('jornadas_lfp_validas');
    if (error) throw error;
    return ((data ?? []) as JornadaLfp[]).sort((a, b) => b.numero - a.numero);
  }

  /** Puntos + estadísticas de cada jugador en una jornada LFP (en vivo). */
  async puntuacionesJornada(lfp: number): Promise<PuntosJugador[]> {
    const { data, error } = await this.sb.client.rpc('puntuaciones_jornada', { p_lfp: lfp });
    if (error) throw error;
    return (data ?? []) as PuntosJugador[];
  }

  /** Despierta el backend (dyno) al abrir la app, para que las RPC en vivo vayan rápidas. */
  warmup(): void { this.sb.client.rpc('warmup').then(() => {}, () => {}); }

  /** Historial por jornada de un jugador (en vivo del backend). */
  async jugadorJornadas(id: number): Promise<any[]> {
    const { data, error } = await this.sb.client.rpc('jugador_jornadas', { p_id: id });
    if (error) throw error;
    return (data ?? []) as any[];
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

  /** Equipos FALM de la temporada activa (para elegir rival en intercambios). */
  async equiposFalm(excluirId?: string): Promise<{ id: string; nombre: string }[]> {
    const { data, error } = await this.sb.client
      .from('equipo_falm')
      .select('id, nombre, temporada!inner(activa)')
      .eq('temporada.activa', true)
      .order('nombre', { ascending: true });
    if (error) throw error;
    return (data ?? []).filter((e: any) => e.id !== excluirId).map((e: any) => ({ id: e.id, nombre: e.nombre }));
  }

  /** Crea una oferta de intercambio (escritura; RLS dueño del oferente). Expira a 7 días. */
  async crearOferta(
    oferenteId: string, receptorId: string,
    ofrecidos: string[], solicitados: string[], comentario: string
  ): Promise<void> {
    const { data: of, error } = await this.sb.client
      .from('oferta_intercambio')
      .insert({ equipo_oferente_id: oferenteId, equipo_receptor_id: receptorId, estado: 'PENDIENTE', comentario })
      .select('id')
      .single();
    if (error) throw error;
    const filas = [
      ...ofrecidos.map((activo_id) => ({ oferta_id: (of as any).id, activo_id, tipo: 'OFRECIDO' })),
      ...solicitados.map((activo_id) => ({ oferta_id: (of as any).id, activo_id, tipo: 'SOLICITADO' })),
    ];
    const { error: e2 } = await this.sb.client.from('oferta_activo').insert(filas);
    if (e2) throw e2;
  }

  /** Ofertas de intercambio donde el equipo es oferente o receptor, con activos y nombres. */
  async ofertas(equipoId: string): Promise<OfertaIntercambio[]> {
    const { data, error } = await this.sb.client
      .from('oferta_intercambio')
      .select(
        'id, estado, comentario, fecha_creacion, equipo_oferente_id, equipo_receptor_id, ' +
        'oferente:equipo_oferente_id (nombre), receptor:equipo_receptor_id (nombre), ' +
        'oferta_activo (tipo, activo:activo_id (id, tipo, ' +
          'jugador_lfp:jugador_lfp_id (nombre, apellido, posicion, foto, equipo_lfp:equipo_lfp_id (escudo)), ' +
          'equipo_lfp:equipo_lfp_id (nombre, escudo)))'
      )
      .or(`equipo_oferente_id.eq.${equipoId},equipo_receptor_id.eq.${equipoId}`)
      .order('fecha_creacion', { ascending: false });
    if (error) throw error;
    const mapAct = (a: any) => {
      const def = a.tipo === 'DEFENSA';
      return {
        nombre: def ? `Defensa ${a.equipo_lfp?.nombre ?? ''}`.trim()
          : `${a.jugador_lfp?.nombre ?? ''} ${a.jugador_lfp?.apellido ?? ''}`.trim(),
        posicion: def ? 'PORTERO' : a.jugador_lfp?.posicion,
        foto: def ? null : a.jugador_lfp?.foto,
        escudo: def ? a.equipo_lfp?.escudo : a.jugador_lfp?.equipo_lfp?.escudo,
      };
    };
    return (data ?? []).map((o: any) => ({
      id: o.id,
      estado: o.estado,
      comentario: o.comentario,
      fecha: o.fecha_creacion,
      soyOferente: o.equipo_oferente_id === equipoId,
      oferente: o.oferente?.nombre ?? '?',
      receptor: o.receptor?.nombre ?? '?',
      ofrecidos: (o.oferta_activo ?? []).filter((x: any) => x.tipo === 'OFRECIDO').map((x: any) => mapAct(x.activo)),
      solicitados: (o.oferta_activo ?? []).filter((x: any) => x.tipo === 'SOLICITADO').map((x: any) => mapAct(x.activo)),
    }));
  }

  /** Responde a una oferta (ACEPTADA/RECHAZADA/CANCELADA). Escritura; RLS. */
  async responderOferta(id: string, estado: 'ACEPTADA' | 'RECHAZADA' | 'CANCELADA'): Promise<void> {
    const { error } = await this.sb.client
      .from('oferta_intercambio')
      .update({ estado, fecha_respuesta: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  /** Fichajes extra por lesión de un equipo (con el nombre del lesionado). */
  async fichajesExtra(equipoId: string): Promise<{ id: string; lesionado: string; url: string | null; usado: boolean }[]> {
    const { data, error } = await this.sb.client
      .from('fichaje_extra')
      .select('id, url_noticia, usado, activo:activo_lesionado_id (tipo, ' +
        'jugador_lfp:jugador_lfp_id (nombre, apellido), equipo_lfp:equipo_lfp_id (nombre))')
      .eq('equipo_falm_id', equipoId)
      .order('fecha_solicitud', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((f: any) => {
      const a = f.activo;
      const def = a?.tipo === 'DEFENSA';
      return {
        id: f.id,
        lesionado: def ? `Defensa ${a?.equipo_lfp?.nombre ?? ''}`.trim()
          : `${a?.jugador_lfp?.nombre ?? ''} ${a?.jugador_lfp?.apellido ?? ''}`.trim(),
        url: f.url_noticia,
        usado: f.usado,
      };
    });
  }

  /** Solicita un fichaje extra por lesión (escritura; RLS dueño). */
  async crearFichajeExtra(equipoId: string, activoLesionadoId: string, url: string): Promise<void> {
    const { error } = await this.sb.client
      .from('fichaje_extra')
      .insert({ equipo_falm_id: equipoId, activo_lesionado_id: activoLesionadoId, url_noticia: url || null, usado: false });
    if (error) throw error;
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
