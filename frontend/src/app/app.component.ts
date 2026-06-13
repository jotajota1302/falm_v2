import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { FalmService } from './core/falm.service';
import { environment } from '../environments/environment';
import { FichaJugadorComponent } from './shared/ficha-jugador.component';

interface NavItem { path: string; icon: string; label: string; }

/** Shell "Matchday": topbar translúcido + nav (sidebar desktop / bottom-nav móvil). */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FichaJugadorComponent],
  template: `
    @if (auth.isLoggedIn()) {
      <header class="topbar">
        <span class="brand"><span class="ball">⚽</span> FALM</span>
        <span class="team">{{ team }}</span>
        <button class="logout" (click)="logout()" aria-label="Salir">⎋</button>
      </header>

      <div class="layout">
        <nav class="nav">
          @for (item of items; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="active">
              <span class="ic">{{ item.icon }}</span>
              <span class="lb">{{ item.label }}</span>
            </a>
          }
        </nav>
        <main class="content"><router-outlet /></main>
      </div>
    } @else {
      <router-outlet />
    }
    <falm-ficha-jugador />
  `,
  styles: [`
    .topbar {
      position: sticky; top: 0; z-index: 30;
      display: flex; align-items: center; gap: 12px;
      height: 58px; padding: 0 18px;
      background: rgba(8, 13, 11, .72);
      backdrop-filter: saturate(160%) blur(14px);
      border-bottom: 1px solid var(--border);
    }
    .brand { font-weight: 900; font-size: 1.15rem; letter-spacing: -.04em; }
    .brand .ball { filter: drop-shadow(0 0 6px var(--glow)); }
    .team { margin-left: auto; font-weight: 700; font-size: .82rem; color: var(--primary);
      text-transform: uppercase; letter-spacing: .04em; }
    .logout { background: var(--surface-2); border: 1px solid var(--border); color: var(--muted);
      width: 34px; height: 34px; border-radius: 9px; cursor: pointer; font-size: 1rem; }

    .layout { display: flex; min-height: calc(100vh - 58px); }
    .content { flex: 1; padding: 22px; max-width: 1080px; margin: 0 auto; width: 100%; }

    /* sidebar (desktop) */
    .nav { width: 212px; padding: 14px 12px; display: flex; flex-direction: column; gap: 4px;
      border-right: 1px solid var(--border); }
    .nav a { display: flex; align-items: center; gap: 12px; padding: 11px 13px; border-radius: 11px;
      color: var(--muted); font-weight: 700; font-size: .9rem; transition: all .14s ease; }
    .nav a .ic { font-size: 1.15rem; width: 22px; text-align: center; }
    .nav a:hover { background: var(--surface); color: var(--ink); }
    .nav a.active { color: var(--primary); background: rgba(0, 230, 118, .1);
      box-shadow: inset 2px 0 0 var(--primary); }

    /* bottom-nav (móvil) */
    @media (max-width: 760px) {
      .layout { flex-direction: column; }
      .content { padding: 16px 14px 90px; }
      .nav {
        position: fixed; bottom: 0; left: 0; right: 0; width: auto; z-index: 30;
        flex-direction: row; justify-content: space-around; gap: 0;
        padding: 8px 4px calc(8px + env(safe-area-inset-bottom));
        border-right: none; border-top: 1px solid var(--border);
        background: rgba(8, 13, 11, .82); backdrop-filter: saturate(160%) blur(16px);
      }
      .nav a { flex-direction: column; gap: 3px; padding: 4px 2px; font-size: .58rem; flex: 1;
        text-align: center; border-radius: 10px; }
      .nav a.active { background: transparent; box-shadow: none; }
      .nav a.active .ic { transform: translateY(-1px); filter: drop-shadow(0 4px 8px var(--glow)); }
    }
  `],
})
export class AppComponent {
  team = environment.devEquipoNombre || '';
  items: NavItem[] = [
    { path: '/dashboard', icon: '🏠', label: 'Inicio' },
    { path: '/plantilla', icon: '👕', label: 'Equipo' },
    { path: '/alineacion', icon: '📋', label: 'Once' },
    { path: '/mercado', icon: '🛒', label: 'Mercado' },
    { path: '/clasificacion', icon: '🏆', label: 'Liga' },
    { path: '/jornadas', icon: '📅', label: 'Partidos' },
    { path: '/puntuaciones', icon: '📊', label: 'Stats' },
    { path: '/premios', icon: '💰', label: 'Premios' },
  ];

  constructor(public auth: AuthService, falm: FalmService) {
    falm.warmup(); // despierta el dyno del backend al arrancar
  }

  async logout() {
    await this.auth.signOut();
    location.href = '/login';
  }
}
