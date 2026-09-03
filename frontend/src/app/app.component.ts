import { Component, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { FalmService } from './core/falm.service';
import { SeasonService } from './core/season.service';
import { environment } from '../environments/environment';
import { FichaJugadorComponent } from './shared/ficha-jugador.component';

interface NavItem { path: string; label: string; corto: string; }

/** Marco de la app: la navegación va en la cabecera (barra inferior en móvil). */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FichaJugadorComponent, FormsModule],
  template: `
    @if (auth.isLoggedIn()) {
      <header class="topbar">
        <a class="brand" routerLink="/dashboard">
          <span class="logo">F</span>
          <span class="bt">
            <span class="bn">FALM</span>
            <span class="bs">{{ contexto() }}</span>
          </span>
        </a>

        <nav class="nav">
          @for (item of items; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="active">
              <span class="lg">{{ item.label }}</span><span class="sm">{{ item.corto }}</span>
            </a>
          }
        </nav>

        <div class="right">
          @if (season.temporadas().length > 1) {
            <select class="temp" [ngModel]="season.actualId()" (ngModelChange)="cambiarTemporada($event)" title="Temporada">
              @for (t of season.temporadas(); track t.id) {
                <option [value]="t.id">{{ t.nombre }}{{ t.activa ? '' : ' ·pruebas' }}</option>
              }
            </select>
          }
          <span class="yo">
            <span class="ava">{{ iniciales }}</span>
            <span class="team">{{ team }}</span>
          </span>
          <span class="acc">
            <a class="tlink" routerLink="/admin" title="Administración">Admin</a>
            <button class="tlink" (click)="logout()">Salir</button>
          </span>
        </div>
      </header>

      <main class="content"><router-outlet /></main>
    } @else {
      <router-outlet />
    }
    <falm-ficha-jugador />
  `,
  styles: [`
    .topbar {
      position: sticky; top: 0; z-index: 30;
      display: flex; align-items: center; gap: 22px;
      padding: 11px 24px;
      background: var(--surface);
      border-bottom: 1px solid var(--line);
    }

    /* Mancheta de periódico: sello, cabecera y línea de contexto. */
    .brand { display: flex; align-items: center; gap: 11px; flex: 0 0 auto; }
    .logo { width: 34px; height: 34px; border-radius: 10px; flex: 0 0 auto;
      background: var(--accent); color: var(--accent-ink);
      display: flex; align-items: center; justify-content: center;
      font-family: var(--fh); font-size: var(--t-lg); font-weight: 600; }
    .bt { display: flex; flex-direction: column; line-height: 1.15; }
    .bn { font-family: var(--fh); font-size: var(--t-md); font-weight: 600;
      text-transform: uppercase; letter-spacing: -.01em; }
    .bs { font-size: var(--t-xs); color: var(--text2); letter-spacing: .15em; text-transform: uppercase; }

    .nav { display: flex; gap: 4px; flex-wrap: wrap; }
    .nav a { padding: 8px 15px; border-radius: var(--pill);
      color: var(--text2); font-weight: 600; font-size: var(--t-sm);
      border: 1px solid transparent; transition: color .14s ease, background .14s ease; }
    .nav a:hover { color: var(--text); background: var(--surface2); }
    .nav a.active { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
    .nav .sm { display: none; }

    .right { display: flex; align-items: center; gap: 14px; margin-left: auto; flex: 0 0 auto; }
    .temp { background: var(--surface2); border: 1px solid var(--line); color: var(--text);
      border-radius: 9px; padding: 6px 8px; font-size: var(--t-sm); font-weight: 600; max-width: 150px; }
    .yo { display: flex; align-items: center; gap: 9px; min-width: 0; }
    .ava { width: 30px; height: 30px; border-radius: 50%; flex: 0 0 auto;
      background: var(--surface2); border: 1px solid var(--line); color: var(--text2);
      display: flex; align-items: center; justify-content: center;
      font-family: var(--fm); font-size: var(--t-xs); font-weight: 700; }
    .team { font-size: var(--t-sm); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .acc { display: flex; align-items: center; gap: 12px; padding-left: 14px; border-left: 1px solid var(--line); }
    .tlink { background: none; border: none; padding: 0; cursor: pointer;
      font-family: var(--fb); font-size: var(--t-xs); font-weight: 700; letter-spacing: .14em;
      text-transform: uppercase; color: var(--text2); white-space: nowrap; }
    .tlink:hover { color: var(--accent); }

    .content { width: 100%; max-width: 1280px; margin: 0 auto; padding: 24px 26px 64px; }

    /* Ancho intermedio: las ocho pestañas no caben junto a la mancheta, bajan de línea. */
    @media (max-width: 1180px) and (min-width: 761px) {
      .topbar { flex-wrap: wrap; gap: 12px 18px; }
      .nav { order: 3; width: 100%; }
    }

    /* barra inferior (móvil): la navegación vuelve al pulgar */
    @media (max-width: 760px) {
      .topbar { padding: 9px 13px; gap: 10px; }
      .bs { display: none; }
      .logo { width: 30px; height: 30px; font-size: var(--t-md); }
      .right { gap: 10px; }
      .team { display: none; }
      .acc { gap: 10px; padding-left: 10px; }
      .tlink { font-size: var(--t-xs); letter-spacing: .1em; }
      .temp { max-width: 104px; font-size: var(--t-xs); padding: 5px 6px; }

      .content { padding: 16px 14px 96px; }
      .nav {
        position: fixed; bottom: 0; left: 0; right: 0; z-index: 30;
        gap: 0; flex-wrap: nowrap;
        padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
        border-top: 1px solid var(--line);
        background: var(--surface);
        /* Ocho secciones no caben aplastadas: la barra se desliza. */
        overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none;
      }
      .nav::-webkit-scrollbar { display: none; }
      .nav a { flex: 0 0 auto; min-width: 62px; padding: 11px 8px; text-align: center; border-radius: 8px;
        font-size: var(--t-xs); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
      .nav a.active { background: transparent; border-color: transparent;
        color: var(--accent); box-shadow: inset 0 2px 0 var(--accent); }
      .nav .lg { display: none; } .nav .sm { display: inline; }
    }
  `],
})
export class AppComponent {
  get team() {
    return environment.devEquipoNombre || localStorage.getItem('falm_equipo') ||
      (this.auth.user()?.user_metadata?.['equipo'] as string) || '';
  }
  /** Dos letras para el avatar: las iniciales del equipo, como en una camiseta. */
  get iniciales() {
    const p = (this.team || '?').trim().split(/\s+/);
    return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?';
  }

