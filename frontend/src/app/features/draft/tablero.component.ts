import { Component, OnDestroy, OnInit, computed, effect, signal } from '@angular/core';
import { DraftService, PickDetalle } from './draft.service';

const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/**
 * El draft para proyectar: televisor en el salón mientras cada uno ficha desde
 * su móvil. Solo mira, no toca nada.
 *
 * Arriba, grande, de quién es el turno, que es lo que se pregunta en voz alta.
 * Debajo, el tablero entero: una columna por equipo en el orden del sorteo y
 * una fila por ronda, con la serpiente ya resuelta (en las rondas pares el
 * orden se invierte, pero cada equipo sigue teniendo su columna).
 *
 * Todo se dimensiona en vh para que las 23 rondas quepan en la pantalla sea
 * cual sea: en un televisor de 1080 salen filas de 38px, y en uno de 4K, de 76.
 */
@Component({
  selector: 'falm-tablero',
  standalone: true,
  providers: [DraftService],
  template: `
    @if (d.cargando()) {
      <p class="aviso">Cargando el draft…</p>
    } @else if (d.error()) {
      <p class="aviso mal">{{ d.error() }}</p>
    } @else if (!d.draft()) {
      <p class="aviso">Todavía no hay ningún draft abierto.</p>
    } @else {
      <header class="cima">
        <div class="izq">
          <span class="et">Ronda</span>
          <b class="ronda">{{ d.turno()?.ronda ?? '—' }}</b>
          <span class="de">de {{ d.draft()!.total_rondas }}</span>
        </div>

        <div class="centro">
          @if (d.turno(); as t) {
            <span class="et">Elige</span>
            <b class="equipo">{{ nombreEquipo(t.equipo_falm_id) }}</b>
          } @else if (d.draft()!.estado === 'CREADO') {
            <b class="equipo esperando">Sin sortear</b>
          } @else {
            <b class="equipo">Draft completo</b>
          }
        </div>

        <div class="der">
          <span class="et">Pick</span>
          <b class="ronda">{{ d.draft()!.picks_hechos }}</b>
          <span class="de">de {{ d.draft()!.picks_totales }}</span>
          @if (!d.conectado()) { <span class="recon">Reconectando…</span> }
        </div>
      </header>

      @if (columnas().length === 0) {
        <p class="aviso">Todavía no se ha sorteado el orden.</p>
      } @else {
        <div class="tablero" [style.--cols]="columnas().length">
          <div class="fila cab">
            <span class="rn">R</span>
            @for (c of columnas(); track c.id) {
              <span class="eq" [class.turno]="c.id === d.turno()?.equipo_falm_id">{{ c.nombre }}</span>
            }
          </div>

          @for (r of rondas(); track r) {
            <div class="fila" [class.actual]="r === d.turno()?.ronda" [attr.data-ronda]="r">
              <span class="rn">{{ r }}</span>
              @for (c of columnas(); track c.id) {
                @if (celda(c.id, r); as p) {
                  <span class="ce" [class]="abr(p.posicion)">
                    @if (p.escudo) { <img [src]="p.escudo" alt="" loading="lazy" /> }
                    <b>{{ corto(p.nombre) }}</b>
                  </span>
                } @else if (esElTurno(c.id, r)) {
                  <span class="ce eligiendo">Elige…</span>
                } @else {
                  <span class="ce vacia"></span>
                }
              }
            </div>
          }
        </div>
      }
    }
  `,
  styles: [`
    :host { display: block; height: 100vh; overflow: hidden;
      background: var(--bg); color: var(--text); }

    .aviso { padding: 8vh 4vw; margin: 0; font-family: var(--fh);
      font-size: 4vh; text-align: center; color: var(--text2); }
    .aviso.mal { color: var(--bad); }

    /* La franja de arriba se lee desde el sofá: el nombre del equipo al que le
       toca es lo más grande de la pantalla. */
    .cima { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
      gap: 2vw; padding: 1.6vh 2vw; border-bottom: 2px solid var(--line);
      background: var(--surface); height: 11vh; box-sizing: border-box; }
    .cima .der { justify-self: end; text-align: right; }
    .et { font-family: var(--fb); font-size: 1.7vh; font-weight: 700;
      letter-spacing: .18em; text-transform: uppercase; color: var(--text2);
      margin-right: .6vw; }
    .ronda { font-family: var(--fm); font-size: 4.4vh; line-height: 1; }
    .de { font-family: var(--fb); font-size: 1.9vh; color: var(--text2); margin-left: .4vw; }
    .equipo { font-family: var(--fh); font-weight: 600; font-size: 6.4vh; line-height: 1;
      color: var(--accent); }
    .equipo.esperando { color: var(--text2); }
    .recon { display: block; font-family: var(--fb); font-size: 1.6vh; color: var(--por); }

    .tablero { height: 89vh; overflow: hidden; padding: 0 .6vw .6vh;
      display: flex; flex-direction: column; }
    .fila { display: grid; grid-template-columns: 3.2vh repeat(var(--cols), 1fr);
      gap: .3vh; align-items: stretch; flex: 1 1 0; min-height: 0; }
    .fila.cab { flex: 0 0 4.4vh; align-items: center; }

    .rn { display: flex; align-items: center; justify-content: center;
      font-family: var(--fm); font-size: 1.8vh; color: var(--text2); }
    .fila.actual .rn { color: var(--accent); font-weight: 700; }

    .eq { display: flex; align-items: center; justify-content: center;
      font-family: var(--fb); font-size: 1.7vh; font-weight: 700;
      letter-spacing: .06em; text-transform: uppercase; color: var(--text2);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .eq.turno { color: var(--accent-ink); background: var(--accent);
      border-radius: var(--r-xs); }

    /* Cada elección: escudo y apellido. El color de la izquierda dice la
       posición, que de lejos es lo único que se distingue. */
    .ce { display: flex; align-items: center; gap: .5vw; min-width: 0;
      padding: 0 .5vw; border-radius: var(--r-xs);
      background: var(--surface); border: 1px solid var(--line);
      border-left: .5vh solid var(--line); }
    .ce img { width: 2.2vh; height: 2.2vh; object-fit: contain; flex: 0 0 auto; }
    .ce b { font-family: var(--fb); font-size: 1.8vh; font-weight: 700; min-width: 0;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ce.POR { border-left-color: var(--por); }
    .ce.DEF { border-left-color: var(--def); }
    .ce.MED { border-left-color: var(--med); }
    .ce.DEL { border-left-color: var(--del); }
    .ce.vacia { background: transparent; border-color: transparent; }

    /* A quién le toca ahora mismo: late, para encontrarlo sin buscarlo. */
    .ce.eligiendo { justify-content: center; background: var(--accent-soft);
      border-color: var(--accent); border-left-color: var(--accent);
      color: var(--accent); font-family: var(--fb); font-size: 1.7vh; font-weight: 700;
      letter-spacing: .08em; text-transform: uppercase;
      animation: late 1.4s ease-in-out infinite; }
    @keyframes late { 50% { opacity: .38; } }
    @media (prefers-reduced-motion: reduce) { .ce.eligiendo { animation: none; } }

    .fila.actual .ce { border-color: color-mix(in oklab, var(--accent) 30%, var(--line)); }
  `],
})
export class TableroComponent implements OnInit, OnDestroy {
  constructor(public d: DraftService) {
    // Al avanzar el turno, la ronda en curso sube al principio de la pantalla:
    // en la ronda 20 nadie quiere estar mirando la 1.
    effect(() => {
      const r = this.d.turno()?.ronda;
      if (r) queueMicrotask(() => this.traerRonda(r));
    });
  }

