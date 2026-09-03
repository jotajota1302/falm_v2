import { Component, OnDestroy, OnInit, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivoLibre } from '../../core/falm.service';
import { DraftService, MIN_PORTERIAS } from './draft.service';

const POS = ['PORTERO', 'DEFENSA', 'MEDIO', 'DELANTERO'];
const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/**
 * Tablero del draft en vivo. El catálogo se carga entero una vez y se filtra en
 * cliente, para que buscar no dependa de la red justo cuando te toca elegir.
 */
@Component({
  selector: 'app-draft',
  standalone: true,
  imports: [FormsModule],
  providers: [DraftService],
  template: `
    <header class="phead">
      <div>
        <h1>Draft</h1>
        <p class="sub">
          El turno no avanza hasta que el equipo al que le toca elige. Marca con ★ a quien
          quieras vigilar: si otro se te adelanta, lo verás tacharse al instante.
          Máximo 2 jugadores del Madrid, Barcelona o Atlético, y 3 de cualquier otro club.
        </p>
      </div>
    </header>

    @if (d.cargando()) {
      <p class="muted">Cargando draft…</p>
    } @else if (d.error()) {
      <p class="err">{{ d.error() }}</p>
    } @else if (!d.draft()) {
      <p class="muted">No hay ningún draft activo. Se crea desde Admin · Pretemporada.</p>
    } @else if (!d.miEquipoId()) {
      <p class="muted">
        Tu usuario no tiene ningún equipo asignado en esta temporada.
        Habla con el administrador de la liga.
      </p>
    } @else if (terminado()) {
      <section class="tabla">
        <div class="barra">
          <span class="lb">Draft terminado · tu plantilla</span>
          <span class="muted num">
            {{ d.misPicks().length }} jugadores · {{ d.misPorterias() }} porterías
          </span>
        </div>
        <div class="fila cab res"><span>Pos</span><span>Jugador</span><span>Club</span></div>
        @for (a of misFichados(); track a.activo_id) {
          <div class="fila res">
            <span class="pos" [class]="abr(a.posicion)">{{ abr(a.posicion) }}</span>
            <span class="nom">{{ a.nombre }}</span>
            <span class="club">{{ a.club }}</span>
          </div>
        }
      </section>
    } @else {
      <!-- La tira de turno se queda pegada arriba: es el dato que se mira sin parar. -->
      <div class="tira" [class.mio]="d.esMiTurno()">
        <span class="lb">{{ d.esMiTurno() ? 'Es tu turno' : 'Turno' }}</span>
        <strong>{{ nombreEquipo(d.turno()?.equipo_falm_id) }}</strong>
        <span class="ronda">Ronda <b class="num">{{ d.turno()?.ronda ?? '—' }}</b></span>
        @if (!d.conectado()) { <span class="chip chip-warn">Reconectando…</span> }
      </div>

      <div class="kpis">
        <div class="kpi">
          <span class="lb">Tu plantilla</span>
          <span class="v num">{{ d.misPicks().length }}<small>/{{ d.draft()!.total_rondas }}</small></span>
        </div>
        <div class="kpi">
          <span class="lb">Porterías</span>
          <span class="v num" [class.falta]="d.misPorterias() < minPorterias">
            {{ d.misPorterias() }}<small>/{{ minPorterias }}</small>
          </span>
        </div>
        <div class="kpi">
          <span class="lb">Pick</span>
          <span class="v num">{{ d.draft()!.picks_hechos + 1 }}<small>/{{ d.draft()!.picks_totales }}</small></span>
        </div>
        <div class="kpi">
          <span class="lb">Te toca en</span>
          <span class="v num">
            @if (d.esMiTurno()) { ya } @else if (d.picksHastaMiTurno() > 0) {
              {{ d.picksHastaMiTurno() }}
            } @else { — }
          </span>
        </div>
      </div>

      @if (d.debeElegirPorteria()) {
        <p class="nota">
          Te quedan {{ d.misTurnosRestantes() }} turnos y te faltan
          {{ minPorterias - d.misPorterias() }} porterías: solo puedes elegir portería.
        </p>
      }
      @if (msg()) { <p class="nota mal" (click)="msg.set('')">{{ msg() }}</p> }

      <div class="cols">
        <section class="tabla">
          <div class="barra">
            <span class="lb">Fichables</span>
            <button [class.on]="!posFiltro()" (click)="posFiltro.set(''); limite.set(30)">Todos</button>
            @for (p of pos; track p) {
              <button class="pos-f" [class]="abr(p)" [class.on]="posFiltro() === p"
                      (click)="togglePos(p)">{{ abr(p) }}</button>
            }
            <button [class.on]="soloCola()" (click)="soloCola.set(!soloCola())">★ Mi cola</button>
            <button [class.on]="!soloLibres()" (click)="soloLibres.set(!soloLibres())">Ver fichados</button>
            <input class="buscar" type="search" placeholder="Buscar jugador o club…"
                   [ngModel]="texto()" (ngModelChange)="texto.set($event); limite.set(30)" />
          </div>

          <div class="fila cab">
            <span></span><span>Pos</span><span>Jugador</span><span>Club</span>
            <span class="der">Cupo</span><span></span>
          </div>

          @if (visibles().length === 0) {
            <p class="vacio muted">No hay jugadores para ese filtro.</p>
          } @else {
            @for (a of visibles().slice(0, limite()); track a.activo_id) {
              <div class="fila" [class.tomado]="!!tomado(a)">
                <button class="estrella" [class.on]="enCola(a)" (click)="alternarCola(a)"
                        [attr.aria-label]="enCola(a) ? 'Quitar de mi cola' : 'Añadir a mi cola'">
                  {{ enCola(a) ? '★' : '☆' }}
                </button>
                <span class="pos" [class]="abr(a.posicion)">{{ abr(a.posicion) }}</span>
                <span class="nom">
                  @if (a.foto) {
                    <img class="ret" [src]="a.foto" alt="" loading="lazy" />
                  } @else if (a.escudo) {
                    <img class="ret esc" [src]="a.escudo" alt="" loading="lazy" />
                  } @else {
                    <span class="ret sin">{{ a.nombre.charAt(0) }}</span>
                  }
                  {{ a.nombre }}
                </span>
                <span class="club">
                  @if (a.escudo) { <img [src]="a.escudo" alt="" loading="lazy" /> }
                  {{ a.club }}
                </span>
                <span class="der num cupo" [class.lleno]="clubLleno(a)"
                      [title]="'Máximo ' + (a.limite_club ?? 3) + ' de ' + a.club">
                  {{ cupoUsado(a) }}/{{ a.limite_club ?? 3 }}
                </span>
                @if (tomado(a)) {
                  <span class="chip">{{ nombreEquipo(tomado(a)) }}</span>
                } @else {
                  <button class="btn" [disabled]="!puedeFichar(a)" (click)="fichar(a)">Fichar</button>
                }
              </div>
            }
          }
        </section>

        <aside class="lat">
          <section class="card">
            <h3>Mi cola</h3>
            <label class="prepick">
              <input type="checkbox" [ngModel]="prePick()" (ngModelChange)="prePick.set($event)" />
              Pre-pick: fichar solo al llegar mi turno
            </label>
            @if (colaVisible().length === 0) {
              <p class="muted mini">Marca jugadores con ★ para tenerlos aquí.</p>
            } @else {
              <p class="muted mini">
                <b class="num">{{ colaFichados() }}</b> de tus <b class="num">{{ d.cola().length }}</b> ya fichados
              </p>
              <ol class="cola">
                @for (a of colaVisible(); track a.activo_id; let i = $index) {
                  <li [class.tomado]="!!tomado(a)">
                    <span class="p num">{{ i + 1 }}</span>
                    <span class="pos" [class]="abr(a.posicion)">{{ abr(a.posicion) }}</span>
                    <span class="nom">{{ a.nombre }}</span>
                    <button class="mv" (click)="d.moverCola(a.activo_id, -1)" aria-label="Subir">↑</button>
                    <button class="mv" (click)="d.moverCola(a.activo_id, 1)" aria-label="Bajar">↓</button>
                  </li>
                }
              </ol>
            }
          </section>

          <section class="card">
            <h3>Próximos turnos</h3>
            <ol class="orden">
              @for (o of proximosTurnos(); track o.orden_global; let i = $index) {
                <li [class.ahora]="i === 0" [class.yo]="o.equipo_falm_id === d.miEquipoId()">
                  <span class="p num">{{ i === 0 ? '▶' : i }}</span>
                  <span class="nom">{{ nombreEquipo(o.equipo_falm_id) }}</span>
                  <span class="r num">R{{ o.ronda }}</span>
                </li>
              }
            </ol>
          </section>
        </aside>
      </div>

      @if (d.soyGestor()) {
        <section class="tabla global">
          <div class="barra">
            <span class="lb">Vista general</span>
            <span class="muted"><b class="num">{{ d.draft()!.picks_hechos }}/{{ d.draft()!.picks_totales }}</b> picks</span>
            <button class="plegar" (click)="verGlobal.set(!verGlobal())">
              {{ verGlobal() ? 'Ocultar' : 'Mostrar' }}
            </button>
          </div>
          @if (verGlobal()) {
            <div class="fila cab gl">
              <span>Equipo</span><span class="der">Picks</span><span class="der">Port.</span>
              <span class="der">PT</span><span class="der">DF</span><span class="der">MC</span>
              <span class="der">DL</span><span>Último</span>
            </div>
            @for (e of resumenEquipos(); track e.id) {
              <div class="fila gl" [class.turno-de]="e.id === d.turno()?.equipo_falm_id"
                   [class.miequipo]="e.id === d.miEquipoId()">
                <span class="nom">{{ e.nombre }}</span>
                <span class="der num">{{ e.picks }}</span>
                <span class="der num" [class.falta]="e.porterias < minPorterias">{{ e.porterias }}</span>
                <span class="der num">{{ e.PT }}</span>
                <span class="der num">{{ e.DF }}</span>
                <span class="der num">{{ e.MC }}</span>
                <span class="der num">{{ e.DL }}</span>
                <span class="ult faint">{{ e.ultimo }}</span>
              </div>
            }
          }
        </section>
      }

      <div class="pie">
        <span class="muted">
          <b class="num">{{ visibles().length }}</b> jugadores ·
          <b class="num">{{ d.draft()!.picks_hechos }}</b> fichados en total
        </span>
        @if (visibles().length > limite()) {
          <button class="btn-sec" (click)="limite.set(limite() + 30)">Ver 30 más</button>
        }
      </div>
    }
  `,
  styles: [`
    /* Cabecera y tira de turno centradas: es lo que todos miran a la vez. */
    .phead { display: block; text-align: center; }
    .phead .sub { max-width: 66ch; margin-left: auto; margin-right: auto; }

    .tira { position: sticky; top: 0; z-index: 6; display: flex; align-items: center; gap: 12px;
      flex-wrap: wrap; justify-content: center; padding: 12px 18px; margin-bottom: 16px;
      background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); }
    .tira strong { font-family: var(--fh); font-weight: 600; font-size: var(--t-xl);
      line-height: 1; text-transform: uppercase; }
    .tira .ronda { font-size: var(--t-sm); color: var(--text2); font-family: var(--fb); }
    .tira .lb, .tira .chip { font-family: var(--fb); }
    .tira.mio { background: var(--accent-soft); border-color: var(--accent-line); }
    .tira.mio strong { color: var(--accent); }

    .kpis { justify-content: center; }
    .kpi .v.falta { color: var(--bad); }

    .nota { padding: 11px 16px; margin: 0 0 12px; font-size: var(--t-sm);
      border-radius: var(--r-sm); background: var(--surface); border: 1px solid var(--accent-line); }
    .nota.mal { border-color: var(--bad); color: var(--bad); cursor: pointer; }

    .cols { display: grid; grid-template-columns: 1fr 300px; gap: 16px; align-items: start; }

    .barra { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      padding: 13px 18px; border-bottom: 1px solid var(--line); }
    .barra .lb { margin-right: 2px; }
    .barra button { background: var(--surface); border: 1px solid var(--line); color: var(--text2);
      border-radius: var(--pill); padding: 6px 14px; cursor: pointer; font-weight: 600;
      font-size: var(--t-sm); font-family: var(--fb); }
    .barra button.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
    .barra button.pos-f.on.POR { background: var(--por); border-color: var(--por); }
    .barra button.pos-f.on.DEF { background: var(--def); border-color: var(--def); }
    .barra button.pos-f.on.MED { background: var(--med); border-color: var(--med); }
    .barra button.pos-f.on.DEL { background: var(--del); border-color: var(--del); }
    .barra .buscar { margin-left: auto; flex: 0 1 210px; padding: 7px 13px;
      font-size: var(--t-sm); border-radius: var(--pill); }

    .fila { display: grid; align-items: center; gap: 10px;
      grid-template-columns: 28px 46px 1.6fr 140px 66px 94px;
      padding: 8px 18px; border-bottom: 1px solid var(--line); font-size: var(--t-sm); }
    .fila:last-child { border-bottom: none; }
    .fila:not(.cab):hover { background: var(--surface2); }
    .fila.cab { padding: 11px 18px; }
    .fila.cab > span { font-size: var(--t-xs); font-weight: 700; letter-spacing: .16em;
      text-transform: uppercase; color: var(--text2); }
    .fila.res { grid-template-columns: 46px 1.6fr 1fr; }
    .fila.tomado { color: var(--text2); }
    .fila.tomado .nom { text-decoration: line-through; font-weight: 600; }
    .fila.tomado .pos, .fila.tomado .precio { opacity: .5; }
    .nom { font-weight: 700; min-width: 0; display: flex; align-items: center; gap: 9px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cola .nom, .orden .nom { display: block; text-overflow: ellipsis; }
    .ret { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex: 0 0 auto;
      background: var(--surface2); border: 1px solid var(--line); }
    .ret.esc { object-fit: contain; padding: 4px; background: var(--surface); }
    .ret.sin { display: flex; align-items: center; justify-content: center;
      font-size: var(--t-xs); color: var(--text2); font-weight: 700; }

    .club { display: flex; align-items: center; gap: 6px; color: var(--text2);
      font-size: var(--t-xs); letter-spacing: .06em; text-transform: uppercase;
      min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .club img { width: 16px; height: 16px; object-fit: contain; flex: 0 0 auto; }
    .cupo { color: var(--text2); font-size: var(--t-xs); }
    .cupo.lleno { color: var(--bad); font-weight: 700; }
    .fila .btn { padding: 6px 12px; font-size: var(--t-sm); }
    .fila .chip { justify-self: start; min-width: 0; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
    .estrella { background: none; border: none; padding: 0; cursor: pointer;
      font-size: var(--t-md); color: var(--text2); line-height: 1; }
    .estrella.on { color: var(--por); }
    .vacio { padding: 22px 18px; margin: 0; font-size: var(--t-sm); }

    .lat { display: flex; flex-direction: column; gap: 14px; }
    .lat .card { padding: 14px 16px; }
    .lat h3 { margin-bottom: 10px; }
    .mini { font-size: var(--t-xs); margin: 0; }
    .prepick { display: flex; gap: 7px; align-items: flex-start; margin-bottom: 10px;
      font-size: var(--t-xs); color: var(--text2); line-height: 1.35; cursor: pointer; }
    .prepick input { margin: 1px 0 0; }

    .cola, .orden { list-style: none; padding: 0; margin: 9px 0 0; }
    .cola li, .orden li { display: grid; align-items: center; gap: 8px;
      padding: 6px 7px; border-bottom: 1px solid var(--line); font-size: var(--t-sm);
      border-radius: var(--r-xs); }
    .cola li { grid-template-columns: 14px 34px 1fr 22px 22px; }
    .orden li { grid-template-columns: 16px 1fr 30px; }
    .cola li:last-child, .orden li:last-child { border-bottom: none; }
    .cola li.tomado { color: var(--text2); }
    .cola li.tomado .nom { text-decoration: line-through; }
    .cola .p, .orden .p { color: var(--text2); font-size: var(--t-xs); }
    .cola .pos { font-size: 8.5px; padding: 2px 0; }
    .mv { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-xs);
      color: var(--text2); cursor: pointer; font-size: var(--t-xs); line-height: 1; padding: 3px 0; }
    .mv:hover { border-color: var(--accent); color: var(--accent); }
    .orden li.ahora { background: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent);
      border-bottom-color: transparent; }
    .orden li.ahora .nom { font-weight: 800; color: var(--accent); }
    .orden li.ahora .p { color: var(--accent); }

    .orden li.yo .nom { color: var(--accent); }
    .orden li.yo:not(.ahora) .nom { font-style: italic; }

    .global { margin-top: 16px; }
    .global .plegar { margin-left: auto; background: var(--surface); border: 1px solid var(--line);
      color: var(--text2); border-radius: var(--pill); padding: 5px 12px; cursor: pointer;
      font-size: var(--t-xs); font-weight: 700; font-family: var(--fb); }
    .fila.gl { grid-template-columns: 1.4fr 54px 54px 40px 40px 40px 40px 1.3fr; }
    .fila.gl .num.falta { color: var(--bad); font-weight: 700; }
    .fila.gl.turno-de { background: var(--accent-soft); }
    .fila.gl.turno-de .nom { color: var(--accent); }
    .fila.gl.miequipo .nom { text-decoration: underline; text-underline-offset: 3px; }
    .fila.gl .ult { font-size: var(--t-xs); white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis; }
    .orden .r { text-align: right; color: var(--text2); font-size: var(--t-xs); }

    @media (max-width: 900px) {
      .cols { grid-template-columns: 1fr; }
      .fila { grid-template-columns: 26px 40px 1.4fr 60px 88px; padding: 8px 12px; }
      .fila .club { display: none; }
      .barra { padding: 11px 12px; }
      .barra .buscar { flex: 1 1 100%; margin-left: 0; }
      .tira { padding: 10px 12px; }
    }
  `],
})
export class DraftComponent implements OnInit, OnDestroy {
  pos = POS;
  minPorterias = MIN_PORTERIAS;
  texto = signal('');
  posFiltro = signal('');
  soloLibres = signal(true);
  soloCola = signal(false);
  limite = signal(30);
  msg = signal('');
  prePick = signal(false);
  verGlobal = signal(true);

