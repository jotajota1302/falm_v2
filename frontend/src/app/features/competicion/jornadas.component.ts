import { Component, OnInit, signal } from '@angular/core';
import { Competicion, EnfrentamientoFila, FalmService, JornadaFalm } from '../../core/falm.service';
import { colorEquipo } from '../../shared/equipo-colores';

/** Resultados de los enfrentamientos por jornada, con el detalle del once. */
@Component({
  selector: 'app-jornadas',
  standalone: true,
  template: `
    <header class="phead">
      <div>
        <h1>Partidos</h1>
        <p class="sub">{{ subtitulo() }}</p>
      </div>
    </header>

    @if (competiciones().length > 1) {
      <div class="chips comps">
        @for (c of competiciones(); track c.id) {
          <button [class.on]="c.id === competicionId()" (click)="seleccionarCompeticion(c.id)">{{ etiqueta(c.tipo) }}</button>
        }
      </div>
    }

    @if (jornadas().length > 0) {
      <div class="jchips">
        @for (j of jornadas(); track j.id) {
          <button [class.on]="j.id === jornadaId()" (click)="seleccionarJornada(j.id)">J{{ j.numero }}</button>
        }
      </div>
    }

    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else if (error()) {
      <p class="err">{{ error() }}</p>
    } @else if (enfrentamientos().length === 0) {
      <p class="muted">No hay partidos en esta jornada.</p>
    } @else {
      <div class="lista">
        @for (e of enfrentamientos(); track e.enfrentamiento_id) {
          <button class="match" (click)="abrirDetalle(e)">
            <span class="lado izq" [class.gana]="e.puntos_clasif_local > e.puntos_clasif_visitante">
              <span class="nm">{{ e.equipo_local }}</span>
              <span class="marca" [style.background]="color(e.equipo_local)"></span>
            </span>
            <span class="centro">
              <span class="marcador num">{{ e.puntos_local }}<i>–</i>{{ e.puntos_visitante }}</span>
              <span class="est">
                {{ e.jornada_jugada ? e.puntos_clasif_local + ' – ' + e.puntos_clasif_visitante + ' en la tabla' : 'Sin jugar' }}
              </span>
            </span>
            <span class="lado der" [class.gana]="e.puntos_clasif_visitante > e.puntos_clasif_local">
              <span class="marca" [style.background]="color(e.equipo_visitante)"></span>
              <span class="nm">{{ e.equipo_visitante }}</span>
            </span>
          </button>
        }
      </div>
    }

    @if (detalle() || cargandoDetalle()) {
      <div class="back" (click)="detalle.set(null)">
        <div class="panel rise" (click)="$event.stopPropagation()">
          <button class="x" (click)="detalle.set(null)" aria-label="Cerrar">✕</button>
          @if (cargandoDetalle()) {
            <p class="muted pad">Cargando detalle…</p>
          } @else if (!detalle()?.local?.jugadores?.length && !detalle()?.visitante?.jugadores?.length) {
            <p class="muted pad">Sin alineaciones guardadas en este partido.</p>
          } @else {
            <div class="dmarcador">
              <span class="de">{{ detalle().local.equipo }}</span>
              <span class="dm num">{{ detalle().local.total }} – {{ detalle().visitante.total }}</span>
              <span class="de">{{ detalle().visitante.equipo }}</span>
            </div>
            <div class="dcols">
              @for (lado of [detalle().local, detalle().visitante]; track lado.equipo) {
                <div class="dcol">
                  @for (j of lado.jugadores; track j.nombre) {
                    <div class="dj" [class.supl]="j.rol !== 'TITULAR'" [class.nojugo]="!j.jugo">
                      <span class="pos" [class]="abrPos(j.pos)">{{ abrPos(j.pos) }}</span>
                      <span class="dn">{{ j.nombre }}</span>
                      <span class="dp num" [class.neg]="j.puntos < 0">{{ j.puntos }}</span>
                    </div>
                  }
                </div>
              }
            </div>
            <p class="dleg">Los suplentes van con borde discontinuo; en gris, quien no llegó a jugar.</p>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .comps { margin-bottom: 12px; }
    .jchips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px; margin-bottom: 14px; }
    .jchips button { flex: 0 0 auto; min-width: 44px; padding: 8px 10px; border: 1px solid var(--line);
      background: var(--surface); color: var(--text2); border-radius: 10px; cursor: pointer;
      font-family: var(--fm); font-weight: 600; font-size: var(--t-sm); }
    .jchips button.on { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }

    .lista { display: flex; flex-direction: column; gap: 10px; }
    .match { width: 100%; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
      gap: 12px; padding: 15px 16px; cursor: pointer; text-align: left;
      background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); }
    .match:hover { border-color: var(--accent-line); }
    .lado { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .lado.izq { justify-content: flex-end; } .lado.der { justify-content: flex-start; }
    .marca { width: 3px; height: 24px; border-radius: 2px; flex: 0 0 auto; }
    .nm { font-family: var(--fh); font-size: var(--t-md); font-weight: 500; text-transform: uppercase;
      color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lado.gana .nm { color: var(--text); font-weight: 600; }
    .centro { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 0 8px; }
    .marcador { font-size: var(--t-lg); font-weight: 700; white-space: nowrap; }
    .marcador i { color: var(--text2); margin: 0 6px; font-style: normal; }
    .est { font-size: var(--t-xs); font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
      color: var(--text2); white-space: nowrap; }

    .back { position: fixed; inset: 0; z-index: 60; background: rgba(22,19,15,.42);
      display: flex; align-items: flex-end; justify-content: center; }
    .panel { position: relative; width: 100%; max-width: 640px; max-height: 88vh; overflow-y: auto;
      background: var(--surface); border: 1px solid var(--line); border-top: 3px solid var(--accent);
      border-radius: 22px 22px 0 0; padding: 22px; }
    @media (min-width: 680px) { .back { align-items: center; } .panel { border-radius: 22px; } }
    .x { position: absolute; top: 14px; right: 14px; background: var(--surface2); border: 1px solid var(--line);
      color: var(--text2); width: 32px; height: 32px; border-radius: 9px; cursor: pointer; font-size: var(--t-sm); z-index: 1; }
    .pad { padding: 18px 0; }
    .dmarcador { display: grid; grid-template-columns: 1fr auto 1fr; align-items: baseline; gap: 12px;
      margin-bottom: 18px; padding-right: 40px; }
    .de { font-family: var(--fh); font-size: var(--t-md); font-weight: 600; text-transform: uppercase; }
    .dmarcador .de:last-child { text-align: right; }
    .dm { font-size: var(--t-lg); font-weight: 700; text-align: center; color: var(--accent); white-space: nowrap; }
    .dcols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .dcol { display: flex; flex-direction: column; gap: 4px; }
    .dj { display: grid; grid-template-columns: 32px 1fr auto; align-items: center; gap: 8px; padding: 6px 8px;
      background: var(--surface); border: 1px solid var(--line); border-radius: 8px; font-size: var(--t-sm); }
    .dj.supl { border-style: dashed; }
    .dj.nojugo { color: var(--text2); }
    .dj.nojugo .dp { color: var(--text2); }
    .dj .pos { min-width: 30px; padding: 2px 4px; font-size: var(--t-xs); }
    .dn { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
    .dp { font-weight: 700; color: var(--accent); } .dp.neg { color: var(--bad); }
    .dleg { margin: 14px 0 0; font-size: var(--t-xs); color: var(--text2); }
    .muted { color: var(--text2); } .err { color: var(--bad); }

    @media (max-width: 560px) {
      .nm { font-size: var(--t-md); }
      .dcols { grid-template-columns: 1fr; }
    }
  `],
})
export class JornadasComponent implements OnInit {
  competiciones = signal<Competicion[]>([]);
  competicionId = signal('');
  jornadas = signal<JornadaFalm[]>([]);
  jornadaId = signal('');
  enfrentamientos = signal<EnfrentamientoFila[]>([]);
  detalle = signal<any | null>(null);
  cargandoDetalle = signal(false);
  cargando = signal(true);
  error = signal('');

