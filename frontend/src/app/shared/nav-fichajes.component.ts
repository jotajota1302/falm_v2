import { Component, Input, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FalmService } from '../core/falm.service';

/**
 * Las dos maneras de mover jugadores fuera del draft: pedirlos al mercado o
 * cambiarlos con otro equipo. Comparten sección en el menú, así que van con
 * esta barra en las dos pantallas.
 */
@Component({
  selector: 'falm-nav-fichajes',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="subnav">
      <a routerLink="/fichajes" routerLinkActive="on">Peticiones</a>
      <a routerLink="/intercambios" routerLinkActive="on">Intercambios
        @if (cuenta() > 0) { <span class="dot">{{ cuenta() }}</span> }
      </a>
    </nav>
  `,
  styles: [`
    .subnav { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
    .subnav a { display: inline-flex; align-items: center; gap: 7px;
      padding: 7px 16px; border: 1px solid var(--line); border-radius: var(--pill);
      font-size: var(--t-sm); font-weight: 600; color: var(--text2); }
    .subnav a.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
    /* Ofertas esperando respuesta: la cifra es un dato, va en mono. */
    .dot { font-family: var(--fm); font-size: var(--t-xs); line-height: 1;
      padding: 3px 6px; border-radius: var(--pill);
      background: var(--surface); color: var(--accent); }
    .subnav a.on .dot { background: var(--accent-ink); }
  `],
})
export class NavFichajesComponent implements OnInit {
  /** Si la pantalla ya las tiene contadas, se las pasa y evita la consulta. */
  @Input() set pendientes(n: number) { this.cuenta.set(n); this.propio = true; }
  cuenta = signal(0);
  private propio = false;

  constructor(private falm: FalmService) {}

  async ngOnInit() {
    if (this.propio) return;
    try {
      const eq = await this.falm.miEquipo();
      if (!eq) return;
      const ofertas = await this.falm.ofertas(eq.id);
      this.cuenta.set(ofertas.filter((o) => o.estado === 'PENDIENTE' && !o.soyOferente).length);
    } catch { /* sin contador */ }
  }
}
