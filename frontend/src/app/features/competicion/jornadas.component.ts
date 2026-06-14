import { Component, OnInit, signal } from '@angular/core';
import { Competicion, EnfrentamientoFila, FalmService, JornadaFalm } from '../../core/falm.service';

const COLORES = ['#00e676', '#38bdf8', '#fb7185', '#a3e635', '#ffc24b', '#c084fc', '#f97316', '#2dd4bf', '#f472b6', '#60a5fa'];

/** Resultados de los enfrentamientos por jornada (tarjetas de partido). */
@Component({
  selector: 'app-jornadas',
  standalone: true,
  template: `
    <h1>📅 Partidos</h1>

    @if (competiciones().length > 1) {
      <div class="comps">
        @for (c of competiciones(); track c.id) {
          <button class="comp" [class.on]="c.id === competicionId()" (click)="seleccionarCompeticion(c.id)">
            <span class="ci">{{ icono(c.tipo) }}</span> {{ etiqueta(c.tipo) }}
          </button>
        }
      </div>
    }

    @if (jornadas().length > 0) {
      <div class="jchips">
        @for (j of jornadas(); track j.id) {
          <button class="jchip" [class.on]="j.id === jornadaId()" (click)="seleccionarJornada(j.id)">J{{ j.numero }}</button>
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
          <div class="match card rise" (click)="abrirDetalle(e)">
            <div class="lado izq" [class.gana]="e.puntos_clasif_local > e.puntos_clasif_visitante">
              <span class="nm">{{ e.equipo_local }}</span>
              <span class="av" [style.background]="color(e.equipo_local)">{{ ini(e.equipo_local) }}</span>
            </div>
            <div class="centro">
              <span class="marcador num">{{ e.puntos_local }}<i>·</i>{{ e.puntos_visitante }}</span>
              @if (e.jornada_jugada) {
                <span class="chip chip-ok">{{ e.puntos_clasif_local }} - {{ e.puntos_clasif_visitante }}</span>
              } @else { <span class="chip chip-warn">—</span> }
            </div>
            <div class="lado der" [class.gana]="e.puntos_clasif_visitante > e.puntos_clasif_local">
              <span class="av" [style.background]="color(e.equipo_visitante)">{{ ini(e.equipo_visitante) }}</span>
              <span class="nm">{{ e.equipo_visitante }}</span>
            </div>
          </div>
        }
      </div>
    }

    @if (detalle() || cargandoDetalle()) {
      <div class="back" (click)="detalle.set(null)">
        <div class="panel rise" (click)="$event.stopPropagation()">
          <button class="x" (click)="detalle.set(null)">✕</button>
          @if (cargandoDetalle()) {
            <p class="muted" style="padding:20px">Cargando detalle…</p>
          } @else if (!detalle()?.local?.jugadores?.length && !detalle()?.visitante?.jugadores?.length) {
            <p class="muted" style="padding:20px">Sin alineaciones en este partido (la temporada real no guarda once por equipo; prueba la temporada de pruebas).</p>
          } @else {
            <div class="dmarcador">
              <span class="de">{{ detalle().local.equipo }}</span>
              <span class="dm num">{{ detalle().local.total }} · {{ detalle().visitante.total }}</span>
              <span class="de">{{ detalle().visitante.equipo }}</span>
            </div>
            <div class="dcols">
              @for (lado of [detalle().local, detalle().visitante]; track lado.equipo) {
                <div class="dcol">
                  @for (j of lado.jugadores; track j.nombre) {
                    <div class="dj" [class.supl]="j.rol !== 'TITULAR'" [class.nojugo]="!j.jugo">
                      <span class="dpos" [class]="abrPos(j.pos)">{{ abrPos(j.pos) }}</span>
                      <span class="dn">{{ j.nombre }}</span>
                      <span class="dp num" [class.neg]="j.puntos < 0">{{ j.puntos }}</span>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    h1 { margin: 0 0 14px; }
    .match { cursor: pointer; }
    .back { position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,.66); backdrop-filter: blur(4px);
      display: flex; align-items: flex-end; justify-content: center; }
    .panel { position: relative; width: 100%; max-width: 640px; max-height: 88vh; overflow-y: auto;
      background: linear-gradient(180deg, var(--surface), var(--bg-elev)); border: 1px solid var(--border);
      border-top: 3px solid var(--primary); border-radius: 22px 22px 0 0; padding: 20px; }
    @media (min-width: 680px) { .back { align-items: center; } .panel { border-radius: 22px; } }
    .x { position: absolute; top: 14px; right: 14px; background: var(--surface-2); border: 1px solid var(--border);
      color: var(--muted); width: 32px; height: 32px; border-radius: 9px; cursor: pointer; z-index: 1; }
    .dmarcador { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 10px; margin-bottom: 16px; }
    .de { font-weight: 800; font-size: .9rem; } .dmarcador .de:last-child { text-align: right; }
    .dm { font-weight: 900; font-size: 1.5rem; text-align: center; }
    .dcols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .dcol { display: flex; flex-direction: column; gap: 4px; }
    .dj { display: grid; grid-template-columns: 30px 1fr auto; align-items: center; gap: 7px; padding: 6px 8px;
      background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; font-size: .78rem; }
    .dj.supl { opacity: .85; border-style: dashed; }
    .dj.nojugo { opacity: .45; }
    .dpos { text-align: center; padding: 1px 0; border-radius: 4px; font-size: .58rem; font-weight: 800; color: #07120d; }
    .dpos.POR { background: var(--pos-POR); } .dpos.DEF { background: var(--pos-DEF); }
    .dpos.MED { background: var(--pos-MED); } .dpos.DEL { background: var(--pos-DEL); }
    .dn { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
    .dp { font-weight: 900; color: var(--primary); } .dp.neg { color: var(--bad); }
    .comps { display: flex; gap: 8px; margin-bottom: 16px; overflow-x: auto; padding-bottom: 4px; }
    .comp { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; padding: 9px 15px; border-radius: 11px;
      border: 1px solid var(--border); background: var(--surface); color: var(--muted); cursor: pointer;
      font-weight: 800; font-size: .82rem; white-space: nowrap; transition: all .14s ease; }
    .comp .ci { font-size: 1rem; }
    .comp.on { background: rgba(0,230,118,.1); color: var(--primary); border-color: var(--primary);
      box-shadow: inset 0 0 0 1px var(--primary); }
    .jchips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 14px; }
    .jchip { flex: 0 0 auto; min-width: 44px; height: 38px; border: 1px solid var(--border); background: var(--surface);
      color: var(--muted); border-radius: 10px; cursor: pointer; font-weight: 800; }
    .jchip.on { background: var(--primary); color: var(--primary-ink); border-color: var(--primary); }
    .lista { display: flex; flex-direction: column; gap: 10px; }
    .match { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 14px 12px; }
    .lado { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .lado.izq { justify-content: flex-end; } .lado.der { justify-content: flex-start; }
    .av { flex: 0 0 auto; width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center;
      justify-content: center; font-weight: 800; color: #07120d; font-size: .9rem; }
    .nm { font-weight: 700; font-size: .86rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lado.gana .nm { color: var(--ink); }
    .centro { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 0 10px; }
    .marcador { font-weight: 900; font-size: 1.3rem; letter-spacing: -.02em; }
    .marcador i { color: var(--faint); margin: 0 5px; font-style: normal; }
    .muted { color: var(--muted); } .err { color: var(--bad); }
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
  ini(n: string) { return (n || '?').charAt(0).toUpperCase(); }
  abrPos(p: string) { return ({ PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' } as Record<string, string>)[p] ?? p; }

  async abrirDetalle(e: EnfrentamientoFila) {
    this.cargandoDetalle.set(true);
    try { this.detalle.set(await this.falm.detalleEnfrentamiento(e.enfrentamiento_id)); }
    catch { this.detalle.set(null); }
    finally { this.cargandoDetalle.set(false); }
  }
  color(n: string) { let h = 0; for (const c of n || '') h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORES[h % COLORES.length]; }
  icono(t: string) { return t === 'CHAMPIONS' ? '🌟' : t === 'CLAUSURA' ? '🔚' : '🏆'; }
  etiqueta(t: string) { return t === 'CHAMPIONS' ? 'Champions' : t === 'CLAUSURA' ? 'Clausura' : 'Liga'; }

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
