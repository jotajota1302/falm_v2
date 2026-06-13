import { Component, OnInit, computed, signal } from '@angular/core';
import { Equipo, FalmService, ItemPlantilla } from '../../core/falm.service';
import { PlayerCardComponent } from '../../shared/player-card.component';
import { FichaService } from '../../shared/ficha.service';

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
          <span class="lbl">Puntos plantilla</span>
          <span class="val num pts">{{ totalPuntos() }}</span>
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
              (click)="abrir(j)"
              [nombre]="j.nombre" [club]="j.club" [escudo]="j.escudo ?? null"
              [foto]="j.foto ?? null" [posicion]="j.posicion" [precio]="j.precio">
              <span class="ptsbadge">{{ puntosDe(j) }}<small>pts</small></span>
            </falm-player-card>
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
    .presu .val { font-size: 1.5rem; } .presu .pts { color: var(--primary); }
    .ptsbadge { position: absolute; top: 8px; left: 8px; z-index: 2; background: rgba(0,230,118,.92); color: #07120d;
      font-weight: 900; font-size: .82rem; padding: 2px 8px; border-radius: 999px; box-shadow: 0 2px 6px rgba(0,0,0,.4); }
    .ptsbadge small { font-size: .6rem; margin-left: 2px; font-weight: 800; }
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
  puntos = signal<Record<string, number>>({});
  cargando = signal(true);
  error = signal('');

  totalPuntos = computed(() => +Object.values(this.puntos()).reduce((s, n) => s + Number(n || 0), 0).toFixed(1));

  grupos = computed(() => {
    const by: Record<string, ItemPlantilla[]> = {};
    for (const it of this.items()) (by[it.posicion] ??= []).push(it);
    return Object.keys(by).sort((a, b) => ORDEN[a] - ORDEN[b]).map((pos) => ({ pos, eti: ETI[pos] ?? pos, items: by[pos] }));
  });

  constructor(private falm: FalmService, public ficha: FichaService) {}
  abr(p: string) { return ({ PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' } as Record<string, string>)[p] ?? p; }
  puntosDe(j: ItemPlantilla) { return this.puntos()[j.activo_id] ?? 0; }
  abrir(j: ItemPlantilla) {
    if (j.ext_id) this.ficha.open({ id: j.ext_id, nombre: j.nombre, equipo: j.club, escudo: j.escudo ?? '', foto: j.foto ?? '', posicion: j.posicion });
  }

  async ngOnInit() {
    try {
      const eq = await this.falm.miEquipo();
      this.equipo.set(eq);
      if (eq) {
        const [items, puntos] = await Promise.all([this.falm.miPlantilla(eq.id), this.falm.puntosEquipo(eq.id)]);
        this.items.set(items);
        this.puntos.set(puntos);
      }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error cargando la plantilla');
    } finally {
      this.cargando.set(false);
    }
  }
}
