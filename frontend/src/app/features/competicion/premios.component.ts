import { Component, OnInit, signal } from '@angular/core';
import { FalmService } from '../../core/falm.service';
import { environment } from '../../../environments/environment';

const COLORES = ['#00e676', '#38bdf8', '#fb7185', '#a3e635', '#ffc24b', '#c084fc', '#f97316', '#2dd4bf', '#f472b6', '#60a5fa'];

/** Premios: beneficio del equipo + ranking de premios de la liga. */
@Component({
  selector: 'app-premios',
  standalone: true,
  template: `
    <h1>💰 Premios</h1>

    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else if (error()) {
      <p class="err">{{ error() }}</p>
    } @else {
      <div class="hero card rise">
        <span class="lbl">Tu beneficio acumulado</span>
        <span class="big num">{{ miBeneficio() }}<small>€</small></span>
        <span class="eq">{{ miEquipo() }}</span>
      </div>

      <h3 class="th">Ranking de premios</h3>
      <div class="rank card rise">
        @for (e of ranking(); track e.nombre; let i = $index) {
          <div class="row" [class.yo]="e.nombre === miEquipo()">
            <span class="pos num">
              @if (i < 3) { <span class="medal" [attr.data-m]="i+1">{{ i+1 }}</span> } @else { {{ i+1 }} }
            </span>
            <span class="av" [style.background]="color(e.nombre)">{{ ini(e.nombre) }}</span>
            <span class="nm">{{ e.nombre }}</span>
            <span class="ben num">{{ e.beneficio }}<small>€</small></span>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    h1 { margin: 0 0 16px; }
    .hero { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 28px 16px; margin-bottom: 18px;
      border: 1px solid rgba(255,194,75,.25); background: radial-gradient(120% 100% at 50% 0%, rgba(255,194,75,.1), var(--surface) 60%); }
    .hero .lbl { color: var(--muted); font-size: .8rem; }
    .hero .big { font-size: 3.2rem; font-weight: 900; color: var(--gold); letter-spacing: -.03em; line-height: 1; }
    .hero .big small { font-size: 1.3rem; }
    .hero .eq { font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; font-size: .8rem; }
    .th { margin: 4px 0 10px; }
    .rank { overflow: hidden; }
    .row { display: grid; grid-template-columns: 38px 32px 1fr auto; align-items: center; gap: 11px;
      padding: 11px 13px; border-bottom: 1px solid var(--border); }
    .row:last-child { border-bottom: none; }
    .row.yo { background: rgba(0,230,118,.07); box-shadow: inset 2px 0 0 var(--primary); }
    .pos { text-align: center; font-weight: 800; color: var(--muted); }
    .medal { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px;
      border-radius: 50%; font-weight: 800; font-size: .78rem; color: #07120d; }
    .medal[data-m="1"] { background: #ffc24b; } .medal[data-m="2"] { background: #cbd5e1; } .medal[data-m="3"] { background: #d4915a; }
    .av { width: 32px; height: 32px; border-radius: 9px; display: flex; align-items: center; justify-content: center;
      font-weight: 800; color: #07120d; font-size: .85rem; }
    .nm { font-weight: 700; font-size: .9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ben { font-weight: 900; color: var(--gold); } .ben small { font-size: .7rem; opacity: .8; }
    .muted { color: var(--muted); } .err { color: var(--bad); }
  `],
})
export class PremiosComponent implements OnInit {
  miBeneficio = signal<number>(0);
  miEquipo = signal<string>(environment.devEquipoNombre || '');
  ranking = signal<{ nombre: string; beneficio: number }[]>([]);
  cargando = signal(true);
  error = signal('');

  constructor(private falm: FalmService) {}
  ini(n: string) { return (n || '?').charAt(0).toUpperCase(); }
  color(n: string) { let h = 0; for (const c of n || '') h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORES[h % COLORES.length]; }

  async ngOnInit() {
    try {
      const [eq, rank] = await Promise.all([this.falm.miEquipo(), this.falm.rankingBeneficios()]);
      if (eq) { this.miBeneficio.set(Number(eq.beneficio ?? 0)); this.miEquipo.set(eq.nombre); }
      this.ranking.set(rank);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error cargando los premios');
    } finally {
      this.cargando.set(false);
    }
  }
}
