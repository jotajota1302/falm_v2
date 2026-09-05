import { Component, HostListener, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavFichajesComponent } from '../../shared/nav-fichajes.component';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ActivoLibre, Equipo, FalmService, ItemPlantilla, JornadaFalm, PuntosJugador } from '../../core/falm.service';
import { carasDePorterias } from '../../shared/caras-libres';
import { FichaService } from '../../shared/ficha.service';

const POS = ['PORTERO', 'DEFENSA', 'MEDIO', 'DELANTERO'];

/** Petición de fichaje semanal: hasta dos objetivos por prioridad. */
@Component({
  selector: 'app-fichajes',
  standalone: true,
  imports: [FormsModule, RouterLink, NavFichajesComponent],
  template: `
    <header class="phead">
      <div>
        <h1>Fichajes</h1>
        <p class="sub">Pide hasta dos jugadores por orden de prioridad.</p>
      </div>
    </header>

    <falm-nav-fichajes />

    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else if (error()) {
      <p class="err">{{ error() }}</p>
    } @else {
      <div class="cols">
        <section class="tabla">
          <div class="barra">
            <span class="lb">Libres</span>
            <div class="chips">
              <button [class.on]="!posFiltro()" (click)="posFiltro.set(''); limite.set(30)">Todos</button>
              @for (p of pos; track p) {
                <button [class.on]="posFiltro() === p" (click)="togglePos(p)">{{ abr(p) }}</button>
              }
            </div>
            <input class="buscar" type="search" placeholder="Buscar jugador o club…"
                   [ngModel]="texto()" (ngModelChange)="texto.set($event); limite.set(30)" />
          </div>

          <div class="fila cab">
            <span>Pos</span><span></span><span>Jugador</span><span>Club</span>
            <span class="der">Pts</span><span></span>
          </div>

          @if (visibles().length === 0) {
            <p class="vacio muted">No hay jugadores para ese filtro.</p>
          } @else {
            @for (a of visibles().slice(0, limite()); track a.activo_id) {
              <div class="fila" [class.pedido]="prioridadDe(a)">
                <span class="pos" [class]="abr(a.posicion)">{{ abr(a.posicion) }}</span>
                @if (foto(a)) {
                  <img class="fo" [src]="foto(a)" alt="" loading="lazy" (error)="sinFoto(a)" />
                } @else if (a.escudo) {
                  <img class="fo es" [src]="a.escudo" alt="" loading="lazy" />
                } @else { <span class="fo"></span> }
                <button class="nom" (click)="verFicha(a)">{{ a.nombre }}</button>
                <span class="club">
                  @if (a.escudo) { <img [src]="a.escudo" alt="" loading="lazy" /> }
                  {{ a.club }}
                </span>
                <span class="pts num" [class.cero]="!ptsDe(a)">{{ ptsDe(a) }}</span>
                <button class="pedir" [class.on]="prioridadDe(a)" (click)="toggle(a)">
                  {{ prioridadDe(a) ? prioridadDe(a) + 'ª opción' : 'Pedir' }}
                </button>
              </div>
            }
          }
        </section>

        <aside class="lado">
          <div class="caja">
            <div class="ch">
              <h2>Mis peticiones</h2>
              <span class="sm">{{ p2() ? 2 : p1() ? 1 : 0 }} de 2</span>
            </div>
            @for (s of [1, 2]; track s) {
              @if (sel(s); as a) {
                <div class="slot lleno">
                  <span class="prio num">{{ s }}</span>
                  <div class="sw">
                    <span class="sn">{{ a.nombre }}</span>
                    <span class="smeta">{{ abr(a.posicion) }} · {{ a.club }}</span>
                  </div>
                  <button class="rm" (click)="quitar(s)" aria-label="Quitar">✕</button>
                </div>
              } @else {
                <div class="slot">
                  <span class="prio num">{{ s }}</span>
                  <span class="vacia">{{ s === 1 ? 'Elige un jugador de la lista' : 'Segunda opción (opcional)' }}</span>
                </div>
              }
            }
            <!-- La regla de desempate, junto a lo que has pedido: es donde
                 sirve, y en la cabecera ocupaba tres líneas. -->
            <p class="regla">Si otro equipo pide al mismo jugador, gana quien no fichó la
              semana pasada; si sigue el empate, el peor clasificado.</p>

            <div class="pieCaja">
              <span class="lb">La plantilla no puede pasar de 23 jugadores</span>
              <button class="btn" [disabled]="!p1() || enviando()" (click)="enviar()">
                {{ enviando() ? 'Enviando…' : 'Enviar' }}
              </button>
            </div>
          </div>

          @if (aviso()) { <p class="aviso">{{ aviso() }}</p> }

          <div class="caja">
            <button class="lhead" (click)="verLesion.set(!verLesion())">
              <h2>Fichaje por lesión</h2>
              <span class="chev">{{ verLesion() ? '−' : '+' }}</span>
            </button>
            @if (verLesion()) {
              <p class="lhint">Si un jugador tuyo se lesiona de larga duración, pide un fichaje extra
                adjuntando la noticia. Lo revisa el gestor.</p>
              @for (fe of extras(); track fe.id) {
                <div class="lrow">
                  <span class="ln">{{ fe.lesionado }}</span>
                  @if (fe.url) { <a class="lurl" [href]="fe.url" target="_blank" rel="noopener">noticia ↗</a> }
                  <span class="lest" [class.usado]="fe.usado">{{ fe.usado ? 'Usado' : 'Disponible' }}</span>
                </div>
              }
              <div class="lform">
                <select [ngModel]="lesionadoId()" (ngModelChange)="lesionadoId.set($event)">
                  <option value="">— jugador lesionado —</option>
                  @for (j of miPlantilla(); track j.activo_id) { <option [value]="j.activo_id">{{ j.nombre }}</option> }
                </select>
                <input type="url" placeholder="URL de la noticia (opcional)" [ngModel]="urlLesion()" (ngModelChange)="urlLesion.set($event)" />
                <button class="btn" [disabled]="!lesionadoId() || enviandoLesion()" (click)="solicitarLesion()">
                  {{ enviandoLesion() ? 'Enviando…' : 'Solicitar' }}
                </button>
              </div>
            }
          </div>
        </aside>
      </div>

      <div class="pie">
        <span class="muted">{{ mostrados() }} de {{ visibles().length }} libres</span>
        @if (visibles().length > limite()) {
          <button class="btn-sec" (click)="limite.set(limite() + 30)">Ver 30 más</button>
        }
      </div>
    }
  `,
  styles: [`
    .cols { display: flex; align-items: flex-start; gap: 18px; flex-wrap: wrap; }
    .tabla { flex: 1 1 560px; min-width: 0; }
    .lado { flex: 1 1 300px; min-width: 280px; display: flex; flex-direction: column; gap: 14px; }

    .barra .buscar { margin-left: auto; flex: 0 1 220px; padding: 7px 13px; font-size: var(--t-sm); border-radius: var(--pill); }
    .fila { grid-template-columns: 46px 26px 1.8fr 130px 56px 92px; padding: 7px 18px; }
    /* Misma cara, mismo escudo y misma cifra que en Mercado: es la misma lista. */
    .fo { width: 26px; height: 26px; border-radius: 50%; object-fit: cover;
      object-position: top center; background: var(--surface2); }
    .fo.es { object-fit: contain; padding: 3px; border: 1px solid var(--line); }
    .pts { font-family: var(--fm); text-align: right; }
    /* El cero se distingue por el gris, no por un aro: en la columna de puntos
       todos los números tienen que verse iguales. */
    .pts.cero { color: var(--text2); }
    /* Lo pedido se marca en el papel, para no perderlo al desplazar la lista. */
    .fila.pedido { background: var(--accent-soft); }
    .nom { background: none; border: none; padding: 0; text-align: left; cursor: pointer;
      font-family: var(--fb); font-size: var(--t-md); font-weight: 700; color: var(--text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .nom:hover { color: var(--accent); }
    .club { display: flex; align-items: center; gap: 7px; color: var(--text2);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .club img { width: 18px; height: 18px; object-fit: contain; flex: 0 0 auto; }
    .pedir { background: var(--surface); border: 1px solid var(--line); color: var(--text2);
      border-radius: 8px; padding: 6px 0; cursor: pointer; font-family: var(--fb); font-weight: 700; font-size: var(--t-xs); }
    .pedir:hover { border-color: var(--accent); color: var(--accent); }
    .pedir.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
    .vacio { padding: 22px 18px; margin: 0; font-size: var(--t-sm); }

    .caja { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 16px; }
    .ch { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
    .ch .sm { font-size: var(--t-sm); color: var(--text2); }

    .slot { display: flex; align-items: center; gap: 10px; padding: 10px 12px; margin-bottom: 8px;
      border: 1px dashed var(--line); border-radius: 12px; }
    .slot.lleno { border-style: solid; background: var(--surface2); }
    .prio { width: 22px; height: 22px; border-radius: 50%; flex: 0 0 auto;
      display: flex; align-items: center; justify-content: center; font-size: var(--t-xs);
      background: var(--surface); border: 1px solid var(--line); color: var(--text2); }
    .slot.lleno .prio { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
    .sw { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .sn { font-size: var(--t-md); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .smeta { font-size: var(--t-xs); color: var(--text2); }
    .vacia { color: var(--text2); font-size: var(--t-sm); }
    .rm { background: transparent; border: 1px solid var(--line); color: var(--bad);
      width: 26px; height: 26px; border-radius: 7px; cursor: pointer; font-size: var(--t-xs); flex: 0 0 auto; }

    .regla { margin: 12px 0 0; font-size: var(--t-xs); color: var(--text2); line-height: 1.5; }

    .pieCaja { display: flex; align-items: center; justify-content: space-between; gap: 12px;
      margin-top: 14px; padding-top: 13px; border-top: 1px solid var(--line); }
    .pieCaja strong { display: block; margin-top: 2px; font-size: var(--t-lg); font-weight: 700; }
    .pieCaja strong.neg { color: var(--bad); }
    .pieCaja strong small { font-size: var(--t-xs); color: var(--text2); }

    .aviso { margin: 0; background: var(--accent-soft); border: 1px solid var(--accent-line);
      color: var(--accent); padding: 11px 14px; border-radius: var(--r-sm); font-size: var(--t-sm); }

    .lhead { width: 100%; display: flex; align-items: center; justify-content: space-between;
      background: none; border: none; padding: 0; cursor: pointer; color: var(--text); }
    .lhead .chev { color: var(--text2); font-family: var(--fm); font-size: var(--t-md); }
    .lhint { margin: 12px 0; color: var(--text2); font-size: var(--t-sm); }
    .lrow { display: flex; align-items: center; gap: 10px; padding: 8px 10px; margin-bottom: 7px;
      background: var(--surface2); border: 1px solid var(--line); border-radius: 9px; }
    .lrow .ln { flex: 1; font-weight: 700; font-size: var(--t-sm); }
    .lurl { color: var(--accent); font-size: var(--t-xs); }
    .lest { font-size: var(--t-xs); font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--good); }
    .lest.usado { color: var(--text2); }
    .lform { display: flex; flex-direction: column; gap: 8px; }
    .lform select, .lform input { width: 100%; }

    .muted { color: var(--text2); } .err { color: var(--bad); }

    @media (max-width: 860px) {
      /* Lo que has pedido, primero: es a lo que se viene a esta pantalla. */
      .lado { order: -1; }
      /* Se va el club, no los puntos: quedan cinco celdas y cinco columnas. */
      .fila { grid-template-columns: 36px 26px 1fr 44px 82px; gap: 8px; padding: 8px 13px; }
      .fila > :nth-child(4) { display: none; }
      .nom { font-size: var(--t-sm); }
      /* Mismo caso que en el mercado: el rótulo "Libres" estorba más que informa. */
      .barra .lb { display: none; }
      .barra .buscar { margin-left: 0; flex: 1 1 100%; }
    }
  `],
})
export class FichajesComponent implements OnInit {
  pos = POS;
  equipo = signal<Equipo | null>(null);
  jornada = signal<JornadaFalm | null>(null);
  mercado = signal<ActivoLibre[]>([]);
  private caras = signal<Record<string, string>>({});
  private rotas = signal<Set<string>>(new Set());
  acum = signal<Record<number, PuntosJugador>>({});
  p1 = signal<ActivoLibre | null>(null);
  p2 = signal<ActivoLibre | null>(null);
  texto = signal('');
  posFiltro = signal('');
  limite = signal(30);

