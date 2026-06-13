import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

/**
 * Dashboard "la semana del jugador" (análisis UX §4). Esqueleto con las tarjetas
 * contextuales; se irán conectando a datos reales (mi equipo, deadlines, premios)
 * a medida que existan las vistas/datos de la temporada.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1>Hola{{ auth.user()?.email ? ', ' + auth.user()?.email : '' }} 👋</h1>

    <section class="accion">
      <h2>⏰ Acción que toca ahora</h2>
      <p>Se conectará al ciclo semanal (alinear / pedir fichajes / ver resultados) según el día.</p>
    </section>

    <div class="grid">
      <div class="card">
        <h3>📍 Mi posición</h3>
        <p class="muted">Pendiente de datos de temporada</p>
        <a routerLink="/clasificacion">Ver clasificación →</a>
      </div>
      <div class="card">
        <h3>💰 Premios</h3>
        <p class="muted">Ganado / pendiente (próximamente)</p>
      </div>
      <div class="card">
        <h3>⚽ Última jornada</h3>
        <p class="muted">Resultado de mi enfrentamiento (próximamente)</p>
      </div>
      <div class="card">
        <h3>📋 Próxima alineación</h3>
        <p class="muted">Estado y cierre (próximamente)</p>
      </div>
    </div>
  `,
  styles: [`
    h1 { margin:0 0 16px; }
    .accion { background:#fef9c3; border:1px solid #fde047; border-radius:12px; padding:16px; margin-bottom:20px; }
    .accion h2 { margin:0 0 6px; font-size:1rem; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; }
    .card { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; }
    .card h3 { margin:0 0 8px; font-size:1rem; }
    .muted { color:#94a3b8; font-size:.9rem; }
    a { color:#0f172a; font-weight:600; text-decoration:none; }
  `],
})
export class DashboardComponent {
  constructor(public auth: AuthService) {}
}
