import { Component, OnInit, signal } from '@angular/core';
import { Competicion, EnfrentamientoFila, FalmService, JornadaFalm } from '../../core/falm.service';

/** Resultados de los enfrentamientos por jornada. */
@Component({
  selector: 'app-jornadas',
  standalone: true,
  template: `
    <h1>📅 Jornadas</h1>

    @if (competiciones().length > 1) {
      <div class="tabs">
        @for (c of competiciones(); track c.id) {
          <button [class.active]="c.id === competicionId()" (click)="seleccionarComp(c.id)">{{ c.nombre }}</button>
        }
      </div>
    }

    @if (jornadas().length > 0) {
      <div class="jchips">
        @for (j of jornadas(); track j.id) {
          <button class="jchip" [class.active]="j.id === jornadaId()" (click)="seleccionarJornada(j.id)">J{{ j.numero }}</button>
        }
      </div>
    }

    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else if (error()) {
      <p class="err">{{ error() }}</p>
    } @else if (enfrentamientos().length === 0) {
      <p class="muted">No hay enfrentamientos en esta jornada.</p>
    } @else {
      <div class="lista">
        @for (e of enfrentamientos(); track e.enfrentamiento_id) {
          <div class="card match">
            <div class="lado" [class.gana]="e.puntos_clasif_local > e.puntos_clasif_visitante">
              <span class="eq">{{ e.equipo_local }}</span>
              <span class="pts">{{ e.puntos_local }}</span>
            </div>
            <div class="vs">
              @if (e.jornada_jugada) { <span class="chip chip-ok">{{ e.puntos_clasif_local }} - {{ e.puntos_clasif_visitante }}</span> }
              @else { <span class="chip chip-warn">Pendiente</span> }
            </div>
            <div class="lado" [class.gana]="e.puntos_clasif_visitante > e.puntos_clasif_local">
              <span class="pts">{{ e.puntos_visitante }}</span>
              <span class="eq">{{ e.equipo_visitante }}</span>
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    h1 { margin: 0 0 16px; }
    .tabs { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
    .tabs button { padding: 8px 14px; border: 1px solid var(--border); background: var(--surface);
      border-radius: 999px; cursor: pointer; }
    .tabs button.active { background: var(--primary); color: #fff; border-color: var(--primary); }
    .jchips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 14px; }
    .jchip { flex: 0 0 auto; width: 42px; height: 36px; border: 1px solid var(--border); background: var(--surface);
      border-radius: 10px; cursor: pointer; font-weight: 600; color: var(--muted); }
    .jchip.active { background: var(--primary); color: #fff; border-color: var(--primary); }
    .lista { display: flex; flex-direction: column; gap: 10px; }
    .match { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 14px 16px; }
    .lado { display: flex; align-items: center; gap: 12px; }
    .lado:first-child { justify-content: flex-end; }
    .lado .eq { font-weight: 600; }
    .lado .pts { font-weight: 800; font-size: 1.2rem; min-width: 28px; text-align: center; }
    .lado.gana .eq, .lado.gana .pts { color: var(--primary); }
    .vs { padding: 0 14px; }
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

  async ngOnInit() {
    try {
      const comps = await this.falm.competiciones();
      this.competiciones.set(comps);
      if (comps.length > 0) await this.seleccionarComp(comps[0].id);
      else this.cargando.set(false);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error'); this.cargando.set(false);
    }
  }

  async seleccionarComp(id: string) {
    this.competicionId.set(id);
    this.cargando.set(true); this.error.set('');
    try {
      const js = await this.falm.jornadas(id);
      this.jornadas.set(js);
      if (js.length > 0) await this.seleccionarJornada(js[js.length - 1].id);
      else { this.enfrentamientos.set([]); this.cargando.set(false); }
    } catch (e: any) { this.error.set(e?.message ?? 'Error'); this.cargando.set(false); }
  }

  async seleccionarJornada(id: string) {
    this.jornadaId.set(id);
    this.cargando.set(true); this.error.set('');
    try {
      this.enfrentamientos.set(await this.falm.enfrentamientos(id));
    } catch (e: any) { this.error.set(e?.message ?? 'Error'); }
    finally { this.cargando.set(false); }
  }
}
