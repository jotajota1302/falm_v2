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
}
