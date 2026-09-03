import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Agenda, AgendaItem, Alineado, FalmService, ItemPlantilla } from '../../core/falm.service';
import { FutCardComponent } from '../../shared/fut-card.component';

const ORDEN = ['PORTERO', 'DEFENSA', 'MEDIO', 'DELANTERO'] as const;
const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/** Un titular ya cruzado con su ficha de plantilla. */
interface EnCampo { pos: string; nombre: string; foto: string | null; escudo: string | null; }
/** Un suplente: quién es y qué líneas cubre. */
interface EnBanca { nombre: string; pos: string; cubre: string[]; }

/** Inicio: qué viene ahora — resumen, partido actual, próximo, alineación, fichajes. */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, FutCardComponent],
  template: `
    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else {
      <header class="phead">
        <div>
          <h1>{{ nombre() || 'Mi equipo' }}</h1>
          @if (resumen(); as r) {
            <p class="sub">{{ r.pos }}º de {{ r.total }} en la liga · {{ r.pts }} puntos de clasificación.</p>
          } @else {
            <p class="sub">Temporada 2026/27.</p>
          }
        </div>
        <a class="btn-sec" routerLink="/clasificacion">Ver clasificación</a>
      </header>

      @if (ag()?.en_juego; as ej) {
        <section class="live">
          <span class="dot"></span>
          <div class="lt">
            <strong>Jornada {{ ej.numero }} en juego</strong>
            <p>{{ nombre() }} {{ ej.es_local ? 'contra' : 'en casa de' }} {{ ej.rival }} · alineación cerrada</p>
          </div>
          <a class="btn-sec" routerLink="/jornadas">Seguir</a>
        </section>
      }

      @if (ag()?.proximo; as pr) {
        <section class="next">
          <div class="nh">
            <span class="jlbl">Jornada {{ pr.numero }} · {{ etiqueta(pr.comp) }}</span>
            <span class="fecha">{{ fechaLarga(pr.fecha) }}</span>
          </div>
          <div class="match">
            <span class="tn">{{ nombre() }}</span>
            <span class="vs">{{ pr.es_local ? 'vs' : '@' }}</span>
            <span class="tn">{{ pr.rival }}</span>
          </div>
          <p class="cd">{{ cuentaPartido() }}</p>
          @if (!enviada()) { <a class="btn" routerLink="/alineacion">Manda tu alineación</a> }
        </section>
      } @else {
        <section class="next vacio"><p class="muted">Sin próximos partidos programados.</p></section>
      }

      <!-- El once ya mandado: primero saber que llegó, y luego poder verlo sin
           entrar en Alineación. -->
      @if (enviada()) {
        <section class="once">
          <header class="oh">
            <div class="ot">
              <strong>Alineación enviada</strong>
              <p>{{ estadoRival() }}</p>
            </div>
            <span class="form">{{ formacion() }}</span>
          </header>

          <div class="pitch">
            <div class="lineas"></div>
            @for (f of filas(); track f.pos) {
              @if (f.js.length) {
                <div class="fila">
                  @for (j of f.js; track $index) {
                    <div class="slot">
                      <falm-fut-card [nombre]="j.nombre" [foto]="j.foto" [escudo]="j.escudo"
                                     [posicion]="j.pos" [campo]="true" />
                    </div>
                  }
                </div>
              }
            }
          </div>

          @if (banca().length) {
            <div class="banca">
              <span class="bl">Banquillo</span>
              <ol>
                @for (b of banca(); track $index) {
                  <li><span class="bn">{{ b.nombre }}</span><span class="bc">{{ cubre(b) }}</span></li>
                }
              </ol>
            </div>
          }

          <a class="cambiar" routerLink="/alineacion">Cambiar alineación</a>
        </section>
      }

      @if (actual(); as ac) {
        <a class="actual" routerLink="/jornadas">
          <div class="ah">
            <span class="al">{{ ag()?.en_juego ? 'Partido actual' : 'Último partido' }} · J{{ ac.numero }}</span>
            <span class="go">Ver detalle ›</span>
          </div>
          <div class="amatch">
            <span class="t" [class.win]="gane(ac)">{{ nombre() }}</span>
            <span class="sc num">{{ fmt(ac.mis_puntos) }}<i>–</i>{{ fmt(ac.rival_puntos) }}</span>
            <span class="t" [class.win]="perdi(ac)">{{ ac.rival }}</span>
          </div>
        </a>
      }

      <section class="accion">
        <div class="cd2">
          <span class="lb">Cierre de fichajes</span>
          <strong>{{ cuenta() }}</strong>
        </div>
        <a class="btn-sec" routerLink="/fichajes">Pedir fichaje</a>
      </section>
    }
  `,
  styles: [`
    .phead { display: flex; align-items: flex-end; justify-content: space-between;
      gap: 20px; flex-wrap: wrap; margin-bottom: 18px; }
    .phead .sub { margin: 5px 0 0; color: var(--text2); font-size: var(--t-sm); }

    .live { display: flex; align-items: center; gap: 12px; padding: 13px 17px; margin-bottom: 14px;
      background: var(--accent-soft); border: 1px solid var(--accent-line); border-radius: var(--r-sm); }
    .live .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); flex: 0 0 auto; }
    .live .lt { flex: 1; } .live strong { display: block; color: var(--accent); font-size: var(--t-sm); }
    .live p { margin: 2px 0 0; font-size: var(--t-sm); color: var(--text2); }

    /* El duelo de la semana es la portada: se lee de lejos. */
    .next { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r);
      padding: 20px; margin-bottom: 14px; }
    .next.vacio { padding: 26px; text-align: center; }
    .nh { display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
      padding-bottom: 14px; border-bottom: 1px solid var(--line); margin-bottom: 20px; }
    .jlbl { font-size: var(--t-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .16em; color: var(--accent); }
    .fecha { font-size: var(--t-sm); color: var(--text2); text-transform: capitalize; }
    .match { display: flex; align-items: center; justify-content: center; gap: 16px; }
    .match .tn { flex: 1; min-width: 0; text-align: center; font-family: var(--fh); font-size: var(--t-lg);
      font-weight: 600; text-transform: uppercase; letter-spacing: -.01em;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .match .vs { flex: 0 0 auto; font-size: var(--t-xs); font-weight: 700; text-transform: uppercase;
      letter-spacing: .1em; color: var(--text2); padding: 4px 10px;
      border: 1px solid var(--line); border-radius: var(--pill); }
    .cd { text-align: center; color: var(--text2); font-size: var(--t-sm); margin: 16px 0 18px; }
    .cd:last-child { margin-bottom: 0; }
    .btn { display: block; text-align: center; }

    /* El once mandado: el mismo campo que en Alineación, en pequeño. */
    .once { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r);
      padding: 18px 18px 20px; margin-bottom: 14px; }
    .oh { display: flex; align-items: center; justify-content: space-between; gap: 14px;
      padding-bottom: 14px; border-bottom: 1px solid var(--line); margin-bottom: 16px; }
    .ot strong { display: block; font-size: var(--t-md); }
    .ot strong::before { content: '\\2713'; color: var(--por); font-weight: 700; margin-right: 7px; }
    .ot p { margin: 3px 0 0; font-size: var(--t-sm); color: var(--text2); }
    .form { flex: 0 0 auto; font-family: var(--fm); font-weight: 700; font-size: var(--t-lg);
      padding: 3px 12px; border: 1px solid var(--line); border-radius: var(--pill); }

    .pitch { position: relative; overflow: hidden; max-width: 640px; margin: 0 auto;
      background: repeating-linear-gradient(180deg, #e3e9d8 0 44px, #dde4d0 44px 88px);
      border: 1px solid var(--line); border-radius: 12px;
      padding: 18px 12px; display: flex; flex-direction: column; gap: 6px;
      min-height: 430px; justify-content: space-between; }
    .lineas { position: absolute; inset: 12px; pointer-events: none; z-index: 0;
      border: 2px solid rgba(255,255,255,.8); border-radius: 4px;
      background:
        linear-gradient(rgba(255,255,255,.8), rgba(255,255,255,.8)) center / 100% 2px no-repeat,
        radial-gradient(circle at 50% 50%, transparent 40px, rgba(255,255,255,.8) 40px,
                        rgba(255,255,255,.8) 42px, transparent 42px); }
    .lineas::before, .lineas::after { content: ''; position: absolute; left: 50%;
      transform: translateX(-50%); width: 54%; height: 52px;
      border: 2px solid rgba(255,255,255,.8); }
    .lineas::before { top: -2px; border-top: none; border-radius: 0 0 4px 4px; }
    .lineas::after { bottom: -2px; border-bottom: none; border-radius: 4px 4px 0 0; }
    .fila { position: relative; z-index: 1; display: flex; justify-content: center;
      align-items: center; gap: 8px; padding: 2px; }
    .slot { flex: 1 1 0; min-width: 62px; max-width: 104px; }

    /* Quién espera en el banquillo, por orden de entrada. */
    .banca { max-width: 640px; margin: 14px auto 0; }
    .bl { display: block; font-size: var(--t-xs); font-weight: 700; letter-spacing: .16em;
      text-transform: uppercase; color: var(--text2); margin-bottom: 8px; }
    .banca ol { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 7px; counter-reset: b; }
    .banca li { counter-increment: b; display: flex; align-items: baseline; gap: 7px;
      padding: 4px 11px 4px 9px; border: 1px solid var(--line); border-radius: var(--pill);
      font-size: var(--t-sm); }
    .banca li::before { content: counter(b); font-family: var(--fm); font-size: var(--t-xs); color: var(--text2); }
    .bc { font-size: var(--t-xs); color: var(--text2); letter-spacing: .06em; }
    .cambiar { display: block; text-align: center; margin: 16px auto 0; max-width: 640px;
      padding: 10px; border: 1px solid var(--line); border-radius: var(--r-sm);
      font-size: var(--t-sm); font-weight: 600; }

    .actual { display: block; background: var(--surface); border: 1px solid var(--line);
      border-radius: var(--r); padding: 15px 17px; margin-bottom: 14px; }
    .actual .ah { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .actual .al { font-size: var(--t-xs); text-transform: uppercase; letter-spacing: .16em; color: var(--text2); font-weight: 700; }
    .actual .go { color: var(--accent); font-size: var(--t-sm); font-weight: 600; }
    .actual .amatch { display: flex; align-items: center; justify-content: center; gap: 12px; }
    .actual .t { flex: 1; text-align: center; font-weight: 600; font-size: var(--t-sm); color: var(--text2);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .actual .t.win { color: var(--text); font-weight: 700; }
    .actual .sc { flex: 0 0 auto; font-size: var(--t-lg); font-weight: 700; color: var(--accent); }
    .actual .sc i { color: var(--text2); font-style: normal; margin: 0 5px; }

    .accion { display: flex; align-items: center; gap: 14px; padding: 14px 17px;
      background: var(--surface); border: 1px solid var(--line); border-left: 3px solid var(--por);
      border-radius: var(--r-sm); }
    .accion .cd2 { flex: 1; }
    .accion .lb { display: block; font-size: var(--t-xs); font-weight: 700; letter-spacing: .16em;
      text-transform: uppercase; color: var(--text2); }
    .accion strong { display: block; margin-top: 2px; font-size: var(--t-md); }
    .muted { color: var(--text2); }

    @media (max-width: 620px) {
      .pitch { min-height: 360px; padding: 14px 8px; gap: 4px; }
      .slot { min-width: 54px; }
      .oh { flex-wrap: wrap; }
    }
  `],
})
export class DashboardComponent implements OnInit, OnDestroy {
  cargando = signal(true);
  nombre = signal('');
  ag = signal<Agenda | null>(null);
  resumen = signal<{ pos: number; total: number; pts: number } | null>(null);
  cuenta = signal('');
  cuentaPartido = signal('');
  private timer: any = null;

