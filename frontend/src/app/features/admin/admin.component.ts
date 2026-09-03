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
      <div>
        <a class="back" routerLink="/dashboard">‹ Volver a la app</a>
        <h1>Administración</h1>
      </div>
      @if (demo) { <span class="badge">Demo</span> }
    </header>

    <nav class="anav">
      <a routerLink="pretemporada" routerLinkActive="on">Pretemporada</a>
      <a routerLink="simulacion" routerLinkActive="on">Simulación</a>
      <a routerLink="jugadores" routerLinkActive="on">Jugadores</a>
      <a routerLink="puntuaciones" routerLinkActive="on">Puntuaciones</a>
      <a routerLink="operaciones" routerLinkActive="on">Operaciones</a>
      <a routerLink="equipos" routerLinkActive="on">Equipos</a>
    </nav>

    <router-outlet />
  `,
  styles: [`
    .ahead { display: flex; align-items: flex-end; justify-content: space-between;
      gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
    .ahead h1 { font-size: 28px; margin-top: 3px; }
    .back { font-size: 9px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--text2); }
    .back:hover { color: var(--accent); }
    .badge { color: var(--por); border: 1px solid color-mix(in oklab, var(--por) 34%, var(--line));
      font-size: 9px; font-weight: 700; padding: 4px 11px; border-radius: var(--pill);
      letter-spacing: .16em; text-transform: uppercase; }
    .anav { display: flex; gap: 4px; margin-bottom: 18px; overflow-x: auto;
      padding-bottom: 4px; border-bottom: 1px solid var(--line);
      -webkit-overflow-scrolling: touch; scrollbar-width: none; }
    .anav::-webkit-scrollbar { display: none; }
    .anav a { flex: 0 0 auto; padding: 10px 14px; color: var(--text2); font-weight: 600; font-size: 13px;
      border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
    .anav a.on { color: var(--accent); border-bottom-color: var(--accent); }
  `],
})
export class AdminComponent {
  demo = !!environment.devEquipoNombre;
}
