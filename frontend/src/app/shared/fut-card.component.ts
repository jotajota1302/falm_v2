import { Component, Input } from '@angular/core';
import { clubGrad, clubInk } from './club-colors';

const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/** Carta de jugador unificada (Once, Equipo, Mercado, Fichajes): color del club + escudo fundido.
 *  Layout ficha: nº (puntos/precio) + posición a la izquierda, cabeza arriba-derecha, nombre + stats abajo.
 *  Tamaños en cqw → se ve proporcional a cualquier tamaño (campo pequeño o cromos grandes). */
@Component({
  selector: 'falm-fut-card',
  standalone: true,
  template: `
    <div class="fut" [class.campo]="campo" [attr.data-pos]="abr" [style.background]="fondo" [style.color]="tinta">
      <div class="sheen"></div>
      @if (escudo) { <img class="wm" [src]="escudo" alt="" loading="lazy" /> }
      <div class="top">
        <div class="info">
          @if (num !== null) { <span class="val">{{ num }}@if (unidad) {<small>{{ unidad }}</small>}</span> }
          @if (!campo) { <span class="pos">{{ abr }}</span> }
        </div>
        @if (foto) { <img class="face" [src]="foto" alt="" loading="lazy" (error)="foto = null" /> }
        @else if (escudo) { <img class="face esc" [src]="escudo" alt="" loading="lazy" /> }
        @else { <span class="ph">{{ abr === 'POR' ? '🧤' : '⚽' }}</span> }
      </div>
      <div class="foot">
        <span class="n1">{{ nombre }}</span>
        @if (stats?.length) {
          <div class="sline">@for (s of stats; track s.ico) { <span>{{ s.ico }}{{ s.n }}</span> }</div>
        }
      </div>
      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    :host { container-type: inline-size; display: block; }
    .fut { position: relative; width: 100%; aspect-ratio: 1 / 1.08; border-radius: 9cqw; overflow: hidden;
      display: flex; flex-direction: column; padding: 6cqw 7cqw; color: #1a1206;
      box-shadow: 0 6px 16px rgba(0,0,0,.45); border: 1px solid rgba(255,255,255,.26); cursor: pointer; }
    .sheen { position: absolute; inset: 0; pointer-events: none; z-index: 2;
      background: linear-gradient(120deg, rgba(255,255,255,.22), transparent 46%); }
    .wm { position: absolute; right: -14%; top: 2%; width: 86%; opacity: .13; filter: saturate(.85);
      object-fit: contain; z-index: 0; pointer-events: none; }

    .top { position: relative; z-index: 1; flex: 1; min-height: 0; display: flex; align-items: flex-start; justify-content: space-between; gap: 4cqw; }
    .info { display: flex; flex-direction: column; align-items: flex-start; gap: 4cqw; }
    .val { font-weight: 900; font-size: 21cqw; line-height: 1; color: inherit; text-shadow: 0 1px 2px rgba(0,0,0,.22); }
    .val small { font-size: 8cqw; font-weight: 800; opacity: .8; margin-left: 1px; }
    .pos { font-weight: 900; font-size: 8cqw; letter-spacing: .03em; color: #07120d; padding: 1.5cqw 5cqw; border-radius: 4cqw; background: #fff; }
    .fut[data-pos=POR] .pos { background: var(--pos-POR); } .fut[data-pos=DEF] .pos { background: var(--pos-DEF); }
    .fut[data-pos=MED] .pos { background: var(--pos-MED); } .fut[data-pos=DEL] .pos { background: var(--pos-DEL); }
    .face { height: 100%; max-width: 60%; object-fit: contain; object-position: top right; align-self: stretch;
      filter: drop-shadow(0 4px 6px rgba(0,0,0,.45)); z-index: 1; }
    .face.esc { max-width: 52%; object-position: top; opacity: .96; }
    .ph { font-size: 24cqw; opacity: .6; margin-left: auto; line-height: 1; }

    .foot { position: relative; z-index: 1; margin-top: 4cqw; }
    .n1 { display: block; font-weight: 900; font-size: 12cqw; color: inherit; text-shadow: 0 1px 2px rgba(0,0,0,.22);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sline { display: flex; gap: 6cqw; margin-top: 2cqw; font-size: 9cqw; font-weight: 800; color: inherit; opacity: .92; }
    .sline span { white-space: nowrap; }

    /* modo campo (Once): sin posición (la da la banda), cara centrada, puntos en pastilla flotante */
    .fut.campo .info { position: absolute; top: 5cqw; left: 6cqw; z-index: 3; }
    .fut.campo .val { background: rgba(0,0,0,.36); color: #fff; padding: 1.5cqw 4cqw; border-radius: 5cqw; font-size: 18cqw; text-shadow: none; }
    .fut.campo .top { justify-content: center; align-items: stretch; }
    .fut.campo .face { max-width: 90%; object-position: center bottom; }
    .fut.campo .n1 { text-align: center; }
  `],
})
export class FutCardComponent {
  @Input() nombre = '';
  @Input() foto: string | null = null;
  @Input() escudo: string | null = null;
  @Input() set posicion(v: string) { this.abr = ABR[v] ?? v; }
  @Input() media: number | string | null = null;   // puntos (Once/Equipo)
  @Input() precio: number | null = null;            // precio (Mercado/Fichajes)
  @Input() sub: string | null = null;               // (reservado)
  @Input() stats: { ico: string; n: number | string }[] | null = null;
  @Input() campo = false;                           // Once: sin chip de posición, cara centrada
  abr = 'MED';

  get corto() { const p = (this.nombre || '').split(' '); return p.length > 1 ? p[p.length - 1] : this.nombre; }
  get fondo() { return clubGrad(this.escudo, this.abr); }
  get tinta() { return clubInk(this.escudo); }
  get num(): number | string | null {
    if (this.media !== null && this.media !== undefined && this.media !== '') return this.media;
    if (this.precio != null) return this.precio;
    return null;
  }
  get unidad(): string {
    return (this.media === null || this.media === undefined || this.media === '') && this.precio != null ? 'M' : '';
  }
}