  /** Alineación de la jornada que viene (o de la que se está jugando). */
  formacion = signal('');
  campo = signal<EnCampo[]>([]);
  banca = signal<EnBanca[]>([]);
  rivalAlineado = signal(false);
  enviada = computed(() => this.campo().length > 0);

  actual = computed<AgendaItem | null>(() => this.ag()?.en_juego ?? this.ag()?.ultimo ?? null);
  /** La jornada cuyo once enseñamos: la que viene, y si no la que está en juego. */
  private foco = computed<AgendaItem | null>(() => this.ag()?.proximo ?? this.ag()?.en_juego ?? null);

  filas = computed(() => ORDEN.map((pos) => ({ pos, js: this.campo().filter((j) => j.pos === pos) })));

  constructor(private falm: FalmService) {}
  ngOnDestroy() { if (this.timer) clearInterval(this.timer); }

  etiqueta(t: string) { return t === 'CHAMPIONS' ? 'Champions' : t === 'CLAUSURA' ? 'Clausura' : 'Liga'; }
  fmt(n: number | null) { return n == null ? '–' : (Math.round(n * 10) / 10).toString(); }
  gane(ac: AgendaItem) { return ac.mis_puntos != null && ac.rival_puntos != null && ac.mis_puntos > ac.rival_puntos; }
  perdi(ac: AgendaItem) { return ac.mis_puntos != null && ac.rival_puntos != null && ac.rival_puntos > ac.mis_puntos; }
  cubre(b: EnBanca) { return (b.cubre.length ? b.cubre : [b.pos]).map((l) => ABR[l] ?? l).join(' · '); }

