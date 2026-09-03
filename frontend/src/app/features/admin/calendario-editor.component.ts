import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JornadaCalendario } from './admin.service';
import { EquipoSorteo } from './draft-sorteo.component';

/**
 * Edición puntual del calendario: cambiar un cruce, darle la vuelta a la
 * localía o mover una jornada a otra jornada de LaLiga.
 *
 * Existe porque regenerar el calendario entero re-sortea todo y borra los
 * resultados: cuando la liga ya está montada, lo que hace falta es corregir una
 * cosa concreta, no volver a empezar. Las jornadas ya jugadas salen en solo
 * lectura, y la base de datos lo vuelve a comprobar por su cuenta.
 */
@Component({
  selector: 'admin-calendario-editor',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (!jornadas.length) {
      <p class="hint">Todavía no hay calendario que editar.</p>
    } @else {
      <div class="form">
        <label>Jornada
          <select [ngModel]="sel()" (ngModelChange)="elegir($event)">
            @for (j of jornadas; track j.id) {
              <option [value]="j.id">
                J{{ j.n }} · LFP {{ j.lfp ?? '—' }}{{ j.jugada ? ' (jugada)' : '' }}
              </option>
            }
          </select>
        </label>
      </div>

      @if (jornada(); as j) {
        @if (j.jugada) {
          <p class="hint alerta">
            La jornada {{ j.n }} ya tiene resultados o alineaciones: no se puede tocar.
          </p>
        } @else {
          <div class="form">
            <label>Mapear a jornada LFP
              <input type="number" [ngModel]="lfp()" (ngModelChange)="lfp.set($event)"
                     style="width:70px" />
            </label>
            <button class="mini" (click)="guardarJornada(j)">Guardar mapeo</button>
          </div>
        }

        <div class="cruces">
          @for (c of j.cruces; track c.id) {
            <div class="cruce">
              @if (j.jugada) {
                <span class="eq">{{ c.local }}</span>
                <span class="vs num">{{ c.puntos_local }} - {{ c.puntos_visitante }}</span>
                <span class="eq der">{{ c.visitante }}</span>
              } @else {
                <select [ngModel]="local(c.id)" (ngModelChange)="setLocal(c.id, $event)">
                  @for (e of equipos; track e.id) { <option [value]="e.id">{{ e.nombre }}</option> }
                </select>
                <button class="mini inv" (click)="invertir(c.id)" title="Invertir localía">↔</button>
                <select [ngModel]="visitante(c.id)" (ngModelChange)="setVisitante(c.id, $event)">
                  @for (e of equipos; track e.id) { <option [value]="e.id">{{ e.nombre }}</option> }
                </select>
                <button class="mini" [disabled]="!tocado(c.id)" (click)="guardarCruce(c.id)">
                  Guardar
                </button>
              }
            </div>
          }
        </div>
      }
    }
  `,
  styles: [`
    .form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
    .form label { font-size: var(--t-sm); color: var(--text2); display: flex; gap: 6px; align-items: center; }
    .hint { color: var(--text2); font-size: var(--t-sm); margin: 0 0 10px; }
    .hint.alerta { color: var(--bad); border-left: 2px solid var(--bad); padding-left: 9px; }
    .cruces { display: flex; flex-direction: column; gap: 6px; }
    .cruce { display: grid; grid-template-columns: 1fr 34px 1fr 84px; gap: 8px; align-items: center;
      padding: 7px 10px; background: var(--surface2); border: 1px solid var(--line);
      border-radius: var(--r-xs); font-size: var(--t-sm); }
    .cruce select { width: 100%; font-size: var(--t-sm); padding: 5px 8px; }
    .eq { font-weight: 700; }
    .eq.der { text-align: right; }
    .vs { text-align: center; color: var(--text2); }
    .mini { background: var(--surface); border: 1px solid var(--line); color: var(--text);
      border-radius: var(--r-xs); padding: 5px 9px; cursor: pointer; font-weight: 700;
      font-size: var(--t-xs); font-family: var(--fb); }
    .mini:disabled { opacity: .4; cursor: not-allowed; }
    .mini.inv { padding: 5px 0; }
    @media (max-width: 700px) {
      .cruce { grid-template-columns: 1fr 30px 1fr; }
      .cruce > .mini:last-child { grid-column: 1 / -1; }
    }
  `],
})
export class AdminCalendarioEditorComponent {
  @Input() jornadas: JornadaCalendario[] = [];
  @Input() equipos: EquipoSorteo[] = [];
  /** (enfrentamientoId, localId, visitanteId) */
  @Output() cruceEditado = new EventEmitter<[string, string, string]>();
  /** (jornadaFalmId, lfpNumero) */
  @Output() jornadaEditada = new EventEmitter<[string, number]>();

  readonly sel = signal('');
  readonly lfp = signal<number | null>(null);
  /** Cambios sin guardar, por cruce. */
  private readonly borrador = signal<Record<string, { local: string; visitante: string }>>({});

  readonly jornada = computed(() => this.jornadas.find((j) => j.id === this.sel()) ?? null);

  elegir(id: string) {
    this.sel.set(id);
    const j = this.jornadas.find((x) => x.id === id);
    this.lfp.set(j?.lfp ?? null);
    const b: Record<string, { local: string; visitante: string }> = {};
    for (const c of j?.cruces ?? []) b[c.id] = { local: c.local_id, visitante: c.visitante_id };
    this.borrador.set(b);
  }

  private cruce(id: string) {
    return this.jornada()?.cruces.find((c) => c.id === id) ?? null;
  }

  local(id: string) { return this.borrador()[id]?.local ?? ''; }
  visitante(id: string) { return this.borrador()[id]?.visitante ?? ''; }

  /** Cierto si el cruce difiere de lo guardado: es lo que habilita el botón. */
  tocado(id: string) {
    const c = this.cruce(id);
    const b = this.borrador()[id];
    return !!c && !!b && (b.local !== c.local_id || b.visitante !== c.visitante_id);
  }

  setLocal(id: string, v: string) {
    this.borrador.update((b) => ({ ...b, [id]: { ...b[id], local: v } }));
  }
  setVisitante(id: string, v: string) {
    this.borrador.update((b) => ({ ...b, [id]: { ...b[id], visitante: v } }));
  }

  /** Invertir localía es el caso más habitual, así que va en un solo clic. */
  invertir(id: string) {
    const b = this.borrador()[id];
    if (!b) return;
    this.cruceEditado.emit([id, b.visitante, b.local]);
  }

  guardarCruce(id: string) {
    const b = this.borrador()[id];
    if (!b) return;
    this.cruceEditado.emit([id, b.local, b.visitante]);
  }

  guardarJornada(j: JornadaCalendario) {
    const n = Number(this.lfp());
    if (!n) return;
    this.jornadaEditada.emit([j.id, n]);
  }
}
