import { Injectable, signal } from '@angular/core';

export interface JugadorRef {
  id: number;
  activoId?: string;   // si está, el historial se pide por activo (porteros virtuales)
  nombre: string;
  equipo?: string;
  escudo?: string;
  foto?: string;
  posicion?: string;
  /**
   * El equipo de la liga que lo tiene, si quien abre la ficha ya lo sabe.
   * Sin esto no había forma de saber de quién era un jugador: la ficha enseña
   * su club de LaLiga, que es otra cosa.
   */
  dueno?: string;
  /**
   * Un botón al pie de la ficha, si quien la abre tiene algo que ofrecer ahí
   * (Mercado, con un jugador de otro, ofrece proponerle un intercambio). La
   * ficha no sabe de intercambios: solo pinta lo que le den.
   */
  accion?: { texto: string; ruta: string; params?: Record<string, string> };
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
