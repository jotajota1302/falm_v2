import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Agenda, AgendaItem, Alineado, FalmService, ItemPlantilla, RolAlineacion } from '../../core/falm.service';

const ORDEN = ['PORTERO', 'DEFENSA', 'MEDIO', 'DELANTERO'] as const;
const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/** Un titular ya cruzado con su ficha de plantilla. */
interface EnCampo { pos: string; nombre: string; }
/** Un suplente: quién es y qué líneas cubre. */
interface EnBanca { nombre: string; pos: string; cubre: string[]; }
/** La alineación de un equipo en la jornada, lista para pintar. */
interface Once { equipo: string; formacion: string; campo: EnCampo[]; banca: EnBanca[]; enviada: boolean; }

/** Inicio: qué viene ahora — resumen, partido actual, próximo, alineación, fichajes. */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
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
          @if (!mio()?.enviada) { <a class="btn" routerLink="/alineacion">Manda tu alineación</a> }
        </section>
      } @else {
        <section class="next vacio"><p class="muted">Sin próximos partidos programados.</p></section>
      }

      <!-- Los dos onces enfrentados, como la alineación de un periódico: cada
           equipo a un lado y la demarcación en medio. Solo nombres. -->
      @if (mio()?.enviada) {
        <section class="once">
          <div class="duelo">
            <div class="eq a">
              <strong>{{ mio()!.equipo }}</strong>
              <span class="f">{{ mio()!.formacion }}</span>
            </div>
            <span class="ce"></span>
            <div class="eq b">
              <strong>{{ rival()?.equipo }}</strong>
              <span class="f">{{ rival()?.enviada ? rival()!.formacion : 'sin enviar' }}</span>
            </div>

            @for (f of duelo(); track f.pos) {
              <div class="lado a">
                @for (j of f.mios; track $index) { <span class="j">{{ corto(j.nombre) }}</span> }
              </div>
              <span class="et" [class]="abr(f.pos)">{{ abr(f.pos) }}</span>
              <div class="lado b">
                @if (rival()?.enviada) {
                  @for (j of f.suyos; track $index) { <span class="j">{{ corto(j.nombre) }}</span> }
                }
              </div>
            }

            <div class="lado a banq">
              @for (b of mio()!.banca; track $index) {
                <span class="j sup">{{ corto(b.nombre) }}<em>{{ cubre(b) }}</em></span>
              }
            </div>
            <span class="et">Banq.</span>
            <div class="lado b banq">
              @if (rival()?.enviada) {
                @for (b of rival()!.banca; track $index) {
                  <span class="j sup">{{ corto(b.nombre) }}<em>{{ cubre(b) }}</em></span>
                }
              }
            </div>

            @if (!rival()?.enviada) {
              <p class="esperando">Aún no ha mandado su alineación.</p>
            }
          </div>

          <a class="cambiar" routerLink="/alineacion">Cambiar mi alineación</a>
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

    /* Los dos onces enfrentados: cada equipo a un lado, la demarcación en la
       columna del medio, y las líneas de los dos siempre a la misma altura. */
    .duelo { display: grid; grid-template-columns: 1fr 52px 1fr; align-items: baseline;
      row-gap: 2px; }
    .eq { display: flex; flex-direction: column; gap: 2px; padding-bottom: 12px;
      margin-bottom: 8px; border-bottom: 1px solid var(--line); }
    .eq strong { font-family: var(--fh); font-size: var(--t-lg); font-weight: 600;
      text-transform: uppercase; letter-spacing: -.01em; line-height: 1.1; }
    .eq .f { font-family: var(--fm); font-size: var(--t-sm); color: var(--text2); }
    .eq.a { align-items: flex-end; text-align: right; }
    .ce { border-bottom: 1px solid var(--line); margin-bottom: 8px; }

    .lado { display: flex; flex-wrap: wrap; gap: 4px 8px; padding: 5px 0; min-height: 26px; }
    .lado.a { justify-content: flex-end; }
    .j { font-size: var(--t-sm); font-weight: 600; white-space: nowrap; }
    .et { align-self: center; text-align: center; font-size: var(--t-xs); font-weight: 700;
      letter-spacing: .08em; text-transform: uppercase; color: var(--text2); }
    .et.POR { color: var(--por); } .et.DEF { color: var(--def); }
    .et.MED { color: var(--med); } .et.DEL { color: var(--del); }

    /* El banquillo va debajo, más callado, con la línea que cubre cada uno. */
    .banq { border-top: 1px solid var(--line); padding-top: 8px; margin-top: 6px; }
    .j.sup { font-weight: 400; color: var(--text2); }
    .j.sup em { font-style: normal; font-size: var(--t-xs); margin-left: 4px; opacity: .75; }
    .esperando { grid-column: 3; grid-row: 2 / -1; align-self: center; margin: 0;
      padding-left: 4px; font-size: var(--t-sm); color: var(--text2); }
    .cambiar { display: block; text-align: center; margin: 14px 0 0;
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
      .duelo { grid-template-columns: 1fr 40px 1fr; }
      .eq strong { font-size: var(--t-md); }
      .lado { gap: 3px 6px; }
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

  /** Los dos onces de la jornada que viene (o de la que se está jugando). */
  mio = signal<Once | null>(null);
  rival = signal<Once | null>(null);

  actual = computed<AgendaItem | null>(() => this.ag()?.en_juego ?? this.ag()?.ultimo ?? null);
  /** La jornada cuyo once enseñamos: la que viene, y si no la que está en juego. */
  private foco = computed<AgendaItem | null>(() => this.ag()?.proximo ?? this.ag()?.en_juego ?? null);

  /** Una fila por demarcación con los de cada lado, para que cuadren de altura. */
  duelo = computed(() => ORDEN.map((pos) => ({
    pos,
    mios: (this.mio()?.campo ?? []).filter((j) => j.pos === pos),
    suyos: (this.rival()?.campo ?? []).filter((j) => j.pos === pos),
  })));

  constructor(private falm: FalmService) {}
  ngOnDestroy() { if (this.timer) clearInterval(this.timer); }

  etiqueta(t: string) { return t === 'CHAMPIONS' ? 'Champions' : t === 'CLAUSURA' ? 'Clausura' : 'Liga'; }
  fmt(n: number | null) { return n == null ? '–' : (Math.round(n * 10) / 10).toString(); }
  gane(ac: AgendaItem) { return ac.mis_puntos != null && ac.rival_puntos != null && ac.mis_puntos > ac.rival_puntos; }
  perdi(ac: AgendaItem) { return ac.mis_puntos != null && ac.rival_puntos != null && ac.rival_puntos > ac.mis_puntos; }
  abr(pos: string) { return ABR[pos] ?? pos; }
  cubre(b: EnBanca) { return (b.cubre.length ? b.cubre : [b.pos]).map((l) => ABR[l] ?? l).join('/'); }
  /** En una línea de once cabe el apellido; una portería se nombra por su club. */
  corto(nombre: string) {
    if (nombre.startsWith('Porter')) return nombre.replace(/^Porter[íi]a\s*/, '');
    const p = nombre.trim().split(/\s+/);
    return p.length > 1 ? p[p.length - 1] : nombre;
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
        ? this.restante(ms) + (this.mio()?.enviada ? ' para el cierre' : ' para cerrar tu alineación')
        : 'Alineación cerrada');
    }
  }

  /** Cruza una alineación guardada con la plantilla, que es quien tiene los nombres. */
  private async onceDe(equipoId: string, equipo: string, jornadaId: string): Promise<Once> {
    const vacio: Once = { equipo, formacion: '', campo: [], banca: [], enviada: false };
    const al = await this.falm.getAlineacion(equipoId, jornadaId);
    if (!al) return vacio;
    const ficha = new Map<string, ItemPlantilla>(
      (await this.falm.miPlantilla(equipoId)).map((p) => [p.activo_id, p]));
    const dentro = (rol: RolAlineacion) => al.jugadores.filter((j: Alineado) => j.rol === rol);
    return {
      equipo,
      formacion: al.formacion,
      enviada: true,
      campo: dentro('TITULAR').flatMap<EnCampo>((j) => {
        const p = ficha.get(j.activo_id);
        return p ? [{ pos: p.posicion, nombre: p.nombre }] : [];
      }),
      banca: dentro('SUPLENTE').flatMap<EnBanca>((j) => {
        const p = ficha.get(j.activo_id);
        return p ? [{ nombre: p.nombre, pos: p.posicion, cubre: j.lineas ?? [] }] : [];
      }),
    };
  }

  async ngOnInit() {
    try {
      const eq = await this.falm.miEquipo();
      if (eq) {
        this.nombre.set(eq.nombre);
        this.ag.set(await this.falm.agenda(eq.id));
        const f = this.foco();
        if (f?.jornada_id) {
          const [yo, otro] = await Promise.all([
            this.onceDe(eq.id, eq.nombre, f.jornada_id),
            this.onceDe(f.rival_id, f.rival, f.jornada_id),
          ]);
          this.mio.set(yo);
          this.rival.set(otro);
        }
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
