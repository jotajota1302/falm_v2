import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Agenda, AgendaItem, FalmService } from '../../core/falm.service';

/** Inicio "Matchday": qué viene ahora — resumen, partido actual, próximo, alineación, fichajes. */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else {
      <section class="hero rise">
        <h1>{{ nombre() || 'Mi equipo' }}</h1>
      </section>

      @if (resumen(); as r) {
        <a class="resumen rise" routerLink="/clasificacion">
          <div class="rinfo">
            <span class="rl">Tu liga</span>
            <strong>{{ r.pos }}º<small> de {{ r.total }}</small> · {{ r.pts }} pts</strong>
          </div>
          <span class="go">Clasificación ›</span>
        </a>
      }

      @if (ag()?.en_juego; as ej) {
        <section class="live rise">
          <span class="dot"></span>
          <div class="lt">
            <strong>Jornada {{ ej.numero }} en juego</strong>
            <p>{{ nombre() }} {{ ej.es_local ? 'vs' : '@' }} {{ ej.rival }} · alineación cerrada</p>
          </div>
          <a class="btn ghost" routerLink="/jornadas">Ver</a>
        </section>
      }

      @if (ag()?.proximo; as pr) {
        <section class="next card rise">
          <div class="nh">
            <span class="jlbl">Jornada {{ pr.numero }} · {{ etiqueta(pr.comp) }}</span>
            <span class="fecha">{{ fechaLarga(pr.fecha) }}</span>
          </div>
          <div class="match">
            <span class="tn">{{ nombre() }}</span>
            <span class="vs">{{ pr.es_local ? 'VS' : '@' }}</span>
            <span class="tn">{{ pr.rival }}</span>
          </div>
          <p class="cd">⏳ {{ cuentaPartido() }}</p>
          <a class="btn" routerLink="/alineacion">📋 Enviar alineación</a>
        </section>
      } @else {
        <section class="next card rise"><p class="muted" style="text-align:center;padding:8px">Sin próximos partidos programados.</p></section>
      }

      @if (actual(); as ac) {
        <a class="actual card rise" routerLink="/jornadas">
          <div class="ah">
            <span class="al">{{ ag()?.en_juego ? 'Partido actual' : 'Último partido' }} · J{{ ac.numero }}</span>
            <span class="go">Ver detalle ›</span>
          </div>
          <div class="amatch">
            <span class="t" [class.win]="gane(ac)">{{ nombre() }}</span>
            <span class="sc">{{ fmt(ac.mis_puntos) }}<i>-</i>{{ fmt(ac.rival_puntos) }}</span>
            <span class="t" [class.win]="perdi(ac)">{{ ac.rival }}</span>
          </div>
        </a>
      }

      <section class="accion rise">
        <span class="ic">⏰</span>
        <div class="cd2">
          <strong>Cierre de fichajes</strong>
          <p class="muted">{{ cuenta() }}</p>
        </div>
        <a class="btn-cd" routerLink="/fichajes">Pedir fichaje</a>
      </section>
    }
  `,
  styles: [`
    .hero { margin-bottom: 12px; }
    .hero h1 { font-size: 1.6rem; }

    .resumen { display: flex; align-items: center; gap: 12px; padding: 13px 16px; margin-bottom: 14px;
      background: var(--surface); border: 1px solid var(--border); border-radius: 14px; }
    .resumen .rinfo { flex: 1; } .resumen .rl { font-size: .68rem; text-transform: uppercase; letter-spacing: .06em; color: var(--faint); font-weight: 800; }
    .resumen strong { display: block; font-size: 1.15rem; margin-top: 2px; } .resumen strong small { color: var(--muted); font-weight: 600; font-size: .8rem; }
    .resumen .go { color: var(--primary); font-size: .8rem; font-weight: 800; flex: 0 0 auto; }

    .live { display: flex; align-items: center; gap: 12px; padding: 13px 16px; margin-bottom: 14px;
      background: rgba(0,230,118,.08); border: 1px solid rgba(0,230,118,.28); border-radius: 14px; }
    .live .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--primary); animation: pulse 1.6s infinite; flex: 0 0 auto; }
    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(0,230,118,.5); } 70% { box-shadow: 0 0 0 9px rgba(0,230,118,0); } 100% { box-shadow: 0 0 0 0 rgba(0,230,118,0); } }
    .live .lt { flex: 1; } .live strong { display: block; color: var(--primary); }
    .live p { margin: 2px 0 0; font-size: .82rem; color: var(--muted); }

    .next { padding: 18px; margin-bottom: 14px; }
    .nh { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; gap: 8px; }
    .jlbl { font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; color: var(--primary); }
    .fecha { font-size: .76rem; color: var(--muted); text-transform: capitalize; }
    .match { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 4px 0 2px; }
    .match .tn { font-weight: 800; font-size: 1.05rem; text-align: center; flex: 1; min-width: 0;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .match .vs { font-weight: 900; color: var(--faint); font-size: .85rem; flex: 0 0 auto; padding: 3px 9px;
      border: 1px solid var(--border); border-radius: 8px; }
    .cd { text-align: center; color: var(--muted); font-size: .82rem; margin: 16px 0 14px; }
    .btn { display: block; text-align: center; background: var(--primary); color: var(--primary-ink); font-weight: 800;
      padding: 13px; border-radius: 12px; box-shadow: 0 6px 16px rgba(0,230,118,.22); }
    .btn.ghost { background: transparent; border: 1px solid var(--primary); color: var(--primary); padding: 8px 16px; box-shadow: none; flex: 0 0 auto; }

    .actual { display: block; padding: 14px 16px; margin-bottom: 14px; }
    .actual .ah { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .actual .al { font-size: .68rem; text-transform: uppercase; letter-spacing: .05em; color: var(--faint); font-weight: 800; }
    .actual .go { color: var(--primary); font-size: .78rem; font-weight: 800; }
    .actual .amatch { display: flex; align-items: center; justify-content: center; gap: 12px; }
    .actual .t { flex: 1; text-align: center; font-weight: 700; font-size: .9rem; color: var(--muted);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .actual .t.win { color: var(--ink); font-weight: 800; }
    .actual .sc { flex: 0 0 auto; font-weight: 900; font-size: 1.3rem; letter-spacing: .02em; color: var(--primary); }
    .actual .sc i { color: var(--faint); font-style: normal; margin: 0 5px; font-size: 1rem; }

    .accion { display: flex; align-items: center; gap: 14px; padding: 14px 16px;
      background: rgba(255,194,75,.07); border: 1px solid rgba(255,194,75,.2); border-radius: 14px; }
    .accion .ic { font-size: 1.5rem; }
    .accion .cd2 { flex: 1; } .accion strong { display: block; } .accion p { margin: 2px 0 0; font-size: .85rem; }
    .btn-cd { flex: 0 0 auto; background: var(--gold); color: #1a1206; font-weight: 800; font-size: .8rem;
      padding: 8px 14px; border-radius: 10px; white-space: nowrap; }
    .muted { color: var(--muted); }
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
    if (ms <= 0) return '¡En proceso!';
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
