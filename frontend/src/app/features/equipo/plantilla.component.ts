import { Component, OnInit, computed, signal } from '@angular/core';
import { FalmService, Equipo, ItemPlantilla } from '../../core/falm.service';

const ORDEN: Record<string, number> = { PORTERO: 0, DEFENSA: 1, MEDIO: 2, DELANTERO: 3 };
const ETIQUETA: Record<string, string> = {
  PORTERO: 'Porteros', DEFENSA: 'Defensas', MEDIO: 'Medios', DELANTERO: 'Delanteros',
};

/** Mi plantilla: activos en propiedad agrupados por posición. */
@Component({
  selector: 'app-plantilla',
  standalone: true,
  template: `
    <div class="head">
      <h1>⚽ Mi plantilla</h1>
      @if (equipo()) {
        <div class="meta">
          <strong>{{ equipo()!.nombre }}</strong>
          <span class="presu">Presupuesto: {{ equipo()!.presupuesto }}</span>
          <span class="n">{{ items().length }} jugadores</span>
        </div>
      }
    </div>

    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else if (error()) {
      <p class="err">{{ error() }}</p>
    } @else if (!equipo()) {
      <p class="muted">No tienes equipo en la temporada activa.</p>
    } @else {
      @for (g of grupos(); track g.pos) {
        <h3>{{ g.etiqueta }} <span class="muted">({{ g.items.length }})</span></h3>
        <div class="grid">
          @for (j of g.items; track j.activo_id) {
            <div class="card" [class.virtual]="j.tipo === 'DEFENSA'">
              <div class="nom">{{ j.nombre }}</div>
              <div class="club">{{ j.club }}</div>
              <div class="precio">{{ j.precio }}</div>
            </div>
          }
        </div>
      }
    }
  `,
  styles: [`
    .head { display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px; }
    h1 { margin:0 0 12px; }
    .meta { display:flex; gap:16px; align-items:center; color:#475569; }
    .presu { background:#dcfce7; color:#166534; padding:2px 10px; border-radius:999px; font-size:.85rem; }
    h3 { margin:18px 0 8px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:12px; }
    .card { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:12px; }
    .card.virtual { border-style:dashed; background:#f8fafc; }
    .nom { font-weight:600; }
    .club { color:#64748b; font-size:.85rem; }
    .precio { margin-top:6px; font-weight:700; color:#0f172a; }
    .muted { color:#94a3b8; } .err { color:#dc2626; }
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
    return Object.keys(by)
      .sort((a, b) => ORDEN[a] - ORDEN[b])
      .map((pos) => ({ pos, etiqueta: ETIQUETA[pos] ?? pos, items: by[pos] }));
  });

  constructor(private falm: FalmService) {}

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
