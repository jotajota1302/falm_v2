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
      .select('id, precio_mercado, jugador_lfp:jugador_lfp_id!inner (id, nombre, apellido, posicion, ext_id, equipo_lfp:equipo_lfp_id (nombre, escudo))')
      .eq('tipo', 'JUGADOR')
      .order('precio_mercado', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((a: any) => ({
      activoId: a.id,
      jugadorLfpId: a.jugador_lfp.id,
      nombre: `${a.jugador_lfp.nombre ?? ''} ${a.jugador_lfp.apellido ?? ''}`.trim(),
      posicion: a.jugador_lfp.posicion,
      club: a.jugador_lfp.equipo_lfp?.nombre ?? '',
      escudo: a.jugador_lfp.equipo_lfp?.escudo ?? null,
      precio: Number(a.precio_mercado ?? 0),
    }));
  }

  async actualizarJugador(activoId: string, jugadorLfpId: string, precio: number, posicion: string): Promise<void> {
    const { error: e1 } = await this.sb.client.from('activo').update({ precio_mercado: precio }).eq('id', activoId);
    if (e1) throw e1;
    const { error: e2 } = await this.sb.client.from('jugador_lfp').update({ posicion }).eq('id', jugadorLfpId);
    if (e2) throw e2;
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
      goles: Number(p.goles ?? 0),
      asistencias: Number(p.asistencias ?? 0),
    }));
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

  async draftPicks(draftId: string): Promise<{ orden: number; ronda: number; equipo: string; jugador: string; posicion: string }[]> {
    const { data, error } = await this.sb.client.from('draft_pick')
      .select('orden_seleccion, ronda, equipo:equipo_falm_id (nombre), activo:activo_id (jugador_lfp:jugador_lfp_id (nombre, apellido, posicion))')
      .eq('draft_id', draftId).order('orden_seleccion', { ascending: false }).limit(20);
    if (error) throw error;
    return (data ?? []).map((p: any) => ({
      orden: p.orden_seleccion, ronda: p.ronda, equipo: p.equipo?.nombre ?? '?',
      jugador: `${p.activo?.jugador_lfp?.nombre ?? ''} ${p.activo?.jugador_lfp?.apellido ?? ''}`.trim() || '?',
      posicion: p.activo?.jugador_lfp?.posicion ?? '',
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

export interface AdminTemporada { id: string; nombre: string; anio: number; activa: boolean; }

export interface AdminJugador {
  activoId: string; jugadorLfpId: string; nombre: string; posicion: string;
  club: string; escudo: string | null; precio: number;
}
export interface AdminEquipo {
  id: string; nombre: string; presupuesto: number; beneficio: number; usuarioId: string | null; jugadores: number;
}
export interface AdminPuntuacion {
  id: number; nombre: string; equipo: string; posicion: string; puntos: number; goles: number; asistencias: number;
}
