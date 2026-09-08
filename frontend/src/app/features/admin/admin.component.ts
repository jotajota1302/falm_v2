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

    <nav class="anav tira-x">
      <a routerLink="pretemporada" routerLinkActive="on">Pretemporada</a>
      <a routerLink="jugadores" routerLinkActive="on">Jugadores</a>
      <a routerLink="puntuaciones" routerLinkActive="on">Puntuaciones</a>
      <a routerLink="fichajes" routerLinkActive="on">Fichajes</a>
      <a routerLink="operaciones" routerLinkActive="on">Operaciones</a>
      <a routerLink="equipos" routerLinkActive="on">Equipos</a>
    </nav>

    <router-outlet />
  `,
  styles: [`
    .ahead { display: flex; align-items: flex-end; justify-content: space-between;
      gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
    .ahead h1 { font-size: var(--t-xl); margin-top: 3px; }
    .back { font-size: var(--t-xs); font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--text2); }
    .back:hover { color: var(--accent); }
    .badge { color: var(--por); border: 1px solid color-mix(in oklab, var(--por) 34%, var(--line));
      font-size: var(--t-xs); font-weight: 700; padding: 4px 11px; border-radius: var(--pill);
      letter-spacing: .16em; text-transform: uppercase; }
    /* Seis secciones que en el móvil ocupan 593px en 344: se veian menos de
       la mitad y nada decia que hubiera mas. El arrastre y las sombras de los
       lados salen de .tira-x, en styles.css, igual que en la tira de jornadas. */
    .anav { display: flex; gap: 4px; margin-bottom: 18px;
      padding-bottom: 4px; border-bottom: 1px solid var(--line);
      -webkit-overflow-scrolling: touch; }
    .anav a { flex: 0 0 auto; padding: 10px 14px; color: var(--text2); font-weight: 600; font-size: var(--t-sm);
      border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
    .anav a.on { color: var(--accent); border-bottom-color: var(--accent); }
  `],
})
export class AdminComponent {
  demo = !!environment.devEquipoNombre;
}
