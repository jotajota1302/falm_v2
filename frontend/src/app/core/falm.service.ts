import { Injectable } from '@angular/core';
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
}

export interface ItemPlantilla {
  activo_id: string;
  tipo: 'JUGADOR' | 'DEFENSA';
  posicion: 'PORTERO' | 'DEFENSA' | 'MEDIO' | 'DELANTERO';
  nombre: string;       // jugador real o "Defensa <Club>" para porteros virtuales
  club: string;         // equipo LFP
  precio: number;
}

export interface PremioItem {
  tipo: string;
  posicion: number;
  importe: number;
  pagado: boolean;
  concepto: string;     // "Jornada N" o nombre de competición
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
   * Clasificación de una competición, ordenada por posición, con el nombre del equipo.
   * Dos consultas (PostgREST no garantiza embedding desde vistas): la vista + los nombres.
   */
  async clasificacion(competicionId: string): Promise<FilaClasificacion[]> {
    const { data, error } = await this.sb.client
      .from('v_clasificacion')
      .select('*')
      .eq('competicion_id', competicionId)
      .order('posicion', { ascending: true });
    if (error) throw error;
    const filas: any[] = data ?? [];
    if (filas.length === 0) return [];

    const ids = filas.map((f) => f.equipo_falm_id);
    const { data: equipos, error: e2 } = await this.sb.client
      .from('equipo_falm')
      .select('id, nombre')
      .in('id', ids);
    if (e2) throw e2;
    const nombres = new Map((equipos ?? []).map((e: any) => [e.id, e.nombre]));
    return filas.map((f) => ({ ...f, equipo_nombre: nombres.get(f.equipo_falm_id) }));
  }

  /** El equipo del usuario autenticado en la temporada activa (RLS: ve el suyo). */
  async miEquipo(): Promise<Equipo | null> {
    const { data: u } = await this.sb.client.auth.getUser();
    if (!u.user) return null;
    const { data, error } = await this.sb.client
      .from('equipo_falm')
      .select('id, nombre, presupuesto, temporada!inner(activa)')
      .eq('usuario_id', u.user.id)
      .eq('temporada.activa', true)
      .maybeSingle();
    if (error) throw error;
    return data ? { id: data.id, nombre: data.nombre, presupuesto: data.presupuesto } : null;
  }

  /** Plantilla actual (sin baja) de un equipo, con datos del activo embebidos. */
  async miPlantilla(equipoId: string): Promise<ItemPlantilla[]> {
    const { data, error } = await this.sb.client
      .from('plantilla')
      .select(
        'precio, activo:activo_id (id, tipo, ' +
          'jugador_lfp:jugador_lfp_id (nombre, apellido, posicion, equipo_lfp:equipo_lfp_id (nombre, tla)), ' +
          'equipo_lfp:equipo_lfp_id (nombre, tla))'
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
      } as ItemPlantilla;
    });
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
