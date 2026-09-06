import { Signal, computed, signal } from '@angular/core';

/**
 * El andamiaje de las listas largas: ordenar por columna y pasar de página.
 *
 * Estaba copiado en Mercado, Fichajes, Estadísticas y Admin › Jugadores, cada
 * uno con su `limite` y su «Ver 30 más», y con 264, 387 y 840 filas el scroll
 * se hacía eterno. Aquí vive solo el estado; la fila la sigue pintando cada
 * pantalla, que son muy distintas entre sí.
 *
 * No pagina en el servidor a propósito: el listado entero son 120-135 kB que
 * ya vienen en una sola llamada, y tenerlo en memoria es lo que hace que el
 * buscador y los filtros respondan al instante.
 */
export type Dir = 'asc' | 'desc';

export interface OpcionesLista<T> {
  /** El valor por el que se ordena cada columna. Un número ordena como número. */
  valor: (it: T, campo: string) => string | number | null | undefined;
  /** Columna de partida y su sentido. */
  campo?: string;
  dir?: Dir;
  /** Sentido con el que entra cada columna al tocarla por primera vez. */
  inicial?: Record<string, Dir>;
  /** Con el criterio empatado, quién va antes (normalmente, el alfabético). */
  desempate?: (a: T, b: T) => number;
  porPagina?: number;
}

export class Lista<T> {
  readonly campo = signal('');
  readonly dir = signal<Dir>('desc');
  readonly pagina = signal(1);
  readonly porPagina = signal(50);

  readonly ordenadas: Signal<T[]>;
  readonly total: Signal<number>;
  readonly paginas: Signal<number>;
  /** La página de verdad: si un filtro deja fuera la que mirabas, la última. */
  readonly actual: Signal<number>;
  readonly visibles: Signal<T[]>;
  readonly desde: Signal<number>;
  readonly hasta: Signal<number>;

  constructor(fuente: () => T[], private o: OpcionesLista<T>) {
    if (o.campo) this.campo.set(o.campo);
    if (o.dir) this.dir.set(o.dir);
    // En el teléfono cabe menos: media página de escritorio.
    this.porPagina.set(o.porPagina ?? (typeof window !== 'undefined' && window.innerWidth < 760 ? 25 : 50));

    this.ordenadas = computed(() => {
      const arr = [...fuente()];
      const c = this.campo();
      if (!c) return arr;
      const signo = this.dir() === 'asc' ? 1 : -1;
      return arr.sort((a, b) => signo * this.comparar(a, b, c) || (o.desempate?.(a, b) ?? 0));
    });
    this.total = computed(() => this.ordenadas().length);
    this.paginas = computed(() => Math.max(1, Math.ceil(this.total() / this.porPagina())));
    this.actual = computed(() => Math.min(Math.max(1, this.pagina()), this.paginas()));
    this.desde = computed(() => (this.actual() - 1) * this.porPagina());
    this.hasta = computed(() => Math.min(this.desde() + this.porPagina(), this.total()));
    this.visibles = computed(() => this.ordenadas().slice(this.desde(), this.hasta()));
  }

  /** Texto con localeCompare('es'): si no, las tildes y la Ñ se van al final. */
  private comparar(a: T, b: T, c: string): number {
    const va = this.o.valor(a, c), vb = this.o.valor(b, c);
    if (typeof va === 'number' || typeof vb === 'number') return (Number(va) || 0) - (Number(vb) || 0);
    return String(va ?? '').localeCompare(String(vb ?? ''), 'es');
  }

  /** Tocar la columna que ya ordena le da la vuelta; otra la estrena. */
  ordenar(campo: string) {
    if (this.campo() === campo) this.dir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { this.campo.set(campo); this.dir.set(this.o.inicial?.[campo] ?? 'asc'); }
    this.pagina.set(1);
  }
  ir(p: number) { this.pagina.set(Math.min(Math.max(1, p), this.paginas())); }
  tamano(n: number) { this.porPagina.set(n); this.pagina.set(1); }
  /** Al tocar un filtro o el buscador se vuelve al principio. */
  reset() { this.pagina.set(1); }
}

export function crearLista<T>(fuente: () => T[], o: OpcionesLista<T>) { return new Lista<T>(fuente, o); }
