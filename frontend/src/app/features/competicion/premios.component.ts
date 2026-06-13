import { Component, OnInit, computed, signal } from '@angular/core';
import { FalmService, PremioItem } from '../../core/falm.service';

/** Mis premios: total ganado, pagado y pendiente + detalle. */
@Component({
  selector: 'app-premios',
  standalone: true,
  template: `
    <h1>💰 Mis premios</h1>

    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else if (error()) {
      <p class="err">{{ error() }}</p>
    } @else {
      <div class="totales">
        <div class="t"><span>Ganado</span><strong>{{ total() }}</strong></div>
        <div class="t ok"><span>Pagado</span><strong>{{ pagado() }}</strong></div>
        <div class="t pend"><span>Pendiente</span><strong>{{ pendiente() }}</strong></div>
      </div>

      @if (premios().length === 0) {
        <p class="muted">Aún no has ganado premios.</p>
      } @else {
        <table>
          <thead><tr><th>Concepto</th><th>Posición</th><th>Importe</th><th>Estado</th></tr></thead>
          <tbody>
            @for (p of premios(); track $index) {
              <tr>
                <td class="c">{{ p.concepto }}</td>
                <td>{{ p.posicion }}º</td>
                <td class="imp">{{ p.importe }}</td>
                <td>
                  @if (p.pagado) { <span class="chip ok">Pagado</span> }
                  @else { <span class="chip pend">Pendiente</span> }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    }
  `,
  styles: [`
    h1 { margin:0 0 16px; }
    .totales { display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; }
    .t { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:14px 18px;
      display:flex; flex-direction:column; min-width:120px; }
    .t span { color:#64748b; font-size:.8rem; }
    .t strong { font-size:1.4rem; }
    .t.ok strong { color:#166534; } .t.pend strong { color:#b45309; }
    table { width:100%; border-collapse:collapse; background:#fff; border-radius:12px; overflow:hidden; }
    th, td { padding:10px 12px; text-align:center; border-bottom:1px solid #f1f5f9; }
    th { background:#f8fafc; color:#64748b; }
    td.c { text-align:left; font-weight:600; } td.imp { font-weight:700; }
    .chip { padding:2px 10px; border-radius:999px; font-size:.8rem; }
    .chip.ok { background:#dcfce7; color:#166534; } .chip.pend { background:#fef3c7; color:#b45309; }
    .muted { color:#94a3b8; } .err { color:#dc2626; }
  `],
})
export class PremiosComponent implements OnInit {
  premios = signal<PremioItem[]>([]);
  cargando = signal(true);
  error = signal('');

  total = computed(() => this.premios().reduce((s, p) => s + Number(p.importe), 0));
  pagado = computed(() => this.premios().filter((p) => p.pagado).reduce((s, p) => s + Number(p.importe), 0));
  pendiente = computed(() => this.total() - this.pagado());

  constructor(private falm: FalmService) {}

  async ngOnInit() {
    try {
      const eq = await this.falm.miEquipo();
      if (eq) this.premios.set(await this.falm.misPremios(eq.id));
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error cargando los premios');
    } finally {
      this.cargando.set(false);
    }
  }
}
