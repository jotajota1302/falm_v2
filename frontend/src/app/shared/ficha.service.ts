import { Injectable, signal } from '@angular/core';

export interface JugadorRef {
  id: number;
  nombre: string;
  equipo?: string;
  escudo?: string;
  foto?: string;
  posicion?: string;
}

/** Estado global de la ficha de jugador (overlay). */
@Injectable({ providedIn: 'root' })
export class FichaService {
  readonly abierto = signal<JugadorRef | null>(null);
  open(j: JugadorRef) { this.abierto.set(j); }
  close() { this.abierto.set(null); }
}
