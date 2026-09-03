import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';

export interface EquipoSorteo { id: string; nombre: string }

/**
 * Captura del sorteo físico: se van cantando los equipos y se pulsan en el
 * orden en que salen. Un clic por equipo, porque esto se rellena en directo
 * con diez personas mirando.
 */
@Component({
  selector: 'admin-draft-sorteo',
  standalone: true,
  template: `
    <div class="sorteo">
      <p class="hint">
        Pulsa los equipos en el orden en que salgan en el sorteo.
        Elegidos {{ orden().length }} de {{ equipos.length }}.
      </p>

      @if (orden().length) {
        <ol class="elegidos">
          @for (id of orden(); track id; let i = $index) {
            <li>
              <span class="p num">{{ i + 1 }}º</span>
              <span class="n">{{ nombre(id) }}</span>
            </li>
          }
        </ol>
      }

      @if (pendientes().length) {
        <p class="lb">Siguiente ({{ orden().length + 1 }}º):</p>
        <div class="pend">
          @for (e of pendientes(); track e.id) {
            <button class="eq" (click)="elegir(e.id)">{{ e.nombre }}</button>
          }
        </div>
      }

      <div class="acc">
        <button class="btn" [disabled]="pendientes().length > 0" (click)="confirmar()">
          {{ etiqueta }}
        </button>
        @if (orden().length) {
          <button class="btn ghost" (click)="deshacer()">↩ Quitar el último</button>
          <button class="btn ghost" (click)="reiniciar()">Empezar de nuevo</button>
        }
      </div>
    </div>
  `,
  styles: [`
    .sorteo { padding: 12px; background: var(--surface2); border: 1px solid var(--line);
              border-radius: 10px; margin-bottom: 12px; }
    .hint { color: var(--text2); font-size: 13.5px; margin: 0 0 10px; }
    .lb { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em;
          color: var(--text2); font-weight: 700; margin: 12px 0 6px; }
    .elegidos { list-style: none; padding: 0; margin: 0; display: flex;
                flex-direction: column; gap: 4px; }
    .elegidos li { display: flex; gap: 10px; align-items: center; padding: 6px 10px;
                   background: var(--surface); border: 1px solid var(--line); border-radius: 8px; }
    .elegidos .p { width: 28px; color: var(--text2); font-weight: 700; font-size: 12px; }
    .elegidos .n { font-weight: 700; font-size: 13.5px; }
    .pend { display: flex; flex-wrap: wrap; gap: 6px; }
    .eq { background: var(--surface); border: 1px solid var(--line); color: var(--text);
          border-radius: 8px; padding: 8px 12px; cursor: pointer; font-weight: 700;
          font-size: 13px; }
    .acc { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .btn.ghost { background: var(--surface2); color: var(--text); border: 1px solid var(--line); }
  `],
})
export class AdminDraftSorteoComponent {
  @Input() equipos: EquipoSorteo[] = [];
  @Input() etiqueta = 'Crear draft con este orden';
  @Output() confirmado = new EventEmitter<string[]>();

  readonly orden = signal<string[]>([]);

  readonly pendientes = computed(() => {
    const puestos = new Set(this.orden());
    return this.equipos.filter((e) => !puestos.has(e.id));
  });

  nombre(id: string) { return this.equipos.find((e) => e.id === id)?.nombre ?? '?'; }
  elegir(id: string) { this.orden.update((o) => [...o, id]); }
  deshacer() { this.orden.update((o) => o.slice(0, -1)); }
  reiniciar() { this.orden.set([]); }
  confirmar() { if (!this.pendientes().length) this.confirmado.emit(this.orden()); }
}
