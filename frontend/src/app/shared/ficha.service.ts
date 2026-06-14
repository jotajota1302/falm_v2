import { Injectable, signal } from '@angular/core';

export interface JugadorRef {
  id: number;
  activoId?: string;   // si está, el historial se pide por activo (porteros virtuales)
  nombre: string;
  equipo?: string;
  escudo?: string;
  foto?: string;
  posicion?: string;
  /** Totales ya conocidos (de Estadísticas/Equipo) — respaldo si el detalle por jornada falla. */
  tot?: { puntos: number; goles: number; asis: number; estrellas: number; imbatidos: number; jugadas: number };
}

/** Estado global de la ficha de jugador (overlay). */
@Injectable({ providedIn: 'root' })
export class FichaService {
  readonly abierto = signal<JugadorRef | null>(null);
  open(j: JugadorRef) { this.abierto.set(j); }
  close() { this.abierto.set(null); }
}
