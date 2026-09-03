import { Component, Input, OnInit, computed, signal } from '@angular/core';
import { FalmService } from '../core/falm.service';
import { SubnavComponent, SubnavItem } from './subnav.component';

/**
 * Las dos maneras de mover jugadores fuera del draft: pedirlos al mercado o
 * cambiarlos con otro equipo. Comparten sección en el menú, así que van con
 * esta barra en las dos pantallas.
 */
@Component({
  selector: 'falm-nav-fichajes',
  standalone: true,
  imports: [SubnavComponent],
  template: `<falm-subnav [items]="items()" />`,
})
export class NavFichajesComponent implements OnInit {
  items = computed<SubnavItem[]>(() => [
    { path: '/fichajes', label: 'Peticiones' },
    { path: '/intercambios', label: 'Intercambios', badge: this.cuenta() },
  ]);

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
