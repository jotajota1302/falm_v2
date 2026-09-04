import { AfterViewChecked, Component, ElementRef, HostListener, ViewChild, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { FalmService } from './core/falm.service';
import { SeasonService } from './core/season.service';
import { SupabaseService } from './core/supabase.service';
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
          <span class="bn">FALM</span>
          <span class="bs">{{ contexto() }}</span>
        </a>

        <nav class="nav" #navref (scroll)="medir()">
          @for (item of items; track item.path) {
            <a class="ni" [routerLink]="item.path" routerLinkActive="active"
               (pointerdown)="tocar($event)" (pointerup)="soltar($event, item.path)">
              <span class="lg">{{ item.label }}</span><span class="sm">{{ item.corto }}</span>
            </a>
          }
          <button class="masb" [class.on]="mas()" (click)="mas.set(!mas())">Cuenta</button>
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
            @if (esAdmin()) {
              <a class="tlink" routerLink="/admin" title="Administración">Admin</a>
            }
            <button class="tlink" (click)="logout()">Salir</button>
          </span>
        </div>
      </header>

      <!-- Avisan de que la barra sigue a los lados, y la mueven al pulsarlas. -->
      @if (hayIzq()) { <button class="navf izq" (click)="desplazar(-1)" aria-label="Ver secciones anteriores">‹</button> }
      @if (hayDer()) { <button class="navf der" (click)="desplazar(1)" aria-label="Ver más secciones">›</button> }

      <main class="content"><router-outlet /></main>

      <!-- La cuenta no cabe en la cabecera de móvil: vive detrás de este panel. -->
      @if (mas()) {
        <div class="masback" (click)="mas.set(false)"></div>
        <div class="maspanel">
          @if (esAdmin()) {
            <a routerLink="/admin" (click)="mas.set(false)">Administración</a>
          }
          <button (click)="logout()">Salir</button>
        </div>
      }
    } @else {
      <router-outlet />
    }
    <falm-ficha-jugador />
  `,
  styles: [`
    /* Tres zonas: la navegación va centrada de verdad, no arrastrada por
       el ancho de la mancheta ni por el de la cuenta. */
    .topbar {
      position: sticky; top: 0; z-index: 30;
      display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 22px;
      padding: 11px 24px;
      background: var(--surface);
      border-bottom: 1px solid var(--line);
    }

    /* Mancheta: cabecera y línea de contexto, sin más. */
    /* Las dos líneas se centran entre sí: FALM sobre la temporada. */
    .brand { display: flex; flex-direction: column; align-items: center; text-align: center;
      line-height: 1.15; justify-self: start; }
    .bn { font-family: var(--fh); font-size: var(--t-lg); font-weight: 600;
      text-transform: uppercase; letter-spacing: -.01em; }
    /* Altura reservada: si la línea llega vacía, la marca no da un salto. */
    .bs { min-height: 1.2em; font-size: var(--t-xs); color: var(--text2);
      letter-spacing: .12em; text-transform: uppercase; }

    .nav { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; }
    .nav a { padding: 8px 15px; border-radius: var(--pill);
      color: var(--text2); font-weight: 600; font-size: var(--t-sm);
      border: 1px solid transparent; transition: color .14s ease, background .14s ease; }
    .nav a:hover { color: var(--text); background: var(--surface2); }
    .nav a.active { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
    .nav .sm { display: none; }
    .nav .masb { display: none; }
    .navf { display: none; }

    .right { display: flex; align-items: center; gap: 14px; justify-self: end; }
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
      .topbar { grid-template-columns: 1fr auto; gap: 12px 18px; }
      .nav { order: 3; grid-column: 1 / -1; justify-content: flex-start; }
    }

    /* barra inferior (móvil): la navegación vuelve al pulgar */
    @media (max-width: 760px) {
      .topbar { grid-template-columns: auto 1fr; padding: 9px 13px; gap: 10px; }
      .bs { display: none; }
      .bn { font-size: var(--t-md); }
      .right { gap: 10px; }
      .team { display: none; }
      .acc { gap: 10px; padding-left: 10px; }
      .tlink { font-size: var(--t-xs); letter-spacing: .1em; }
      .temp { max-width: 104px; font-size: var(--t-xs); padding: 5px 6px; }

      /* Admin y Salir se van al panel "Más": la cabecera se queda con la
         marca y el equipo, sin mezclar navegación con cuenta. */
      .acc { display: none; }

      .content { padding: 16px 14px 88px; }

      /* Una fila que se desliza con el dedo. Las sombras de los lados salen
         solas cuando queda algo por ver en esa dirección. */
      .nav {
        position: fixed; bottom: 0; left: 0; right: 0; z-index: 50;
        display: flex; flex-wrap: nowrap; gap: 2px;
        padding: 5px 22px calc(5px + env(safe-area-inset-bottom));
        scroll-padding: 0 22px;
        border-top: 1px solid var(--line);
        overflow-x: auto; overscroll-behavior-x: contain;
        scroll-snap-type: x proximity; scrollbar-width: none;
        touch-action: pan-x;
        background:
          linear-gradient(to right, var(--surface) 40%, transparent) left center / 26px 100% no-repeat local,
          linear-gradient(to left, var(--surface) 40%, transparent) right center / 26px 100% no-repeat local,
          radial-gradient(farthest-side at 0 50%, rgba(22,19,15,.16), transparent) left center / 13px 100% no-repeat scroll,
          radial-gradient(farthest-side at 100% 50%, rgba(22,19,15,.16), transparent) right center / 13px 100% no-repeat scroll,
          var(--surface);
      }
      .nav::-webkit-scrollbar { display: none; }
      .nav a, .nav .masb { flex: 0 0 auto; min-width: 76px; scroll-snap-align: center;
        padding: 10px 9px; text-align: center; border-radius: 8px;
        border: none; background: none; cursor: pointer; color: var(--text2);
        font-family: var(--fb); font-size: var(--t-xs); font-weight: 700;
        letter-spacing: .04em; text-transform: uppercase;
        -webkit-tap-highlight-color: transparent; }
      .nav a:active, .nav .masb:active { background: var(--surface2); }
      .nav a.active, .nav .masb.on { background: var(--accent-soft); color: var(--accent); }
      .nav .masb { display: block; margin-right: 4px; }
      .nav .lg { display: none; } .nav .sm { display: inline; }

      /* Van en el carril que les reserva la barra, así que no se comen
         ninguna sección: solo asoman en el margen. */
      .navf { display: flex; align-items: center; justify-content: center;
        position: fixed; z-index: 52; width: 22px; padding: 0;
        bottom: calc(5px + env(safe-area-inset-bottom));
        height: calc(var(--t-xs) * 1.5 + 20px);
        border: none; background: var(--surface); color: var(--text2);
        font-family: var(--fb); font-size: var(--t-lg); line-height: 1; cursor: pointer;
        touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
      .navf:active { color: var(--accent); }
      .navf.izq { left: 0; } .navf.der { right: 0; }

      .masback { position: fixed; inset: 0; z-index: 49; background: rgba(22,19,15,.42); }
      .maspanel { position: fixed; z-index: 51; left: 0; right: 0;
        bottom: calc(47px + env(safe-area-inset-bottom));
        display: flex; flex-direction: column;
        background: var(--surface); border-top: 1px solid var(--line);
        box-shadow: 0 -1px 0 var(--line); }
      .maspanel a, .maspanel button { padding: 15px 18px; text-align: left;
        border: none; background: none; cursor: pointer; color: var(--text);
        font-family: var(--fb); font-size: var(--t-md); font-weight: 600;
        border-bottom: 1px solid var(--line); touch-action: manipulation; }
      .maspanel a.on { color: var(--accent); }
      .maspanel button { color: var(--text2); }
      .massep { height: 7px; background: var(--surface2); border-bottom: 1px solid var(--line); }
    }
  `],
})
export class AppComponent implements AfterViewChecked {
  /** Panel con las opciones de cuenta (solo móvil). */
  mas = signal(false);

  // La barra inferior se desliza, y un contenedor con scroll cancela el clic
  // en cuanto el dedo se mueve. Así que el toque lo resolvemos nosotros:
  // si al levantar el dedo apenas se ha movido, es un toque y navegamos.
  private px = 0;
  private py = 0;

  /** Si la barra tiene recorrido a un lado, se enseña su flecha. */
  hayIzq = signal(false);
  hayDer = signal(false);
  @ViewChild('navref') navRef?: ElementRef<HTMLElement>;

  ngAfterViewChecked() { this.medir(); this.centrarActiva(); }

  /**
   * Al entrar en una sección, su pestaña puede quedar fuera de la barra o
   * cortada por el borde. Se la trae al centro una vez por cambio de ruta.
   */
  private ultimaCentrada = '';
  private centrarActiva() {
    const el = this.navRef?.nativeElement;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const ruta = this.router.url.split('?')[0];
    if (ruta === this.ultimaCentrada) return;
    const activa = el.querySelector<HTMLElement>('a.active');
    if (!activa) return;
    this.ultimaCentrada = ruta;
    const centro = activa.offsetLeft - (el.clientWidth - activa.offsetWidth) / 2;
    el.scrollTo({ left: Math.max(0, centro), behavior: 'smooth' });
  }
  @HostListener('window:resize') medir() {
    const el = this.navRef?.nativeElement;
    if (!el) { this.hayIzq.set(false); this.hayDer.set(false); return; }
    const resto = el.scrollWidth - el.clientWidth;
    this.hayIzq.set(el.scrollLeft > 4);
    this.hayDer.set(resto > 4 && el.scrollLeft < resto - 4);
  }
  /** Un toque en la flecha mueve la barra poco menos de una pantalla. */
  desplazar(dir: number) {
    const el = this.navRef?.nativeElement;
    el?.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: 'smooth' });
  }
  tocar(e: PointerEvent) { this.px = e.clientX; this.py = e.clientY; }
  soltar(e: PointerEvent, path: string) {
    if (Math.abs(e.clientX - this.px) < 12 && Math.abs(e.clientY - this.py) < 12) {
      this.mas.set(false);
      this.router.navigateByUrl(path);
    }
  }

  get team() {
    return environment.devEquipoNombre || localStorage.getItem('falm_equipo') ||
      (this.auth.user()?.user_metadata?.['equipo'] as string) || '';
  }
  /** Dos letras para el avatar: las iniciales del equipo, como en una camiseta. */
  get iniciales() {
    const p = (this.team || '?').trim().split(/\s+/);
    return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?';
  }

  /** Línea de contexto bajo la marca: qué temporada se está mirando. Mientras
   *  llega la consulta se usa la de la última visita, y si no hay, nada: un
   *  texto de relleno solo sirve para que luego cambie delante del usuario. */
  contexto = computed(() => {
    const t = this.season.actual();
    return t ? `Liga ${t.nombre}${t.activa ? '' : ' · pruebas'}` : this.season.nombreCache();
  });

  /**
   * En el móvil la barra dice lo mismo que el menú de escritorio: la misma
   * palabra, recortada cuando no cabe. Sinónimos distintos arriba y abajo
   * (Plantilla/Equipo, Alineación/Once) hacían dudar si eran lo mismo.
   */
  items: NavItem[] = [
    { path: '/dashboard', label: 'Inicio', corto: 'Inicio' },
    { path: '/plantilla', label: 'Plantilla', corto: 'Plantilla' },
    { path: '/alineacion', label: 'Alineación', corto: 'Alineac.' },
    { path: '/mercado', label: 'Mercado', corto: 'Mercado' },
    { path: '/fichajes', label: 'Fichajes', corto: 'Fichajes' },
    { path: '/draft', label: 'Draft', corto: 'Draft' },
    { path: '/clasificacion', label: 'Clasificación', corto: 'Clasif.' },
    { path: '/jornadas', label: 'Partidos', corto: 'Partidos' },
    { path: '/puntuaciones', label: 'Estadísticas', corto: 'Estadís.' },
  ];

  /** El enlace de administración solo se le enseña a quien puede usarlo. */
  esAdmin = signal(false);

  constructor(public auth: AuthService, public season: SeasonService,
              private router: Router, falm: FalmService, private sb: SupabaseService) {
    season.ensure();
    falm.warmup(); // despierta el dyno del backend al arrancar
    // Hay que esperar a la sesión: preguntado en el constructor, la llamada sale
    // como anon, que no tiene permiso, y el enlace no aparecía nunca.
    effect(() => {
      if (!this.auth.session()) { this.esAdmin.set(false); return; }
      this.sb.client.rpc('es_admin').then(({ data }) => this.esAdmin.set(data === true));
    });
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