  /** Línea de contexto bajo la marca: qué temporada se está mirando. */
  contexto = computed(() => {
    const t = this.season.actual();
    return t ? `LaLiga · ${t.nombre}${t.activa ? '' : ' · pruebas'}` : 'Liga Fantasy';
  });

  items: NavItem[] = [
    { path: '/dashboard', label: 'Inicio', corto: 'Inicio' },
    { path: '/plantilla', label: 'Plantilla', corto: 'Equipo' },
    { path: '/alineacion', label: 'Alineación', corto: 'Once' },
    { path: '/mercado', label: 'Mercado', corto: 'Mercado' },
    { path: '/draft', label: 'Draft', corto: 'Draft' },
    { path: '/clasificacion', label: 'Clasificación', corto: 'Clasif.' },
    { path: '/jornadas', label: 'Partidos', corto: 'Jornadas' },
    { path: '/puntuaciones', label: 'Estadísticas', corto: 'Stats' },
  ];

  constructor(public auth: AuthService, public season: SeasonService, falm: FalmService) {
    season.ensure();
    falm.warmup(); // despierta el dyno del backend al arrancar
  }

  cambiarTemporada(id: string) {
    this.season.set(id);
    location.reload(); // recarga para que todas las pantallas relean la temporada elegida
  }

  async logout() {
    await this.auth.signOut();
    location.href = '/login';
  }
}
