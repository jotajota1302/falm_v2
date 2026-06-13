import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ActivoLibre, FalmService } from '../../core/falm.service';

/** Mercado de jugadores libres (lectura). Pedir fichaje en /fichajes. */
@Component({
  selector: 'app-mercado',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="cab">
      <h1>🛒 Mercado</h1>
      <a class="pedir" routerLink="/fichajes">🔁 Pedir fichaje</a>
    </div>

    <input class="buscar" type="search" placeholder="Buscar jugador o club…" [(ngModel)]="filtro" />

    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else if (error()) {
      <p class="err">{{ error() }}</p>
    } @else if (visibles().length === 0) {
      <p class="muted">No hay jugadores libres{{ filtro ? ' para “' + filtro + '”' : '' }}.</p>
    } @else {
      <p class="muted total">{{ visibles().length }} jugadores libres</p>
      <div class="grid">
        @for (a of visibles(); track a.activo_id) {
          <div class="card jugador" [class.virtual]="a.tipo === 'DEFENSA'">
            <div class="top">
              <span class="pos">{{ posCorta(a.posicion) }}</span>
              <span class="precio">{{ a.precio_mercado }}</span>
            </div>
            <div class="nom">{{ a.nombre }}</div>
            <div class="club">{{ a.club }}</div>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    h1 { margin: 0; }
    .cab { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .pedir { background: var(--primary); color: #fff; padding: 8px 14px; border-radius: 10px; font-weight: 600; font-size: .9rem; }
    .buscar { width: 100%; padding: 11px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm);
      font-size: 1rem; margin-bottom: 14px; background: var(--surface); }
    .total { margin: 0 0 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
    .jugador { padding: 14px; }
    .jugador.virtual { border-style: dashed; background: var(--surface-2); }
    .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .pos { font-size: .7rem; font-weight: 700; color: var(--muted); background: var(--surface-2);
      border-radius: 6px; padding: 2px 7px; }
    .precio { font-weight: 800; color: var(--primary); }
    .nom { font-weight: 600; }
    .club { color: var(--muted); font-size: .85rem; }
    .muted { color: var(--muted); } .err { color: var(--bad); }
  `],
})
export class MercadoComponent implements OnInit {
  todos = signal<ActivoLibre[]>([]);
  filtro = '';
  cargando = signal(true);
  error = signal('');

  visibles = computed(() => {
    const f = this.filtro.trim().toLowerCase();
    const lista = this.todos();
    if (!f) return lista;
    return lista.filter((a) => a.nombre.toLowerCase().includes(f) || a.club.toLowerCase().includes(f));
  });

  constructor(private falm: FalmService) {}

  async ngOnInit() {
    try {
      this.todos.set(await this.falm.mercadoLibre());
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error cargando el mercado');
    } finally {
      this.cargando.set(false);
    }
  }

  posCorta(p: string): string {
    const m: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };
    return m[p] ?? p;
  }
}
