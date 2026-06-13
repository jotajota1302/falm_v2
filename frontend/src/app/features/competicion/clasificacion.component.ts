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
      <table>
        <thead>
          <tr><th>#</th><th>Equipo</th><th>PJ</th><th>Pts</th><th>V</th><th>Vm</th><th>E</th><th>Dm</th><th>D</th><th>PF</th><th>PC</th></tr>
        </thead>
        <tbody>
          @for (f of filas(); track f.equipo_falm_id) {
            <tr>
              <td>{{ f.posicion }}</td>
              <td class="eq">{{ f.equipo_nombre }}</td>
              <td>{{ f.partidos_jugados }}</td>
              <td class="pts">{{ f.puntos_clasificacion }}</td>
              <td>{{ f.victorias }}</td><td>{{ f.victorias_minimas }}</td>
              <td>{{ f.empates }}</td>
              <td>{{ f.derrotas_minimas }}</td><td>{{ f.derrotas }}</td>
              <td>{{ f.puntos_favor }}</td><td>{{ f.puntos_contra }}</td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: [`
    h1 { margin:0 0 16px; }
    .tabs { display:flex; gap:8px; margin-bottom:16px; }
    .tabs button { padding:8px 14px; border:1px solid #cbd5e1; background:#fff; border-radius:999px; cursor:pointer; }
    .tabs button.active { background:#0f172a; color:#fff; border-color:#0f172a; }
    table { width:100%; border-collapse:collapse; background:#fff; border-radius:12px; overflow:hidden; }
    th, td { padding:10px 8px; text-align:center; border-bottom:1px solid #f1f5f9; font-size:.9rem; }
    th { background:#f8fafc; color:#64748b; font-weight:600; }
    td.eq { text-align:left; font-weight:600; }
    td.pts { font-weight:700; }
    .muted { color:#94a3b8; } .err { color:#dc2626; }
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
      if (comps.length > 0) {
        await this.seleccionar(comps[0].id);
      } else {
        this.cargando.set(false);
      }
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
