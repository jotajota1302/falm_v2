import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';

interface NavItem { path: string; icon: string; label: string; }

/** Shell de la app: topbar + navegación adaptable (sidebar en desktop, bottom-nav en móvil). */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    @if (auth.isLoggedIn()) {
      <header class="topbar">
        <span class="brand">⚽ FALM</span>
        <span class="spacer"></span>
        <span class="user">{{ auth.user()?.email ?? 'Invitado' }}</span>
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
  `,
  styles: [`
    .topbar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 12px;
      height: 56px; padding: 0 16px; background: var(--primary); color: var(--primary-ink);
      box-shadow: var(--shadow-sm); }
    .brand { font-weight: 800; letter-spacing: -.01em; }
    .spacer { flex: 1; }
    .user { opacity: .9; font-size: .85rem; max-width: 45vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .logout { background: rgba(255,255,255,.15); border: none; color: #fff; width: 32px; height: 32px;
      border-radius: 8px; cursor: pointer; font-size: 1rem; }

    .layout { display: flex; min-height: calc(100vh - 56px); }
    .content { flex: 1; padding: 20px; max-width: 1100px; margin: 0 auto; width: 100%; }

    /* ---- desktop: sidebar ---- */
    .nav { width: 210px; background: var(--surface); border-right: 1px solid var(--border);
      padding: 12px; display: flex; flex-direction: column; gap: 4px; }
    .nav a { display: flex; align-items: center; gap: 12px; padding: 11px 12px; border-radius: var(--radius-sm);
      color: var(--muted); font-weight: 600; font-size: .92rem; transition: background .12s, color .12s; }
    .nav a .ic { font-size: 1.15rem; width: 22px; text-align: center; }
    .nav a:hover { background: var(--surface-2); color: var(--ink); }
    .nav a.active { background: var(--primary); color: #fff; }

    /* ---- móvil: bottom nav ---- */
    @media (max-width: 760px) {
      .layout { flex-direction: column; }
      .content { padding: 16px 14px 84px; }   /* hueco para la barra inferior */
      .nav { position: fixed; bottom: 0; left: 0; right: 0; width: auto; flex-direction: row;
        border-right: none; border-top: 1px solid var(--border); padding: 6px 4px;
        justify-content: space-around; box-shadow: 0 -2px 12px rgba(15,23,42,.08); z-index: 20; }
      .nav a { flex-direction: column; gap: 2px; padding: 6px 4px; font-size: .62rem; flex: 1; text-align: center; }
      .nav a .ic { font-size: 1.25rem; width: auto; }
      .nav a.active { background: transparent; color: var(--primary); }
    }
  `],
})
export class AppComponent {
  items: NavItem[] = [
    { path: '/dashboard', icon: '🏠', label: 'Inicio' },
    { path: '/plantilla', icon: '👕', label: 'Equipo' },
    { path: '/mercado', icon: '🛒', label: 'Mercado' },
    { path: '/clasificacion', icon: '🏆', label: 'Liga' },
    { path: '/jornadas', icon: '📅', label: 'Jornadas' },
    { path: '/premios', icon: '💰', label: 'Premios' },
  ];

  constructor(public auth: AuthService) {}

  async logout() {
    await this.auth.signOut();
    location.href = '/login';
  }
}
