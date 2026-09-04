import { Component, Input } from '@angular/core';

const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/** Partículas que van pegadas al apellido: "González de Zarate", "van Dijk". */
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'da', 'das', 'do', 'dos',
  'van', 'von', 'di', 'du', 'le', 'el', 'al', 'bin', 'ben', 'y']);

/**
 * Carta de jugador sobre el campo de la Alineación: papel con filo del color de
 * la posición, retrato recortado y los puntos en cifra mono.
 * Los espacios miden en cqw, para que la carta escale con su hueco; el texto
 * usa la escala tipográfica de la app, que si no salía por debajo del mínimo.
 */
@Component({
  selector: 'falm-fut-card',
  standalone: true,
  template: `
    <div class="fut" [class.campo]="campo" [class.solo-escudo]="!foto && !!escudo" [attr.data-pos]="abr">
      <!-- La marca de agua solo acompaña a un retrato: en una portería el
           escudo ya es la imagen, y salían dos, uno de ellos en sombra. -->
      @if (escudo && foto) { <img class="wm" [src]="escudo" alt="" loading="lazy" /> }
      <div class="top">
        <div class="info">
          @if (num !== null) { <span class="val">{{ num }}@if (unidad) {<small>{{ unidad }}</small>}</span> }
          @if (!campo) { <span class="pos" [class]="abr">{{ abr }}</span> }
        </div>
        @if (foto) { <img class="face" [src]="foto" alt="" loading="lazy" (error)="foto = null" /> }
        @else if (escudo) { <img class="face esc" [src]="escudo" alt="" loading="lazy" /> }
        @else { <span class="ph">{{ abr }}</span> }
      </div>
      <div class="foot">
        <span class="n1" [style.--n]="campo ? enCampo.length : null">{{ campo ? enCampo : corto }}</span>
        @if (stats?.length) {
          <div class="sline">@for (s of stats; track s.ico) { <span>{{ s.ico }}{{ s.n }}</span> }</div>
        }
      </div>
      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    :host { container-type: inline-size; display: block; }
    .fut { position: relative; width: 100%; aspect-ratio: 1 / 1.22; overflow: hidden; cursor: pointer;
      display: flex; flex-direction: column; padding: 6cqw 6cqw 5cqw;
      background: var(--surface); border: 1px solid var(--line); border-radius: 8cqw;
      border-top: 3px solid var(--c, var(--line)); color: var(--text); }
    .fut[data-pos=POR] { --c: var(--por); } .fut[data-pos=DEF] { --c: var(--def); }
    .fut[data-pos=MED] { --c: var(--med); } .fut[data-pos=DEL] { --c: var(--del); }
    .fut:hover { border-color: var(--accent-line); border-top-color: var(--c, var(--line)); }

    /* El escudo va de marca de agua: identifica el club sin gritar. */
    .wm { position: absolute; right: -12%; top: 4%; width: 78%; opacity: .1;
      object-fit: contain; z-index: 0; pointer-events: none; }

    .top { position: relative; z-index: 1; flex: 1; min-height: 0;
      display: flex; align-items: flex-start; justify-content: space-between; gap: 3cqw; }
    .info { display: flex; flex-direction: column; align-items: flex-start; gap: 3cqw; }
    .val { font-family: var(--fm); font-weight: 700; font-size: var(--t-lg); line-height: 1; }
    .val small { font-size: var(--t-xs); opacity: .7; margin-left: 1px; }
    .pos { min-width: 0; padding: 2px 6px; border-radius: 5px; font-size: var(--t-xs); letter-spacing: .06em; }

    .face { height: 100%; max-width: 62%; object-fit: contain; object-position: top right; align-self: stretch; z-index: 1; }
    /* El escudo de una portería no es un retrato: ocupa bastante menos. */
    .face.esc { max-width: 46%; max-height: 72%; object-position: center;
      opacity: 1; align-self: center; }
    .ph { font-family: var(--fb); font-weight: 700; font-size: var(--t-md); color: var(--text2); margin-left: auto; }

    .foot { position: relative; z-index: 1; margin-top: 3cqw; }
    .n1 { display: block; font-family: var(--fb); font-weight: 700; font-size: var(--t-md);
      letter-spacing: 0; line-height: 1.2;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sline { display: flex; gap: 5cqw; margin-top: 1cqw; font-family: var(--fm);
      font-size: var(--t-xs); color: var(--text2); }
    .sline span { white-space: nowrap; }

    /* modo campo (Alineación): la banda ya dice la posición, así que sobra el badge */
    .fut.campo .info { position: absolute; top: 4cqw; left: 5cqw; z-index: 3; }
    .fut.campo .val { background: var(--surface2); border: 1px solid var(--line);
      padding: 1px 6px; border-radius: 6px; font-size: var(--t-sm); }
    .fut.campo .top { justify-content: center; align-items: stretch; }
    .fut.campo .face { max-width: 88%; object-position: center bottom; }
    .fut.campo .face.esc { max-width: 58%; max-height: 74%; object-position: center; }
    /* En una portería la cifra iba encima del escudo: le dejamos su sitio. */
    .fut.campo.solo-escudo .top { padding-top: 16%; }
    .fut.campo.solo-escudo .face.esc { max-height: 84%; }
    /* Siempre una línea: el tamaño se ajusta a lo que mide el nombre. El ancho
       útil de la carta es ~88cqw y cada letra pesa ~0.52em, así que caben con
       170cqw/nº de letras, sin pasar del tamaño normal ni bajar de legible.
       Así entra cualquier nombre, también los que vengan en el futuro. */
    .fut.campo .n1 { text-align: center; white-space: nowrap;
      font-size: min(var(--t-md), max(9px, calc(170cqw / var(--n, 12)))); }

    /* En el móvil la carta es la mitad de ancha: el nombre baja un escalón. */
    @media (max-width: 620px) {
      .n1 { font-size: var(--t-sm); }
    }
  `],
})
export class FutCardComponent {
  @Input() nombre = '';
  @Input() foto: string | null = null;
  @Input() escudo: string | null = null;
  @Input() set posicion(v: string) { this.abr = ABR[v] ?? v; }
  @Input() media: number | string | null = null;   // puntos (Once/Equipo)
  @Input() sub: string | null = null;               // (reservado)
  @Input() stats: { ico: string; n: number | string }[] | null = null;
  @Input() campo = false;                           // Once: sin chip de posición, cara centrada
  abr = 'MED';

