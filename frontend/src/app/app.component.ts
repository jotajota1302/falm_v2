import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';

/** Shell de la app: barra superior + navegación lateral (solo con sesión) + router. */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    @if (auth.isLoggedIn()) {
      <header class="topbar">
        <span class="brand">⚽ FALM</span>
        <span class="spacer"></span>
        <span class="user">{{ auth.user()?.email }}</span>
        <button class="link" (click)="logout()">Salir</button>
      </header>
      <div class="layout">
        <nav class="sidenav">
          <a routerLink="/dashboard" routerLinkActive="active">🏠 Inicio</a>
          <a routerLink="/clasificacion" routerLinkActive="active">🏆 Clasificación</a>
          <!-- próximas secciones: Mi equipo, Fichajes, Premios, Análisis, Admin -->
        </nav>
        <main class="content"><router-outlet /></main>
      </div>
    } @else {
      <router-outlet />
    }
  `,
  styles: [`
    .topbar { display:flex; align-items:center; gap:12px; height:56px; padding:0 16px;
      background:#0f172a; color:#fff; }
    .brand { font-weight:700; }
    .spacer { flex:1; }
    .user { opacity:.8; font-size:.9rem; }
    .link { background:none; border:1px solid #ffffff55; color:#fff; border-radius:6px;
      padding:4px 10px; cursor:pointer; }
    .layout { display:flex; min-height:calc(100vh - 56px); }
    .sidenav { width:220px; background:#f1f5f9; padding:12px; display:flex; flex-direction:column; gap:4px; }
    .sidenav a { padding:10px 12px; border-radius:8px; text-decoration:none; color:#0f172a; }
    .sidenav a.active { background:#0f172a; color:#fff; }
    .content { flex:1; padding:24px; }
  `],
})
export class AppComponent {
  constructor(public auth: AuthService) {}
  async logout() {
    await this.auth.signOut();
    location.href = '/login';
  }
}
