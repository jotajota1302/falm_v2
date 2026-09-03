import { Component, Input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface SubnavItem { path: string; label: string; badge?: number }

/**
 * Pestañas de sección: dos pantallas que son la misma cosa vista de dos
 * maneras y comparten una entrada del menú. Sin esto, la segunda pantalla
 * depende de que alguien deje un botón suelto en algún sitio.
 */
@Component({
  selector: 'falm-subnav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="subnav">
      @for (i of items; track i.path) {
        <a [routerLink]="i.path" routerLinkActive="on">{{ i.label }}
          @if (i.badge) { <span class="dot">{{ i.badge }}</span> }
        </a>
      }
    </nav>
  `,
  styles: [`
    .subnav { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
    .subnav a { display: inline-flex; align-items: center; gap: 7px;
      padding: 7px 16px; border: 1px solid var(--line); border-radius: var(--pill);
      font-size: var(--t-sm); font-weight: 600; color: var(--text2); }
    .subnav a.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
    /* Un aviso que espera respuesta: la cifra es un dato, va en mono. */
    .dot { font-family: var(--fm); font-size: var(--t-xs); line-height: 1;
      padding: 3px 6px; border-radius: var(--pill);
      background: var(--surface); color: var(--accent); }
    .subnav a.on .dot { background: var(--accent-ink); }
    @media (max-width: 620px) {
      /* Alto de dedo, y que quepan dos por línea. */
      .subnav a { padding: 9px 15px; }
    }
  `],
})
export class SubnavComponent {
  @Input({ required: true }) items: SubnavItem[] = [];
}