  /** Del rival solo decimos si ha mandado, nunca a quién ha puesto. */
  estadoRival(): string {
    const f = this.foco();
    if (!f) return '';
    if (!this.ag()?.proximo) return `Jornada en juego contra ${f.rival}: ya no se puede tocar.`;
    return this.rivalAlineado()
      ? `${f.rival} ya ha mandado la suya.`
      : `Esperando la alineación de ${f.rival}.`;
  }

  fechaLarga(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) +
      ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  /** Próximo martes 23:59 (deadline semanal de fichajes). */
  private proximoCierre(): Date {
    const ahora = new Date(); const d = new Date(ahora); d.setHours(23, 59, 0, 0);
    let dias = (2 - d.getDay() + 7) % 7;
    if (dias === 0 && ahora.getTime() > d.getTime()) dias = 7;
    d.setDate(d.getDate() + dias); return d;
  }
  private restante(ms: number): string {
    if (ms <= 0) return 'En proceso';
    const dd = Math.floor(ms / 86400000), hh = Math.floor((ms % 86400000) / 3600000), mm = Math.floor((ms % 3600000) / 60000);
    return dd > 0 ? `Faltan ${dd}d ${hh}h` : `Faltan ${hh}h ${mm}m`;
  }
  private tick() {
    this.cuenta.set(this.restante(this.proximoCierre().getTime() - Date.now()));
    const pr = this.ag()?.proximo;
    if (pr) {
      const ms = new Date(pr.fecha).getTime() - Date.now();
      this.cuentaPartido.set(ms > 0
        ? this.restante(ms) + (this.enviada() ? ' para el cierre' : ' para cerrar tu alineación')
        : 'Alineación cerrada');
    }
  }

