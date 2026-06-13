import { Component, Input } from '@angular/core';

const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/** Cromo de jugador estilo fantasy: foto, color por posición, escudo del club, precio. */
@Component({
  selector: 'falm-player-card',
  standalone: true,
  template: `
    <div class="cromo" [attr.data-pos]="abr">
      <div class="glow"></div>
      <div class="head">
        <span class="pos" [class]="abr">{{ abr }}</span>
        @if (escudo) { <img class="escudo" [src]="escudo" alt="" loading="lazy" (error)="escudo = null" /> }
      </div>
      <div class="foto">
        @if (foto) { <img [src]="foto" alt="" loading="lazy" (error)="foto = null" /> }
        @else if (escudo) { <img class="ph" [src]="escudo" alt="" /> }
        @else { <span class="ph2">{{ abr === 'POR' ? '🧤' : '⚽' }}</span> }
      </div>
      <div class="info">
        <div class="nom" [title]="nombre">{{ nombre }}</div>
        <div class="meta">
          <span class="club">{{ club }}</span>
          @if (precio != null) { <span class="euro num">{{ precio }}</span> }
        </div>
      </div>
      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    .cromo {
      position: relative; overflow: hidden;
      border: 1px solid var(--border); border-radius: 16px;
      background: linear-gradient(180deg, var(--surface), var(--bg-elev));
      padding: 10px; display: flex; flex-direction: column;
      transition: transform .14s ease, border-color .14s ease;
    }
    .cromo:hover { transform: translateY(-3px); border-color: var(--border-strong); }
    .glow {
      position: absolute; inset: -40% -20% auto; height: 130px; pointer-events: none;
      background: radial-gradient(60% 100% at 50% 0%, var(--c), transparent 70%); opacity: .18;
    }
    .cromo[data-pos=POR] { --c: var(--pos-POR); }
    .cromo[data-pos=DEF] { --c: var(--pos-DEF); }
    .cromo[data-pos=MED] { --c: var(--pos-MED); }
    .cromo[data-pos=DEL] { --c: var(--pos-DEL); }

    .head { position: relative; display: flex; align-items: center; justify-content: space-between; z-index: 1; }
    .escudo { width: 22px; height: 22px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,.5)); }

    .foto {
      position: relative; z-index: 1; height: 92px; margin: 4px 0 8px;
      display: flex; align-items: flex-end; justify-content: center;
    }
    .foto img { height: 100%; object-fit: contain; filter: drop-shadow(0 6px 10px rgba(0,0,0,.5)); }
    .foto img.ph { height: 64px; opacity: .35; }
    .foto .ph2 { font-size: 2.6rem; opacity: .5; }

    .info { position: relative; z-index: 1; }
    .nom { font-weight: 700; font-size: .86rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .meta { display: flex; align-items: center; justify-content: space-between; margin-top: 2px; }
    .club { color: var(--muted); font-size: .72rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60%; }
  `],
})
export class PlayerCardComponent {
  @Input() nombre = '';
  @Input() club = '';
  @Input() escudo: string | null = null;
  @Input() foto: string | null = null;
  @Input() precio?: number | null;
  @Input() set posicion(v: string) { this.abr = ABR[v] ?? v; }
  abr = 'MED';
}