  /** Cuántos se pintan de verdad: el pie decía el total y solo salían 30. */
  mostrados = computed(() => Math.min(this.limite(), this.visibles().length));

  /** Al llegar al final de la lista entran las siguientes 30, sin buscar el botón. */
  @HostListener('window:scroll')
  alDesplazar() {
    if (this.visibles().length <= this.limite()) return;
    const e = document.documentElement;
    if (e.scrollHeight - e.scrollTop - e.clientHeight < 700) this.limite.update((n) => n + 30);
  }
  cargando = signal(true);
  enviando = signal(false);
  error = signal('');
  aviso = signal('');
  // Fichaje por lesión
  miPlantilla = signal<ItemPlantilla[]>([]);
  extras = signal<{ id: string; lesionado: string; url: string | null; usado: boolean }[]>([]);
  verLesion = signal(false);
  lesionadoId = signal('');
  urlLesion = signal('');
  enviandoLesion = signal(false);

  visibles = computed(() => {
    const f = this.texto().trim().toLowerCase();
    const p = this.posFiltro();
    return this.mercado()
      .filter((a) =>
        (!p || a.posicion === p) &&
        (!f || a.nombre.toLowerCase().includes(f) || a.club.toLowerCase().includes(f)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  });

  constructor(private falm: FalmService, public ficha: FichaService) {}

  abr(p: string) { return ({ PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' } as Record<string, string>)[p] ?? p; }
  sel(s: number) { return s === 1 ? this.p1() : this.p2(); }
  ptsDe(a: ActivoLibre) { return a.ext_id != null ? Number(this.acum()[a.ext_id]?.puntosTotales ?? 0) : 0; }

  /** La cara del activo; una portería lleva la del portero de ese club. */
  foto(a: ActivoLibre): string | null {
    if (this.rotas().has(a.activo_id)) return null;
    return a.foto ?? (a.club_id ? this.caras()[a.club_id] ?? null : null);
  }
  sinFoto(a: ActivoLibre) { const r = new Set(this.rotas()); r.add(a.activo_id); this.rotas.set(r); }
  prioridadDe(a: ActivoLibre): number | null {
    if (this.p1()?.activo_id === a.activo_id) return 1;
    if (this.p2()?.activo_id === a.activo_id) return 2;
    return null;
  }
  togglePos(p: string) { this.posFiltro.set(this.posFiltro() === p ? '' : p); this.limite.set(30); }

  /** Pedir: si ya está elegido lo quita; si no, ocupa la primera prioridad libre. */
  toggle(a: ActivoLibre) {
    const pr = this.prioridadDe(a);
    if (pr === 1) { this.p1.set(null); return; }
    if (pr === 2) { this.p2.set(null); return; }
    if (!this.p1()) this.p1.set(a);
    else if (!this.p2()) this.p2.set(a);
    else this.p1.set(a); // ambas llenas: reemplaza la 1ª
  }
  quitar(s: number) { (s === 1 ? this.p1 : this.p2).set(null); }

  verFicha(a: ActivoLibre) {
    if (a.ext_id) this.ficha.open({ id: a.ext_id, nombre: a.nombre, equipo: a.club, escudo: a.escudo ?? '', foto: a.foto ?? '', posicion: a.posicion });
  }

  async ngOnInit() {
    try {
      const [eq, jor, merc, acum] = await Promise.all([
        this.falm.miEquipo(), this.falm.jornadaActualLiga(), this.falm.mercadoLibre(), this.falm.puntuacionesAcumuladas(),
      ]);
      this.equipo.set(eq); this.jornada.set(jor); this.mercado.set(merc);
      const m: Record<number, PuntosJugador> = {};
      for (const p of acum) m[p.jugador.id] = p;
      this.acum.set(m);
      this.caras.set(await carasDePorterias(this.falm, merc));
      if (eq) {
        const [mp, ex] = await Promise.all([this.falm.miPlantilla(eq.id), this.falm.fichajesExtra(eq.id)]);
        this.miPlantilla.set(mp); this.extras.set(ex);
      }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error cargando fichajes');
    } finally {
      this.cargando.set(false);
    }
  }

  async solicitarLesion() {
    this.aviso.set(''); this.error.set('');
    if (environment.devEquipoNombre) {
      this.aviso.set('Modo demo: la solicitud de fichaje por lesión se enviará al activar tu cuenta (login).');
      return;
    }
    const eq = this.equipo();
    if (!eq || !this.lesionadoId()) return;
    this.enviandoLesion.set(true);
    try {
      await this.falm.crearFichajeExtra(eq.id, this.lesionadoId(), this.urlLesion().trim());
      this.aviso.set('Solicitud de fichaje por lesión enviada.');
      this.lesionadoId.set(''); this.urlLesion.set('');
      this.extras.set(await this.falm.fichajesExtra(eq.id));
    } catch (e: any) { this.error.set(e?.message ?? 'Error al solicitar'); }
    finally { this.enviandoLesion.set(false); }
  }

  async enviar() {
    this.aviso.set(''); this.error.set('');
    if (environment.devEquipoNombre) {
      this.aviso.set('Modo demo: la petición no se envía hasta que actives tu cuenta (login). El formulario es totalmente funcional.');
      return;
    }
    const eq = this.equipo(); const jor = this.jornada();
    if (!eq || !jor || !this.p1()) return;
    const opciones = [{ activo_id: this.p1()!.activo_id, prioridad: 1 }];
    if (this.p2()) opciones.push({ activo_id: this.p2()!.activo_id, prioridad: 2 });
    this.enviando.set(true);
    try {
      await this.falm.crearPeticion(eq.id, jor.id, opciones);
      this.aviso.set('Petición enviada.');
      this.p1.set(null); this.p2.set(null);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al enviar');
    } finally {
      this.enviando.set(false);
    }
  }
}