  /** En el campo solo cabe una palabra: el apellido. */
  get corto() { const p = (this.nombre || '').split(' '); return p.length > 1 ? p[p.length - 1] : this.nombre; }

  /**
   * El nombre tal como va sobre el campo: los nombres de pila en inicial y el
   * apellido entero. "Jude Bellingham" se partía en dos líneas; así queda
   * "J. Bellingham", y los de dos nombres, que son los que se iban de largo,
   * bajan bastante: "Jon Ander Olasagasti" -> "J. A. Olasagasti".
   *
   * El apellido es la última palabra más las partículas que la preceden, para
   * no romper "de Zarate" ni "de Galarreta". Los de una sola palabra (Raphinha)
   * y las porterías se quedan enteros.
   */
  get enCampo() {
    const n = (this.nombre || '').trim();
    if (!n.includes(' ') || /^porter[ií]a/i.test(n)) return n;
    const p = n.split(/\s+/);
    let i = p.length - 1;
    while (i > 1 && PARTICULAS.has(p[i - 1].toLowerCase())) i--;
    const apellido = p.slice(i).join(' ');
    const iniciales = p.slice(0, i).map((x) => x.charAt(0).toUpperCase() + '.').join(' ');
    return `${iniciales} ${apellido}`;
  }
  get num(): number | string | null {
    if (this.media !== null && this.media !== undefined && this.media !== '') return this.media;
    return null;
  }
  get unidad(): string {
    return '';
  }
}
