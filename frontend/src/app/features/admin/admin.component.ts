import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { environment } from '../../../environments/environment';

/**
 * Shell del panel de administración (aislado, extraíble a una app propia).
 * Sub-navegación por módulos. Las escrituras van en modo demo mientras no haya
 * login real con rol ADMIN/GESTOR.
 */
@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="ahead">
      <a class="back" routerLink="/dashboard">‹ App</a>
      <h1>⚙️ Administración</h1>
      @if (demo) { <span class="badge">DEMO</span> }
    </header>

    <nav class="anav">
      <a routerLink="jugadores" routerLinkActive="on">Jugadores</a>
      <a routerLink="puntuaciones" routerLinkActive="on">Puntuaciones</a>
      <a routerLink="operaciones" routerLinkActive="on">Operaciones</a>
      <a routerLink="equipos" routerLinkActive="on">Equipos</a>
    </nav>

    <router-outlet />
  `,
  styles: [`
    .ahead { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .ahead h1 { margin: 0; font-size: 1.5rem; }
    .back { color: var(--muted); font-weight: 700; font-size: .85rem; }
    .badge { background: rgba(255,194,75,.15); color: var(--gold); border: 1px solid rgba(255,194,75,.3);
      font-size: .66rem; font-weight: 800; padding: 3px 9px; border-radius: 999px; letter-spacing: .05em; }
    .anav { display: flex; gap: 6px; margin-bottom: 18px; overflow-x: auto; padding-bottom: 4px; border-bottom: 1px solid var(--border); }
    .anav a { flex: 0 0 auto; padding: 9px 14px; color: var(--muted); font-weight: 800; font-size: .85rem;
      border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
    .anav a.on { color: var(--primary); border-bottom-color: var(--primary); }
  `],
})
export class AdminComponent {
  demo = !!environment.devEquipoNombre;
}
