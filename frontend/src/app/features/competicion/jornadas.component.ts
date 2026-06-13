import { Component, OnInit, signal } from '@angular/core';
import { Competicion, EnfrentamientoFila, FalmService, JornadaFalm } from '../../core/falm.service';

const COLORES = ['#00e676', '#38bdf8', '#fb7185', '#a3e635', '#ffc24b', '#c084fc', '#f97316', '#2dd4bf', '#f472b6', '#60a5fa'];

/** Resultados de los enfrentamientos por jornada (tarjetas de partido). */
@Component({
  selector: 'app-jornadas',
  standalone: true,
  template: `
    <h1>📅 Partidos</h1>

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
          <div class="match card rise">
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
  `,
  styles: [`
    h1 { margin: 0 0 14px; }
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
  cargando = signal(true);
  error = signal('');

  constructor(private falm: FalmService) {}
  ini(n: string) { return (n || '?').charAt(0).toUpperCase(); }
  color(n: string) { let h = 0; for (const c of n || '') h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORES[h % COLORES.length]; }

  async ngOnInit() {
    try {
      const comps = await this.falm.competiciones();
      this.competiciones.set(comps);
      const liga = comps.find((c) => c.tipo === 'LIGA') ?? comps[0];
      if (liga) { this.competicionId.set(liga.id); await this.cargarJornadas(liga.id); }
      else this.cargando.set(false);
    } catch (e: any) { this.error.set(e?.message ?? 'Error'); this.cargando.set(false); }
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