  async ngOnInit() {
    await this.d.cargar();
    this.d.suscribir();
    document.addEventListener('visibilitychange', this.alVolver);
  }

  ngOnDestroy() {
    document.removeEventListener('visibilitychange', this.alVolver);
    this.d.desuscribir();
  }

  /** Un televisor puede pasar horas en segundo plano: al volver, reconciliar. */
  private alVolver = () => {
    if (document.visibilityState === 'visible') this.d.refrescarPicks();
  };

  /** Las columnas son los equipos en el orden del sorteo (el de la ronda 1). */
  readonly columnas = computed(() => {
    const nombres = this.d.equipoPorId();
    return this.d
      .orden()
      .filter((o) => o.ronda === 1)
      .sort((a, b) => a.posicion_en_ronda - b.posicion_en_ronda)
      .map((o) => ({ id: o.equipo_falm_id, nombre: nombres.get(o.equipo_falm_id) ?? '—' }));
  });

  readonly rondas = computed(() => {
    const n = this.d.draft()?.total_rondas ?? 0;
    return Array.from({ length: n }, (_, i) => i + 1);
  });

  /** equipo|ronda -> pick, para no recorrer los 230 en cada celda. */
  private readonly porCelda = computed(() => {
    const m = new Map<string, PickDetalle>();
    for (const p of this.d.detalle()) m.set(`${p.equipo_falm_id}|${p.ronda}`, p);
    return m;
  });

  celda(equipo: string, ronda: number): PickDetalle | undefined {
    return this.porCelda().get(`${equipo}|${ronda}`);
  }

  esElTurno(equipo: string, ronda: number): boolean {
    const t = this.d.turno();
    return !!t && t.equipo_falm_id === equipo && t.ronda === ronda;
  }

  nombreEquipo(id: string | undefined): string {
    return (id && this.d.equipoPorId().get(id)) || '—';
  }

  abr(pos: string): string { return ABR[pos] ?? pos; }

  /**
   * En una celda de una décima de pantalla solo cabe el apellido: los nombres
   * de pila se quedan en inicial, y las partículas se conservan porque sin
   * ellas «de la Fuente» no es nadie.
   */
  corto(nombre: string): string {
    const partes = nombre.trim().split(/\s+/);
    if (partes.length < 2) return nombre;
    if (partes[0] === 'Portería') return nombre.replace('Portería', 'P.');
    const particulas = new Set(['de', 'del', 'la', 'las', 'los', 'van', 'von', 'da', 'dos', 'di']);
    const corte = partes.findIndex((p, i) => i > 0 && (particulas.has(p.toLowerCase()) || i === partes.length - 1));
    return partes.slice(corte === -1 ? partes.length - 1 : corte).join(' ');
  }

  private ultimaTraida = 0;
  private traerRonda(r: number) {
    if (r === this.ultimaTraida) return;
    this.ultimaTraida = r;
    document.querySelector(`.fila[data-ronda="${r}"]`)?.scrollIntoView({ block: 'nearest' });
  }
}
