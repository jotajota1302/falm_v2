import { Component, OnInit, computed, signal } from '@angular/core';
import { Equipo, FalmService, ItemPlantilla } from '../../core/falm.service';
import { PlayerCardComponent } from '../../shared/player-card.component';

const ORDEN: Record<string, number> = { PORTERO: 0, DEFENSA: 1, MEDIO: 2, DELANTERO: 3 };
const ETI: Record<string, string> = { PORTERO: 'Porteros', DEFENSA: 'Defensas', MEDIO: 'Mediocampistas', DELANTERO: 'Delanteros' };

/** Mi plantilla en cromos, agrupada por posición. */
@Component({
  selector: 'app-plantilla',
  standalone: true,
  imports: [PlayerCardComponent],
  template: `
    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else if (error()) {
      <p class="err">{{ error() }}</p>
    } @else if (!equipo()) {
      <p class="muted">No tienes equipo en la temporada activa.</p>
    } @else {
      <header class="hero rise">
        <div>
          <h1>{{ equipo()!.nombre }}</h1>
          <span class="sub">{{ items().length }} jugadores en plantilla</span>
        </div>
        <div class="presu">
          <span class="lbl">Presupuesto</span>
          <span class="val euro num">{{ equipo()!.presupuesto }}</span>
        </div>
      </header>

      @for (g of grupos(); track g.pos) {
        <div class="linea">
          <span class="pos" [class]="abr(g.pos)">{{ abr(g.pos) }}</span>
          <h3>{{ g.eti }}</h3>
          <span class="n faint">{{ g.items.length }}</span>
        </div>
        <div class="grid">
          @for (j of g.items; track j.activo_id) {
            <falm-player-card class="rise"
              [nombre]="j.nombre" [club]="j.club" [escudo]="j.escudo ?? null"
              [foto]="j.foto ?? null" [posicion]="j.posicion" [precio]="j.precio" />
          }
        </div>
      }
    }
  `,
  styles: [`
    .hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 22px; }
    .hero .sub { color: var(--muted); font-size: .85rem; }
    .presu { text-align: right; }
    .presu .lbl { display: block; font-size: .7rem; color: var(--faint); text-transform: uppercase; letter-spacing: .05em; }
    .presu .val { font-size: 1.5rem; }
    .linea { display: flex; align-items: center; gap: 10px; margin: 20px 0 12px; }
    .linea h3 { margin: 0; }
    .linea .n { margin-left: auto; font-weight: 700; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
    .muted { color: var(--muted); } .err { color: var(--bad, #fb7185); }
  `],
})
export class PlantillaComponent implements OnInit {
  equipo = signal<Equipo | null>(null);
  items = signal<ItemPlantilla[]>([]);
  cargando = signal(true);
  error = signal('');

  grupos = computed(() => {
    const by: Record<string, ItemPlantilla[]> = {};
    for (const it of this.items()) (by[it.posicion] ??= []).push(it);
    return Object.keys(by).sort((a, b) => ORDEN[a] - ORDEN[b]).map((pos) => ({ pos, eti: ETI[pos] ?? pos, items: by[pos] }));
  });

  constructor(private falm: FalmService) {}
  abr(p: string) { return ({ PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' } as Record<string, string>)[p] ?? p; }

  async ngOnInit() {
    try {
      const eq = await this.falm.miEquipo();
      this.equipo.set(eq);
      if (eq) this.items.set(await this.falm.miPlantilla(eq.id));
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error cargando la plantilla');
    } finally {
      this.cargando.set(false);
    }
  }
}
