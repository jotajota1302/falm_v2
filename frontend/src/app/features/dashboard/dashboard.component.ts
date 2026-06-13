import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FalmService } from '../../core/falm.service';

/** Dashboard "Matchday": resumen del equipo con datos reales. */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else {
      <section class="hero card rise">
        <div class="ribbon"></div>
        <div class="who">
          <span class="hola">Tu equipo</span>
          <h1>{{ nombre() || 'Mi equipo' }}</h1>
        </div>
        <div class="rank">
          <span class="pos num">{{ posicion() ? posicion() : '—' }}<small>º</small></span>
          <span class="rl">en la liga</span>
        </div>
      </section>

      <section class="accion rise">
        <span class="ic">⏰</span>
        <div><strong>La semana</strong><p class="muted">Próximamente: cierre de alineación y fichajes con cuenta atrás.</p></div>
      </section>

      <div class="grid">
        <a class="stat card rise" routerLink="/clasificacion">
          <span class="lbl">Puntos</span><span class="big num">{{ puntos() }}</span><span class="sub">clasificación</span>
        </a>
        <a class="stat card rise gold" routerLink="/premios">
          <span class="lbl">Premios</span><span class="big num">{{ premios() }}<small>€</small></span><span class="sub">ganado</span>
        </a>
        <a class="stat card rise" routerLink="/plantilla">
          <span class="lbl">Plantilla</span><span class="big num">{{ jugadores() }}</span><span class="sub">jugadores</span>
        </a>
        <a class="stat card rise" routerLink="/mercado">
          <span class="lbl">Presupuesto</span><span class="big num euro">{{ presupuesto() }}</span><span class="sub">disponible</span>
        </a>
      </div>
    }
  `,
  styles: [`
    .hero { position: relative; overflow: hidden; display: flex; align-items: center;
      justify-content: space-between; padding: 26px 22px; margin-bottom: 16px; }
    .hero .ribbon { position: absolute; inset: 0 auto 0 0; width: 5px; background: var(--primary); box-shadow: 0 0 20px var(--glow); }
    .who .hola { font-size: .72rem; text-transform: uppercase; letter-spacing: .08em; color: var(--faint); }
    .who h1 { font-size: 1.8rem; margin-top: 2px; }
    .rank { text-align: right; }
    .rank .pos { font-size: 3rem; font-weight: 900; line-height: 1; color: var(--primary); letter-spacing: -.04em; }
    .rank .pos small { font-size: 1.2rem; color: var(--muted); }
    .rank .rl { display: block; font-size: .72rem; color: var(--faint); text-transform: uppercase; letter-spacing: .06em; }

    .accion { display: flex; align-items: center; gap: 14px; padding: 14px 16px; margin-bottom: 18px;
      background: rgba(255,194,75,.07); border: 1px solid rgba(255,194,75,.2); border-radius: 14px; }
    .accion .ic { font-size: 1.5rem; }
    .accion strong { display: block; } .accion p { margin: 2px 0 0; font-size: .85rem; }

    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
    .stat { display: flex; flex-direction: column; gap: 2px; padding: 18px;
      transition: transform .14s ease, border-color .14s ease; }
    .stat:hover { transform: translateY(-3px); border-color: var(--border-strong); }
    .stat .lbl { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: var(--faint); }
    .stat .big { font-size: 2.2rem; font-weight: 900; letter-spacing: -.03em; line-height: 1.05; }
    .stat .big small { font-size: 1rem; opacity: .7; }
    .stat.gold .big { color: var(--gold); }
    .stat .sub { font-size: .75rem; color: var(--muted); }
    .muted { color: var(--muted); }
  `],
})
export class DashboardComponent implements OnInit {
  nombre = signal('');
  posicion = signal<number | null>(null);
  puntos = signal<number>(0);
  premios = signal<number>(0);
  jugadores = signal<number>(0);
  presupuesto = signal<number>(0);
  cargando = signal(true);

  constructor(private falm: FalmService) {}

  async ngOnInit() {
    try {
      const eq = await this.falm.miEquipo();
      if (!eq) return;
      this.nombre.set(eq.nombre);
      this.presupuesto.set(eq.presupuesto);
      this.premios.set(Number(eq.beneficio ?? 0));
      const comps = await this.falm.competiciones();
      const liga = comps.find((c) => c.tipo === 'LIGA') ?? comps[0];
      const [clas, plantilla] = await Promise.all([
        liga ? this.falm.clasificacion(liga.id) : Promise.resolve([]),
        this.falm.miPlantilla(eq.id),
      ]);
      const mia = clas.find((f) => f.equipo_falm_id === eq.id);
      if (mia) { this.posicion.set(mia.posicion); this.puntos.set(mia.puntos_clasificacion); }
      this.jugadores.set(plantilla.length);
    } catch { /* defaults */ } finally { this.cargando.set(false); }
  }
}
