import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Agenda, AgendaItem, FalmService } from '../../core/falm.service';

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
          <a class="btn" routerLink="/alineacion">Manda tu alineación</a>
        </section>
      } @else {
        <section class="next vacio"><p class="muted">Sin próximos partidos programados.</p></section>
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
    .btn { display: block; text-align: center; }

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

  actual = computed<AgendaItem | null>(() => this.ag()?.en_juego ?? this.ag()?.ultimo ?? null);

  constructor(private falm: FalmService) {}
  ngOnDestroy() { if (this.timer) clearInterval(this.timer); }

  etiqueta(t: string) { return t === 'CHAMPIONS' ? 'Champions' : t === 'CLAUSURA' ? 'Clausura' : 'Liga'; }
  fmt(n: number | null) { return n == null ? '–' : (Math.round(n * 10) / 10).toString(); }
  gane(ac: AgendaItem) { return ac.mis_puntos != null && ac.rival_puntos != null && ac.mis_puntos > ac.rival_puntos; }
  perdi(ac: AgendaItem) { return ac.mis_puntos != null && ac.rival_puntos != null && ac.rival_puntos > ac.mis_puntos; }
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
      this.cuentaPartido.set(ms > 0 ? this.restante(ms) + ' para cerrar tu alineación' : 'Alineación cerrada');
    }
  }

  async ngOnInit() {
    try {
      const eq = await this.falm.miEquipo();
      if (eq) {
        this.nombre.set(eq.nombre);
        this.ag.set(await this.falm.agenda(eq.id));
        const comps = await this.falm.competiciones();
        const liga = comps.find((c) => c.tipo === 'LIGA') ?? comps[0];
        if (liga) {
          const clas = await this.falm.clasificacion(liga.id);
          const mia = clas.find((f) => f.equipo_falm_id === eq.id);
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
