import { Component, OnInit, signal } from '@angular/core';
import { FalmService, FilaClasificacion, Competicion } from '../../core/falm.service';

/** Clasificación por competición, leyendo la vista falm.v_clasificacion. */
@Component({
  selector: 'app-clasificacion',
  standalone: true,
  template: `
    <h1>🏆 Clasificación</h1>

    @if (competiciones().length > 1) {
      <div class="tabs">
        @for (c of competiciones(); track c.id) {
          <button [class.active]="c.id === competicionId()" (click)="seleccionar(c.id)">{{ c.nombre }}</button>
        }
      </div>
    }

    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else if (error()) {
      <p class="err">{{ error() }}</p>
    } @else if (filas().length === 0) {
      <p class="muted">Aún no hay clasificación (sin jornadas jugadas o sin datos de temporada).</p>
    } @else {
      <div class="wrap card">
        <table class="falm">
          <thead>
            <tr>
              <th>#</th><th class="eqh">Equipo</th><th>PJ</th><th>Pts</th>
              <th class="sec">V</th><th class="sec">Vm</th><th class="sec">E</th>
              <th class="sec">Dm</th><th class="sec">D</th><th class="sec">PF</th><th class="sec">PC</th>
            </tr>
          </thead>
          <tbody>
            @for (f of filas(); track f.equipo_falm_id) {
              <tr>
                <td class="pos">{{ f.posicion }}</td>
                <td class="eq">{{ f.equipo_nombre }}</td>
                <td>{{ f.partidos_jugados }}</td>
                <td class="pts">{{ f.puntos_clasificacion }}</td>
                <td class="sec">{{ f.victorias }}</td><td class="sec">{{ f.victorias_minimas }}</td>
                <td class="sec">{{ f.empates }}</td>
                <td class="sec">{{ f.derrotas_minimas }}</td><td class="sec">{{ f.derrotas }}</td>
                <td class="sec">{{ f.puntos_favor }}</td><td class="sec">{{ f.puntos_contra }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="leyenda faint">PJ jugados · Pts clasificación · V/Vm/E/Dm/D · PF/PC puntos a favor/contra</p>
    }
  `,
  styles: [`
    h1 { margin: 0 0 16px; }
    .tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
    .tabs button { padding: 8px 14px; border: 1px solid var(--border); background: var(--surface); border-radius: 999px; cursor: pointer; }
    .tabs button.active { background: var(--primary); color: #fff; border-color: var(--primary); }
    .wrap { overflow: hidden; }
    table.falm td.pos { font-weight: 700; color: var(--muted); }
    table.falm th.eqh, table.falm td.eq { text-align: left; }
    table.falm td.eq { font-weight: 600; }
    table.falm td.pts { font-weight: 800; color: var(--primary); }
    .leyenda { margin: 10px 2px 0; font-size: .76rem; }
    .muted { color: var(--muted); } .err { color: var(--bad); }

    /* En móvil ocultamos columnas secundarias para que la tabla quepa */
    @media (max-width: 620px) {
      .sec { display: none; }
      table.falm th, table.falm td { padding: 12px 6px; }
      .leyenda { display: none; }
    }
  `],
})
export class ClasificacionComponent implements OnInit {
  competiciones = signal<Competicion[]>([]);
  competicionId = signal<string>('');
  filas = signal<FilaClasificacion[]>([]);
  cargando = signal(true);
  error = signal('');

  constructor(private falm: FalmService) {}

  async ngOnInit() {
    try {
      const comps = await this.falm.competiciones();
      this.competiciones.set(comps);
      if (comps.length > 0) await this.seleccionar(comps[0].id);
      else this.cargando.set(false);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error cargando competiciones');
      this.cargando.set(false);
    }
  }

  async seleccionar(id: string) {
    this.competicionId.set(id);
    this.cargando.set(true);
    this.error.set('');
    try {
      this.filas.set(await this.falm.clasificacion(id));
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error cargando la clasificación');
    } finally {
      this.cargando.set(false);
    }
  }
}
