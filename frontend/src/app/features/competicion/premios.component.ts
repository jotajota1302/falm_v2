import { Component, OnInit, signal } from '@angular/core';
import { FalmService } from '../../core/falm.service';

/** Premios: beneficio real del equipo (importado de producción). */
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
      <div class="hero card">
        <span class="lbl">Beneficio acumulado</span>
        <span class="big">{{ beneficio() }}€</span>
        <span class="eq">{{ equipo() }}</span>
      </div>
      <p class="nota faint">El desglose por jornada se mostrará al volcar la tabla de premios de producción.</p>
    }
  `,
  styles: [`
    h1 { margin: 0 0 16px; }
    .hero { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 32px 16px; }
    .hero .lbl { color: var(--muted); font-size: .85rem; }
    .hero .big { font-size: 3rem; font-weight: 800; color: var(--accent); letter-spacing: -.02em; }
    .hero .eq { font-weight: 600; color: var(--muted); }
    .nota { margin: 14px 2px 0; font-size: .82rem; }
    .muted { color: var(--muted); } .err { color: var(--bad); }
  `],
})
export class PremiosComponent implements OnInit {
  beneficio = signal<number>(0);
  equipo = signal<string>('');
  cargando = signal(true);
  error = signal('');

  constructor(private falm: FalmService) {}

  async ngOnInit() {
    try {
      const eq = await this.falm.miEquipo();
      if (eq) { this.beneficio.set(Number(eq.beneficio ?? 0)); this.equipo.set(eq.nombre); }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error cargando los premios');
    } finally {
      this.cargando.set(false);
    }
  }
}