  private eraMiTurno = false;
  private tituloBase = document.title;
  private parpadeo: ReturnType<typeof setInterval> | null = null;

  constructor(public d: DraftService) {
    // En una quedada estás hablando con la gente: el aviso es lo que evita el
    // "¿me toca a mí?" cada dos minutos.
    effect(() => {
      const mio = this.d.esMiTurno();
      if (mio && !this.eraMiTurno) {
        this.avisar();
        this.intentarPrePick();
      }
      if (!mio && this.eraMiTurno) this.pararAviso();
      this.eraMiTurno = mio;
    });
  }

  async ngOnInit() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    await this.d.cargar();
    this.d.suscribir();
    document.addEventListener('visibilitychange', this.alVolver);
  }

  ngOnDestroy() {
    document.removeEventListener('visibilitychange', this.alVolver);
    this.pararAviso();
    this.d.desuscribir();
  }

  /** Al volver a la pestaña puede haber picks que no llegaron: reconciliar. */
  private alVolver = () => {
    if (!document.hidden) this.d.refrescarPicks();
  };

  private avisar() {
    try {
      const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gan = ctx.createGain();
      osc.connect(gan);
      gan.connect(ctx.destination);
      osc.frequency.value = 880;
      gan.gain.value = 0.15;
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // Sin audio (permisos del navegador, móvil en silencio): no pasa nada.
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('FALM — te toca', { body: 'Es tu turno en el draft.' });
    }

    let on = false;
    this.parpadeo = setInterval(() => {
      document.title = (on = !on) ? '¡TE TOCA! · Draft' : this.tituloBase;
    }, 1000);
  }

  private pararAviso() {
    if (this.parpadeo) {
      clearInterval(this.parpadeo);
      this.parpadeo = null;
    }
    document.title = this.tituloBase;
  }

  abr(p: string) { return ABR[p] ?? p; }
  togglePos(p: string) { this.posFiltro.set(this.posFiltro() === p ? '' : p); this.limite.set(30); }
  nombreEquipo(id?: string | null) { return id ? this.d.equipoPorId().get(id) ?? '—' : '—'; }
  tomado(a: ActivoLibre) { return this.d.tomadoPor().get(a.activo_id) ?? null; }
  enCola(a: ActivoLibre) { return this.d.cola().some((c) => c.activo_id === a.activo_id); }

  /**
   * Un gestor ficha por el equipo al que le toca: en la quedada presencial hay
   * quien dicta su elección en voz alta. El cupo de porterías solo se comprueba
   * en cliente para mi propio equipo; para el resto lo valida el servidor.
   */
  /** El equipo que se llevaría el pick: siempre el mío. */
  equipoObjetivo(): string | null {
    return this.d.miEquipoId();
  }

  /** Cuántos de ese club lleva ya el equipo que va a fichar. */
  cupoUsado(a: ActivoLibre): number {
    const eq = this.equipoObjetivo();
    if (!eq || !a.club_id) return 0;
    return this.d.cupoPorEquipo().get(eq)?.get(a.club_id) ?? 0;
  }

  clubLleno(a: ActivoLibre): boolean {
    return this.cupoUsado(a) >= (a.limite_club ?? 3);
  }

  /**
   * Cada uno ficha solo en su turno, admin incluido. Meter el pick de otro se
   * hace desde el panel de administración, para que nadie fiche por error en
   * nombre de un rival.
   */
  puedeFichar(a: ActivoLibre) {
    if (this.tomado(a) || !this.d.turno() || !this.d.esMiTurno()) return false;
    if (this.clubLleno(a)) return false;
    return !this.d.debeElegirPorteria() || a.tipo === 'DEFENSA';
  }

  readonly visibles = computed(() => {
    const t = this.texto().trim().toLowerCase();
    const p = this.posFiltro();
    const soloL = this.soloLibres();
    const soloC = this.soloCola();
    const cola = new Set(this.d.cola().map((c) => c.activo_id));
    const tom = this.d.tomadoPor();
    return this.d.catalogo().filter((a) => {
      if (p && a.posicion !== p) return false;
      if (soloL && tom.has(a.activo_id)) return false;
      if (soloC && !cola.has(a.activo_id)) return false;
      if (t && !`${a.nombre} ${a.club}`.toLowerCase().includes(t)) return false;
      return true;
    });
  });

  readonly colaVisible = computed(() => {
    const cat = new Map(this.d.catalogo().map((a) => [a.activo_id, a]));
    return this.d.cola()
      .map((c) => cat.get(c.activo_id))
      .filter((a): a is ActivoLibre => !!a);
  });

  readonly misFichados = computed(() => {
    const cat = new Map(this.d.catalogo().map((a) => [a.activo_id, a]));
    return this.d.misPicks()
      .map((p) => cat.get(p.activo_id))
      .filter((a): a is ActivoLibre => !!a);
  });

  readonly terminado = computed(() => {
    const e = this.d.draft()?.estado;
    return e === 'COMPLETADO' || e === 'CONSOLIDADO';
  });

  /** Primer elemento de la cola que sigue libre y vale según el cupo de porterías. */
  candidatoPrePick(): ActivoLibre | null {
    const cat = new Map(this.d.catalogo().map((a) => [a.activo_id, a]));
    const tom = this.d.tomadoPor();
    const soloPorteria = this.d.debeElegirPorteria();
    for (const c of this.d.cola()) {
      const a = cat.get(c.activo_id);
      if (!a || tom.has(a.activo_id)) continue;
      if (soloPorteria && a.tipo !== 'DEFENSA') continue;
      if (this.clubLleno(a)) continue;   // el cupo del club también manda en el pre-pick
      return a;
    }
    return null;
  }

  /** Con pre-pick activo, ficha solo al llegar mi turno. Sin candidato, no hace nada. */
  private async intentarPrePick() {
    if (!this.prePick()) return;
    const a = this.candidatoPrePick();
    if (!a) {
      this.msg.set('Pre-pick activo, pero ningún jugador de tu cola sirve. Elige a mano.');
      return;
    }
    try {
      await this.d.fichar(a.activo_id);
      this.msg.set(`Pre-pick: fichado ${a.nombre}.`);
    } catch (e: any) {
      this.msg.set(e?.message ?? 'El pre-pick no pudo completarse.');
    }
  }

  readonly colaFichados = computed(() => {
    const tom = this.d.tomadoPor();
    return this.d.cola().filter((c) => tom.has(c.activo_id)).length;
  });

  /**
   * Estado de los diez equipos, en el orden del sorteo. Solo lo ve el admin:
   * durante la quedada hace falta una foto del conjunto, no solo tu plantilla.
   */
  readonly resumenEquipos = computed(() => {
    const cat = new Map(this.d.catalogo().map((a) => [a.activo_id, a]));
    // El orden de la primera ronda es el del sorteo: seguir el draft por ahí.
    const orden = this.d.orden()
      .filter((o) => o.ronda === 1)
      .sort((a, b) => a.posicion_en_ronda - b.posicion_en_ronda)
      .map((o) => o.equipo_falm_id);

    return orden.map((id) => {
      const suyos = this.d.picks().filter((p) => p.equipo_falm_id === id);
      const act = suyos.map((p) => cat.get(p.activo_id)).filter((a): a is ActivoLibre => !!a);
      const cuenta = (pos: string) =>
        act.filter((a) => a.tipo !== 'DEFENSA' && this.abr(a.posicion) === pos).length;
      const ultimo = act.length ? act[act.length - 1].nombre : '—';
      return {
        id,
        nombre: this.nombreEquipo(id),
        picks: suyos.length,
        porterias: act.filter((a) => a.tipo === 'DEFENSA').length,
        PT: cuenta('POR'), DF: cuenta('DEF'), MC: cuenta('MED'), DL: cuenta('DEL'),
        ultimo,
      };
    });
  });

  /** Los 12 próximos turnos, para el panel lateral. */
  readonly proximosTurnos = computed(() => this.d.orden().filter((o) => !o.completado).slice(0, 12));

  async alternarCola(a: ActivoLibre) {
    try {
      if (this.enCola(a)) await this.d.quitarCola(a.activo_id);
      else await this.d.agregarCola(a.activo_id);
    } catch (e: any) {
      this.msg.set(e?.message ?? 'No se pudo actualizar la cola.');
    }
  }

  async fichar(a: ActivoLibre) {
    if (!confirm(`¿Fichar a ${a.nombre}?`)) return;
    this.msg.set('');
    try {
      await this.d.fichar(a.activo_id);
    } catch (e: any) {
      this.msg.set(e?.message ?? 'No se pudo fichar.');
    }
  }
}
