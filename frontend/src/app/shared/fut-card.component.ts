import { Component, Input } from '@angular/core';

const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/** Carta tipo FUT/FIFA: media (puntos), posición, foto, escudo y nombre. */
@Component({
  selector: 'falm-fut-card',
  standalone: true,
  template: `
    <div class="fut" [attr.data-pos]="abr">
      <div class="sheen"></div>
      <div class="top">
        <span class="media">{{ media }}</span>
        <span class="pos">{{ abr }}</span>
        @if (escudo) { <img class="esc" [src]="escudo" alt="" loading="lazy" (error)="escudo = null" /> }
      </div>
      <div class="foto">
        @if (foto) { <img [src]="foto" alt="" loading="lazy" (error)="foto = null" /> }
        @else { <span class="ph">{{ abr === 'POR' ? '🧤' : '⚽' }}</span> }
      </div>
      <div class="nm">{{ corto }}</div>
    </div>
  `,
  styles: [`
    .fut { position: relative; width: 100%; aspect-ratio: 7 / 10; border-radius: 12px; overflow: hidden;
      background: linear-gradient(155deg, #f2d27a 0%, #e8c25e 35%, #caa23f 100%);
      box-shadow: 0 6px 14px rgba(0,0,0,.45); display: flex; flex-direction: column;
      border: 1px solid rgba(255,255,255,.35); }
    .fut[data-pos=POR] { background: linear-gradient(155deg,#9be7c4,#49c08a 60%,#2f9c6e); }
    .fut[data-pos=DEF] { background: linear-gradient(155deg,#9ec9f5,#4f9be8 60%,#2f74c0); }
    .fut[data-pos=MED] { background: linear-gradient(155deg,#f2d27a,#e0b24e 60%,#bf9233); }
    .fut[data-pos=DEL] { background: linear-gradient(155deg,#f6b39c,#ec6f4d 60%,#c8482b); }
    .sheen { position: absolute; inset: 0; background: linear-gradient(120deg, rgba(255,255,255,.35), transparent 40%);
      pointer-events: none; }
    .top { position: relative; z-index: 1; display: flex; align-items: center; gap: 3px; padding: 5px 6px 0; }
    .media { font-weight: 900; font-size: .92rem; color: #1a1206; line-height: 1; }
    .pos { font-weight: 800; font-size: .5rem; color: #1a1206; opacity: .8; }
    .esc { width: 14px; height: 14px; object-fit: contain; margin-left: auto; filter: drop-shadow(0 1px 2px rgba(0,0,0,.4)); }
    .foto { position: relative; z-index: 1; flex: 1; min-height: 0; display: flex; align-items: flex-end; justify-content: center; }
    .foto img { height: 100%; object-fit: contain; filter: drop-shadow(0 4px 5px rgba(0,0,0,.4)); }
    .foto .ph { font-size: 1.6rem; opacity: .6; padding-bottom: 6px; }
    .nm { position: relative; z-index: 1; text-align: center; font-weight: 800; font-size: .56rem; color: #1a1206;
      padding: 1px 3px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      border-top: 1px solid rgba(0,0,0,.18); }
  `],
})
export class FutCardComponent {
  @Input() nombre = '';
  @Input() foto: string | null = null;
  @Input() escudo: string | null = null;
  @Input() media: number | string = 0;
  @Input() set posicion(v: string) { this.abr = ABR[v] ?? v; }
  abr = 'MED';
  get corto() { const p = (this.nombre || '').split(' '); return p.length > 1 ? p[p.length - 1] : this.nombre; }
}
