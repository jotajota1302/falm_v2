import { Injectable } from '@angular/core';
import { SupabaseService } from '../../core/supabase.service';

/**
 * Servicio del panel de administración. AISLADO a propósito (no usa FalmService)
 * para poder extraerse a una app de admin independiente en el futuro.
 * Lectura directa del schema falm; las mutaciones reales requieren rol ADMIN/GESTOR
 * (RLS) o service_role — en modo demo se interceptan en los componentes.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private sb: SupabaseService) {}

  // ---- Jugadores (catálogo) -------------------------------------------------
  async jugadores(): Promise<AdminJugador[]> {
    const { data, error } = await this.sb.client
      .from('activo')
      .select('id, precio_mercado, jugador_lfp:jugador_lfp_id!inner (id, nombre, apellido, posicion, ext_id, dorsal, primer_equipo, equipo_lfp_id, equipo_lfp:equipo_lfp_id (nombre, escudo))')
      .eq('tipo', 'JUGADOR')
      .order('precio_mercado', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((a: any) => ({
      activoId: a.id,
      jugadorLfpId: a.jugador_lfp.id,
      nombre: `${a.jugador_lfp.nombre ?? ''} ${a.jugador_lfp.apellido ?? ''}`.trim(),
      pila: a.jugador_lfp.nombre ?? '',
      apellido: a.jugador_lfp.apellido ?? '',
      posicion: a.jugador_lfp.posicion,
      club: a.jugador_lfp.equipo_lfp?.nombre ?? '',
      clubId: a.jugador_lfp.equipo_lfp_id ?? '',
      escudo: a.jugador_lfp.equipo_lfp?.escudo ?? null,
      dorsal: a.jugador_lfp.dorsal ?? null,
      primerEquipo: a.jugador_lfp.primer_equipo === true,
      precio: Number(a.precio_mercado ?? 0),
    }));
  }

  /**
   * Edición completa del jugador. Ojo: nombre, apellido, club y dorsal los
   * sobrescribe el scraper en la siguiente ingesta del catálogo; posición y
   * primer_equipo son nuestros y se respetan.
   */
  async actualizarJugador(j: EdicionJugador): Promise<void> {
    const { error: e2 } = await this.sb.client.from('jugador_lfp').update({
      nombre: j.pila,
      apellido: j.apellido,
      posicion: j.posicion,
      equipo_lfp_id: j.clubId || null,
      dorsal: j.dorsal,
      primer_equipo: j.primerEquipo,
    }).eq('id', j.jugadorLfpId);
    if (e2) throw e2;
  }

  /** Clubes de LaLiga, para el selector de club del jugador. */
  async clubes(): Promise<{ id: string; nombre: string }[]> {
    const { data, error } = await this.sb.client
      .from('equipo_lfp').select('id, nombre').order('nombre', { ascending: true });
    if (error) throw error;
    return (data ?? []) as { id: string; nombre: string }[];
  }

  /** Jornadas FALM de la temporada activa, con lo ya procesado de cada una. */
  async jornadasFalm(): Promise<JornadaAdmin[]> {
    const { data, error } = await this.sb.client
      .from('jornada_falm')
      .select('id, numero, fecha_cierre, fichajes_procesados_en, alineaciones_heredadas_en, ' +
        'competicion:competicion_id!inner (tipo, temporada:temporada_id!inner (activa))')
      .eq('competicion.temporada.activa', true)
      .order('numero', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((j: any) => ({
      id: j.id,
      numero: j.numero,
      competicion: j.competicion?.tipo ?? '',
      fechaCierre: j.fecha_cierre,
      fichajesProcesados: j.fichajes_procesados_en,
      alineacionesHeredadas: j.alineaciones_heredadas_en,
    }));
  }

  /** Tareas automáticas: horario, si están activas y cuándo corrieron. */
  // ---- Puntuaciones de LaLiga -----------------------------------------------
  // Normalmente lo hace el cron cada hora. Esto es el "hazlo ahora" para cuando
  // falla, o para releer una jornada si la prensa cambió una valoración.

  /** Cada cuántas horas mira el sistema si hay jornada que puntuar (0 = parado). */
  async configurarCronPuntuaciones(cadaHoras: number, activo: boolean): Promise<void> {
    const { error } = await this.sb.client.rpc('configurar_cron_puntuaciones', {
      p_cada_horas: cadaHoras,
      p_activo: activo,
    });
    if (error) throw error;
  }

  async estadoJornadasLfp(): Promise<JornadaLfpEstado[]> {
    const { data, error } = await this.sb.client.rpc('estado_jornadas_lfp');
    if (error) throw error;
    return (data ?? []) as JornadaLfpEstado[];
  }

  async leerPuntuaciones(jornada: number, sobrescribir: boolean): Promise<IngestaResultado> {
    // El año no se pasa: lo resuelve el servidor con temporada.anio_scrape. Es el
    // de FIN de temporada (2027 para la 2026-27) y mandarlo a mano ya costó una
    // ingesta entera de la temporada anterior.
    const { data, error } = await this.sb.client.rpc('ingestar_jornada_ff', {
      p_jornada: jornada,
      p_sobreescribir: sobrescribir,
    });
    if (error) throw error;
    return data as IngestaResultado;
  }

  // ---- Copias de seguridad --------------------------------------------------
  // Restaurar NO está en el panel a propósito: se hace por SQL, que obliga a
  // pensarlo dos veces. Ver tools/sql/respaldos.sql.

  async respaldos(): Promise<Respaldo[]> {
    const { data, error } = await this.sb.client.rpc('respaldos');
    if (error) throw error;
    return (data ?? []) as Respaldo[];
  }

  async crearRespaldo(etiqueta: string): Promise<Respaldo> {
    const { data, error } = await this.sb.client.rpc('respaldo_crear', { p_etiqueta: etiqueta });
    if (error) throw error;
    return data as Respaldo;
  }

  async borrarRespaldo(schema: string): Promise<void> {
    const { error } = await this.sb.client.rpc('respaldo_borrar', { p_schema: schema });
    if (error) throw error;
  }

  async estadoCrons(): Promise<CronAdmin[]> {
    const { data, error } = await this.sb.client.rpc('estado_crons');
    if (error) throw error;
    const d = typeof data === 'string' ? JSON.parse(data) : data;
    return (Array.isArray(d) ? d : []) as CronAdmin[];
  }

  /** Renombrar un equipo FALM. El presupuesto ya no se usa: se juega por número de jugadores. */
  async actualizarEquipo(id: string, nombre: string): Promise<void> {
    const { error } = await this.sb.client
      .from('equipo_falm').update({ nombre: nombre.trim() }).eq('id', id);
    if (error) throw error;
  }

  // ---- Equipos FALM ---------------------------------------------------------
  async equipos(): Promise<AdminEquipo[]> {
    const { data, error } = await this.sb.client
      .from('equipo_falm')
      .select('id, nombre, presupuesto, beneficio, usuario_id, temporada!inner(activa), plantilla(count)')
      .eq('temporada.activa', true)
      .order('nombre', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((e: any) => ({
      id: e.id,
      nombre: e.nombre,
      presupuesto: Number(e.presupuesto ?? 0),
      beneficio: Number(e.beneficio ?? 0),
      usuarioId: e.usuario_id ?? null,
      jugadores: e.plantilla?.[0]?.count ?? 0,
    }));
  }

  // ---- Puntuaciones por jornada (lectura en vivo del backend) ---------------
  async jornadasLfp(): Promise<{ numero: number; descripcion: string }[]> {
    const { data, error } = await this.sb.client.rpc('jornadas_lfp_validas');
    if (error) throw error;
    return ((data ?? []) as any[]).sort((a, b) => b.numero - a.numero);
  }

  async puntuaciones(lfp: number): Promise<AdminPuntuacion[]> {
    const { data, error } = await this.sb.client.rpc('puntuaciones_jornada', { p_lfp: lfp });
    if (error) throw error;
    return ((data ?? []) as any[]).map((p) => ({
      id: p.jugador?.id,
      nombre: p.jugador?.nombre ?? '?',
      equipo: p.jugador?.equipo ?? '',
      posicion: p.jugador?.posicion ?? '',
      puntos: Number(p.puntosTotales ?? 0),
      tipo: p.tipo ?? 'AUTOMATICO',
      goles: Number(p.goles ?? 0),
      asistencias: Number(p.asistencias ?? 0),
      // el desglose entero, para poder verlo y corregirlo concepto a concepto
      resultado: p.resultado ?? '',
      minutos: Number(p.minutosJugados ?? 0),
      estrellas: Number(p.estrellas ?? 0),
      golesPenalti: Number(p.golesPenalti ?? 0),
      penaltiFallado: Number(p.penaltiFallado ?? 0),
      penaltiParado: Number(p.penaltiParado ?? 0),
      golesEnPropia: Number(p.golesEnPropia ?? 0),
      golesEnContra: Number(p.golesEnContra ?? 0),
      tarjetasRojas: Number(p.tarjetasRojas ?? 0),
      imbatido: !!p.imbatido,
      explicacion: (p.explicacion?.lineas ?? []) as LineaPuntos[],
    }));
  }

  /**
   * Corrige los conceptos de una puntuación: el total lo recalcula el baremo del
   * servidor, para que el número y su explicación no puedan separarse. Solo se
   * mandan los campos que cambian.
   */
  async editarDesglose(ext: number, lfp: number, cambios: Record<string, any>): Promise<number> {
    const { data, error } = await this.sb.client.rpc('editar_desglose', {
      p_ext: ext, p_lfp: lfp, p_cambios: cambios,
    });
    if (error) throw error;
    return Number((data as any)?.puntos ?? 0);
  }

  // ---- Operaciones de liga (RPC de mutación; requieren rol/permiso) ----------
  async ejecutar(rpc: string, params: Record<string, any> = {}): Promise<any> {
    const { data, error } = await this.sb.client.rpc(rpc, params);
    if (error) throw error;
    return data;
  }

  // ---- Pretemporada ---------------------------------------------------------
  async temporadas(): Promise<AdminTemporada[]> {
    const { data, error } = await this.sb.client
      .from('temporada').select('id, nombre, anio_inicio, activa').order('anio_inicio', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((t: any) => ({ id: t.id, nombre: t.nombre, anio: t.anio_inicio, activa: t.activa }));
  }

  /** Qué hay hecho ya de la pretemporada, para no regenerar por encima. */
  async estadoPretemporada(temporadaId: string): Promise<EstadoPretemporada> {
    const { data, error } = await this.sb.client.rpc('estado_pretemporada', { p_temporada: temporadaId });
    if (error) throw error;
    return (typeof data === 'string' ? JSON.parse(data) : data) as EstadoPretemporada;
  }

  /** Calendario de la liga con sus cruces, para editarlo jornada a jornada. */
  async calendarioLiga(temporadaId: string): Promise<JornadaCalendario[]> {
    const { data, error } = await this.sb.client.rpc('calendario_liga', { p_temporada: temporadaId });
    if (error) throw error;
    const d = typeof data === 'string' ? JSON.parse(data) : data;
    return (Array.isArray(d) ? d : []) as JornadaCalendario[];
  }

  /** Cambia los equipos de un cruce. Para invertir la localía, se pasan al revés. */
  async editarCruce(enfrentamientoId: string, localId: string, visitanteId: string): Promise<void> {
    const { error } = await this.sb.client.rpc('enfrentamiento_editar', {
      p_enfrentamiento: enfrentamientoId, p_local: localId, p_visitante: visitanteId,
    });
    if (error) throw error;
  }

  /** Remapea una jornada FALM a otra jornada LFP y/o cambia su fecha de cierre. */
  async editarJornada(jornadaFalmId: string, lfpNumero?: number, fechaCierre?: string): Promise<void> {
    const { error } = await this.sb.client.rpc('jornada_editar', {
      p_jornada_falm: jornadaFalmId,
      p_lfp_numero: lfpNumero ?? null,
      p_fecha_cierre: fechaCierre ?? null,
    });
    if (error) throw error;
  }

  /** Draft activo (no consolidado) de la temporada activa, con su estado/turno. */
  async draftActivo(): Promise<any | null> {
    const { data: t } = await this.sb.client.from('temporada').select('id').eq('activa', true).maybeSingle();
    if (!t) return null;
    const { data: d } = await this.sb.client.from('draft')
      .select('id').eq('temporada_id', (t as any).id).in('estado', ['CREADO', 'EN_CURSO', 'COMPLETADO'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!d) return null;
    const { data: est, error } = await this.sb.client.rpc('draft_estado', { p_draft: (d as any).id });
    if (error) throw error;
    return est;
  }

  /** Activos ya elegidos en el draft, para no ofrecerlos otra vez. */
  async draftPickIds(draftId: string): Promise<string[]> {
    const { data, error } = await this.sb.client
      .from('draft_pick').select('activo_id').eq('draft_id', draftId);
    if (error) throw error;
    return (data ?? []).map((r: any) => r.activo_id as string);
  }

  /** Deshace el último pick del draft. La función valida que seas ADMIN/GESTOR. */
  async draftDeshacer(draftId: string): Promise<void> {
    const { error } = await this.sb.client.rpc('draft_pick_deshacer', { p_draft: draftId });
    if (error) throw error;
  }

  async draftPicks(draftId: string): Promise<{ orden: number; ronda: number; equipo: string; jugador: string; posicion: string }[]> {
    const { data, error } = await this.sb.client.from('draft_pick')
      .select('orden_seleccion, ronda, equipo:equipo_falm_id (nombre), ' +
        'activo:activo_id (tipo, jugador_lfp:jugador_lfp_id (nombre, apellido, posicion), equipo_lfp:equipo_lfp_id (nombre))')
      .eq('draft_id', draftId).order('orden_seleccion', { ascending: false }).limit(20);
    if (error) throw error;
    return (data ?? []).map((p: any) => ({
      orden: p.orden_seleccion, ronda: p.ronda, equipo: p.equipo?.nombre ?? '?',
      jugador: p.activo?.tipo === 'DEFENSA'
        ? `Portería ${p.activo?.equipo_lfp?.nombre ?? ''}`.trim()
        : `${p.activo?.jugador_lfp?.nombre ?? ''} ${p.activo?.jugador_lfp?.apellido ?? ''}`.trim() || '?',
      posicion: p.activo?.tipo === 'DEFENSA' ? 'PORTERO' : (p.activo?.jugador_lfp?.posicion ?? ''),
    }));
  }

  // ---- Simulación (temporada de pruebas) -----------------------------------
  async temporadaPruebas(): Promise<string | null> {
    const { data } = await this.sb.client.from('temporada').select('id').eq('nombre', 'Pruebas 26-27').maybeSingle();
    return (data as any)?.id ?? null;
  }

  async clasificacionTemporada(tempId: string): Promise<{ nombre: string; pts: number; favor: number; v: number; vm: number; e: number; dm: number; d: number }[]> {
    const { data, error } = await this.sb.client.from('equipo_falm')
      .select('nombre, puntos_clasif, puntos_totales, victorias, victorias_min, empates, derrotas_min, derrotas')
      .eq('temporada_id', tempId).order('puntos_clasif', { ascending: false }).order('puntos_totales', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((e: any) => ({
      nombre: e.nombre, pts: e.puntos_clasif, favor: e.puntos_totales,
      v: e.victorias, vm: e.victorias_min, e: e.empates, dm: e.derrotas_min, d: e.derrotas,
    }));
  }

  async partidosTemporada(tempId: string): Promise<{ jornada: number; local: string; visitante: string; pl: number; pv: number }[]> {
    const { data, error } = await this.sb.client.from('enfrentamiento')
      .select('puntos_local, puntos_visitante, local:equipo_local_id (nombre), visitante:equipo_visitante_id (nombre), jornada_falm:jornada_falm_id!inner (numero, competicion:competicion_id!inner (temporada_id, tipo))')
      .eq('jornada_falm.competicion.temporada_id', tempId)
      .eq('jornada_falm.competicion.tipo', 'LIGA');
    if (error) throw error;
    return (data ?? []).map((e: any) => ({
      jornada: e.jornada_falm?.numero ?? 0,
      local: e.local?.nombre ?? '?', visitante: e.visitante?.nombre ?? '?',
      pl: Number(e.puntos_local ?? 0), pv: Number(e.puntos_visitante ?? 0),
    })).sort((a, b) => a.jornada - b.jornada);
  }
}

export interface JornadaLfpEstado {
  numero: number;
  fecha: string | null;
  partidos: number;
  con_marcador: number;
  puntuaciones: number;
  en_liga_falm: boolean;
}

export interface IngestaResultado {
  jornada_numero: number;
  anio: number;
  marcadores: number;
  casados: number;
  por_slug: number;
  ingestados: number;
  no_casados: { equipo: string; jugador: string; slug: string | null }[];
}

export interface Respaldo {
  schema: string;
  descripcion: string;
  tablas: number;
  filas: number;
  tamano: string;
}

export interface AdminTemporada { id: string; nombre: string; anio: number; activa: boolean; }

export interface AdminJugador {
  activoId: string; jugadorLfpId: string; nombre: string; posicion: string;
  club: string; escudo: string | null; precio: number;
  /** Nombre de pila y apellido por separado, para poder editarlos. */
  pila: string; apellido: string;
  clubId: string; dorsal: number | null;
  /** Si no está en el primer equipo, no aparece en mercado ni en draft. */
  primerEquipo: boolean;
}

export interface EdicionJugador {
  activoId: string; jugadorLfpId: string;
  pila: string; apellido: string; posicion: string;
  clubId: string; dorsal: number | null; primerEquipo: boolean;
}

export interface JornadaAdmin {
  id: string; numero: number; competicion: string;
  fechaCierre: string | null;
  fichajesProcesados: string | null;
  alineacionesHeredadas: string | null;
}

export interface CronAdmin {
  id: number; nombre: string; horario: string; comando: string;
  activo: boolean; ultima: string | null; estado: string | null; mensaje: string;
}
export interface CruceCalendario {
  id: string;
  local_id: string;
  visitante_id: string;
  local: string;
  visitante: string;
  puntos_local: number | null;
  puntos_visitante: number | null;
}

export interface JornadaCalendario {
  id: string;
  n: number;
  lfp: number | null;
  fecha_cierre: string | null;
  /** Con resultados o alineaciones: intocable. */
  jugada: boolean;
  cruces: CruceCalendario[];
}

export interface EstadoPretemporada {
  equipos: number;
  jornadas: number;
  lfp_desde: number | null;
  lfp_hasta: number | null;
  enfrentamientos: number;
  jugados: number;
  con_alineacion: number;
  /** La liga ya tiene resultados o alineaciones: no se regenera nada. */
  bloqueado: boolean;
}

export interface AdminEquipo {
  id: string; nombre: string; presupuesto: number; beneficio: number; usuarioId: string | null; jugadores: number;
}
export interface LineaPuntos { concepto: string; detalle: string; puntos: number; }

export interface AdminPuntuacion {
  id: number; nombre: string; equipo: string; posicion: string; puntos: number;
  tipo: string; goles: number; asistencias: number;
  resultado: string; minutos: number; estrellas: number; golesPenalti: number;
  penaltiFallado: number; penaltiParado: number; golesEnPropia: number;
  golesEnContra: number; tarjetasRojas: number; imbatido: boolean;
  explicacion: LineaPuntos[];
}