  constructor(private falm: FalmService) {}
  abrPos(p: string) { return ({ PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' } as Record<string, string>)[p] ?? p; }
  color(n: string) { return colorEquipo(n); }
  etiqueta(t: string) { return t === 'CHAMPIONS' ? 'Champions' : t === 'CLAUSURA' ? 'Clausura' : 'Liga'; }

  subtitulo() {
    const j = this.jornadas().find((x) => x.id === this.jornadaId());
    const c = this.competiciones().find((x) => x.id === this.competicionId());
    const eti = c ? this.etiqueta(c.tipo) : 'Liga';
    return j ? `${eti} · jornada ${j.numero}. Toca un partido para ver los dos onces.`
             : `${eti} · aún sin jornadas.`;
  }

  async abrirDetalle(e: EnfrentamientoFila) {
    this.cargandoDetalle.set(true);
    try { this.detalle.set(await this.falm.detalleEnfrentamiento(e.enfrentamiento_id)); }
    catch { this.detalle.set(null); }
    finally { this.cargandoDetalle.set(false); }
  }

  async ngOnInit() {
    try {
      const comps = await this.falm.competiciones();
      // Orden estable: Liga, Champions, Clausura
      const orden = { LIGA: 0, CHAMPIONS: 1, CLAUSURA: 2 } as Record<string, number>;
      comps.sort((a, b) => (orden[a.tipo] ?? 9) - (orden[b.tipo] ?? 9));
      this.competiciones.set(comps);
      const liga = comps.find((c) => c.tipo === 'LIGA') ?? comps[0];
      if (liga) { this.competicionId.set(liga.id); await this.cargarJornadas(liga.id); }
      else this.cargando.set(false);
    } catch (e: any) { this.error.set(e?.message ?? 'Error'); this.cargando.set(false); }
  }

  async seleccionarCompeticion(id: string) {
    if (id === this.competicionId()) return;
    this.competicionId.set(id);
    this.cargando.set(true); this.error.set('');
    this.enfrentamientos.set([]); this.jornadas.set([]);
    try { await this.cargarJornadas(id); }
    catch (e: any) { this.error.set(e?.message ?? 'Error'); this.cargando.set(false); }
  }

  async cargarJornadas(compId: string) {
    const js = await this.falm.jornadas(compId);
    this.jornadas.set(js);
    if (js.length > 0) await this.seleccionarJornada(js[js.length - 1].id);
    else { this.enfrentamientos.set([]); this.cargando.set(false); }
  }

  async seleccionarJornada(id: string) {
    this.jornadaId.set(id);
    this.cargando.set(true); this.error.set('');
    try { this.enfrentamientos.set(await this.falm.enfrentamientos(id)); }
    catch (e: any) { this.error.set(e?.message ?? 'Error'); }
    finally { this.cargando.set(false); }
  }
}