  /** Cruza la alineación guardada con la plantilla, que es quien tiene las caras. */
  private async cargarOnce(equipoId: string, f: AgendaItem) {
    const al = await this.falm.getAlineacion(equipoId, f.jornada_id);
    if (!al) return;
    const plantilla = await this.falm.miPlantilla(equipoId);
    const ficha = new Map<string, ItemPlantilla>(plantilla.map((p) => [p.activo_id, p]));

    this.formacion.set(al.formacion);
    this.campo.set(al.jugadores
      .filter((j: Alineado) => j.rol === 'TITULAR')
      .flatMap<EnCampo>((j: Alineado) => {
        const p = ficha.get(j.activo_id);
        return p ? [{ pos: p.posicion, nombre: p.nombre, foto: p.foto ?? null, escudo: p.escudo ?? null }] : [];
      }));
    this.banca.set(al.jugadores
      .filter((j: Alineado) => j.rol === 'SUPLENTE')
      .flatMap<EnBanca>((j: Alineado) => {
        const p = ficha.get(j.activo_id);
        return p ? [{ nombre: p.nombre, pos: p.posicion, cubre: j.lineas ?? [] }] : [];
      }));

    const quienes = await this.falm.quienHaAlineado(f.jornada_id, [f.rival_id]);
    this.rivalAlineado.set(quienes.has(f.rival_id));
  }

  async ngOnInit() {
    try {
      const eq = await this.falm.miEquipo();
      if (eq) {
        this.nombre.set(eq.nombre);
        this.ag.set(await this.falm.agenda(eq.id));
        const f = this.foco();
        if (f?.jornada_id) await this.cargarOnce(eq.id, f);
        const comps = await this.falm.competiciones();
        const liga = comps.find((c) => c.tipo === 'LIGA') ?? comps[0];
        if (liga) {
          const clas = await this.falm.clasificacion(liga.id);
          const mia = clas.find((fila) => fila.equipo_falm_id === eq.id);
          if (mia) this.resumen.set({ pos: mia.posicion, total: clas.length, pts: mia.puntos_clasificacion });
        }
      }
    } catch { /* defaults */ } finally {
      this.cargando.set(false);
      this.tick();
      this.timer = setInterval(() => this.tick(), 60000);
    }
  }
}
