import { Injectable, computed, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface Temporada { id: string; nombre: string; activa: boolean; }

/** Temporada seleccionada en el frontend (permite ver/operar temporadas no activas, p.ej. pruebas). */
@Injectable({ providedIn: 'root' })
export class SeasonService {
  temporadas = signal<Temporada[]>([]);
  actualId = signal<string>('');
  actual = computed(() => this.temporadas().find((t) => t.id === this.actualId()) ?? null);
  private inited = false;

  constructor(private sb: SupabaseService) {}

  /** Carga las temporadas y fija la seleccionada (guardada o la activa). Idempotente.
   *  No cachea si aún no hay datos (p.ej. antes del login) para poder reintentar después. */
  async ensure(): Promise<string> {
    if (this.inited && this.temporadas().length) return this.actualId();
    const { data } = await this.sb.client.from('temporada').select('id, nombre, activa').order('anio_inicio', { ascending: false });
    const ts = (data ?? []) as Temporada[];
    this.temporadas.set(ts);
    if (ts.length) {
      const saved = localStorage.getItem('falm_temp');
      const def = ts.find((t) => t.id === saved) ?? ts.find((t) => t.activa) ?? ts[0];
      if (def) this.actualId.set(def.id);
      this.inited = true;
    }
    return this.actualId();
  }

  set(id: string) { this.actualId.set(id); localStorage.setItem('falm_temp', id); }
}
