import { Component, OnInit, signal } from '@angular/core';
import { FalmService } from '../../core/falm.service';
import { environment } from '../../../environments/environment';
import { colorEquipo } from '../../shared/equipo-colores';
import { SubnavComponent, SubnavItem } from '../../shared/subnav.component';

/** Premios: beneficio del equipo + ranking de premios de la liga. */
@Component({
  selector: 'app-premios',
  standalone: true,
  imports: [SubnavComponent],
  template: `
    <header class="phead">
      <div>
        <h1>Premios</h1>
        <p class="sub">Premios de jornada y de competición, esta temporada.</p>
      </div>
    </header>

    <falm-subnav [items]="secciones" />

    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else if (error()) {
      <p class="err">{{ error() }}</p>
    } @else {
      <div class="hero">
        <span class="lb">Tu beneficio · {{ miEquipo() }}</span>
        <span class="big num" [class.neg]="miBeneficio() < 0">{{ miBeneficio() }}<small>€</small></span>
      </div>

      <div class="tabla">
        <div class="fila cab"><span>#</span><span>Equipo</span><span class="der">Beneficio</span></div>
        @for (e of ranking(); track e.nombre; let i = $index) {
          <div class="fila" [class.yo]="e.nombre === miEquipo()">
            <span class="puesto">
              <span class="marca" [style.background]="color(e.nombre)"></span>
              <span class="num">{{ i + 1 }}</span>
            </span>
            <span class="nm">{{ e.nombre }}</span>
            <span class="der num ben" [class.neg]="e.beneficio < 0">{{ e.beneficio }}<small>€</small></span>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    /* La cifra propia manda: es la única de este tamaño en toda la app. */
    .hero { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r);
      padding: 24px 20px; margin-bottom: 16px; }
    .hero .big { display: block; margin-top: 4px; font-size: var(--t-3xl); font-weight: 700;
      color: var(--good); letter-spacing: -.02em; line-height: 1; }
    .hero .big.neg { color: var(--bad); }
    .hero .big small { font-size: var(--t-lg); margin-left: 2px; }

    .fila { grid-template-columns: 60px 1fr 110px; }
    .fila.yo { background: var(--accent-soft); box-shadow: inset 2px 0 0 var(--accent); }
    .puesto { display: flex; align-items: center; gap: 8px; }
    .marca { width: 3px; height: 20px; border-radius: 2px; flex: 0 0 auto; }
    .nm { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ben { font-weight: 700; color: var(--good); } .ben.neg { color: var(--bad); }
    .ben small { font-size: var(--t-xs); opacity: .75; margin-left: 1px; }
    .muted { color: var(--text2); } .err { color: var(--bad); }

    @media (max-width: 620px) {
      .hero { padding: 20px 15px; }
      .fila { grid-template-columns: 46px 1fr 92px; gap: 9px; padding: 10px 13px; }
    }
  `],
})
export class PremiosComponent implements OnInit {
  secciones: SubnavItem[] = [
    { path: '/clasificacion', label: 'Clasificación' },
    { path: '/premios', label: 'Premios' },
  ];
  miBeneficio = signal<number>(0);
  miEquipo = signal<string>(environment.devEquipoNombre || '');
  ranking = signal<{ nombre: string; beneficio: number }[]>([]);
  cargando = signal(true);
  error = signal('');

  constructor(private falm: FalmService) {}
  ini(n: string) { return (n || '?').charAt(0).toUpperCase(); }
  color(n: string) { return colorEquipo(n); }

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
