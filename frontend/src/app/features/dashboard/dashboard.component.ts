import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FalmService } from '../../core/falm.service';

/** Dashboard "la semana del jugador" con datos reales del equipo. */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1>{{ equipoNombre() || 'Mi equipo' }}</h1>

    <section class="accion card">
      <div class="ic">⏰</div>
      <div>
        <strong>Acción de la semana</strong>
        <p class="muted">Se conectará al ciclo (alinear / fichar / ver resultados) según el día.</p>
      </div>
    </section>

    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else {
      <div class="grid">
        <a class="card stat" routerLink="/clasificacion">
          <span class="lbl">📍 Posición</span>
          <span class="big">{{ posicion() ? posicion() + 'º' : '—' }}</span>
          <span class="sub">{{ puntos() }} pts</span>
        </a>
        <a class="card stat" routerLink="/premios">
          <span class="lbl">💰 Premios</span>
          <span class="big">{{ premios() }}</span>
          <span class="sub">ganado</span>
        </a>
        <a class="card stat" routerLink="/plantilla">
          <span class="lbl">👕 Plantilla</span>
          <span class="big">{{ jugadores() }}</span>
          <span class="sub">jugadores</span>
        </a>
        <a class="card stat" routerLink="/mercado">
          <span class="lbl">🪙 Presupuesto</span>
          <span class="big">{{ presupuesto() }}</span>
          <span class="sub">disponible</span>
        </a>
      </div>
    }
  `,
  styles: [`
    h1 { margin: 0 0 16px; }
    .accion { display: flex; align-items: center; gap: 14px; padding: 16px; margin-bottom: 18px;
      border-left: 4px solid var(--accent); }
    .accion .ic { font-size: 1.6rem; }
    .accion strong { display: block; }
    .accion p { margin: 2px 0 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; }
    .stat { display: flex; flex-direction: column; gap: 2px; padding: 18px; transition: transform .12s, box-shadow .12s; }
    .stat:hover { transform: translateY(-2px); box-shadow: var(--shadow); }
    .stat .lbl { font-size: .8rem; color: var(--muted); }
    .stat .big { font-size: 2rem; font-weight: 800; letter-spacing: -.02em; line-height: 1.1; }
    .stat .sub { font-size: .8rem; color: var(--faint); }
    .muted { color: var(--muted); }
  `],
})
export class DashboardComponent implements OnInit {
  equipoNombre = signal('');
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
      this.equipoNombre.set(eq.nombre);
      this.presupuesto.set(eq.presupuesto);

      const comps = await this.falm.competiciones();
      const liga = comps.find((c) => c.tipo === 'LIGA') ?? comps[0];

      const [clas, premios, plantilla] = await Promise.all([
        liga ? this.falm.clasificacion(liga.id) : Promise.resolve([]),
        this.falm.misPremios(eq.id),
        this.falm.miPlantilla(eq.id),
      ]);

      const mia = clas.find((f) => f.equipo_falm_id === eq.id);
      if (mia) { this.posicion.set(mia.posicion); this.puntos.set(mia.puntos_clasificacion); }
      this.premios.set(premios.reduce((s, p) => s + Number(p.importe), 0));
      this.jugadores.set(plantilla.length);
    } catch {
      /* estados por defecto */
    } finally {
      this.cargando.set(false);
    }
  }
}
