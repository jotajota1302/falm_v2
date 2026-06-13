import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import {
  AlineacionGuardada, Equipo, FalmService, FORMACIONES, ItemPlantilla, JornadaFalm, RolAlineacion,
} from '../../core/falm.service';

const ORDEN: Record<string, number> = { PORTERO: 0, DEFENSA: 1, MEDIO: 2, DELANTERO: 3 };
const ETI: Record<string, string> = { PORTERO: 'Porteros', DEFENSA: 'Defensas', MEDIO: 'Medios', DELANTERO: 'Delanteros' };

/** Edición de alineación: formación + titulares/suplentes. Guardado real requiere ser dueño (RLS). */
@Component({
  selector: 'app-alineacion',
  standalone: true,
  imports: [FormsModule],
  template: `
    <h1>📋 Alineación</h1>

    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else if (error()) {
      <p class="err">{{ error() }}</p>
    } @else if (!equipo()) {
      <p class="muted">No tienes equipo en la temporada activa.</p>
    } @else {
      <div class="barra card">
        <label>Formación
          <select [(ngModel)]="formacion">
            @for (f of formaciones; track f) { <option [value]="f">{{ f }}</option> }
          </select>
        </label>
        <div class="cont">
          <span class="t" [class.ok]="titulares() === 11">{{ titulares() }}/11 titulares</span>
          <span class="s">{{ suplentes() }} suplentes</span>
        </div>
        <button class="guardar" (click)="guardar()" [disabled]="guardando()">
          {{ guardando() ? '…' : 'Guardar' }}
        </button>
      </div>

      @if (aviso()) { <p class="aviso">{{ aviso() }}</p> }

      @for (g of grupos(); track g.pos) {
        <h3>{{ g.eti }}</h3>
        <div class="lista">
          @for (j of g.items; track j.activo_id) {
            <div class="fila card">
              <div class="jug">
                <span class="nom">{{ j.nombre }}</span>
                <span class="club">{{ j.club }}</span>
              </div>
              <div class="roles">
                <button [class.on]="rol(j.activo_id) === 'TITULAR'" (click)="set(j, 'TITULAR')">Titular</button>
                @if (j.posicion !== 'PORTERO') {
                  <button [class.on]="esSuplente(j.activo_id)" (click)="set(j, suplRol(j.posicion))">Supl.</button>
                }
                <button [class.on]="!rol(j.activo_id)" (click)="set(j, null)">—</button>
              </div>
            </div>
          }
        </div>
      }
    }
  `,
  styles: [`
    h1 { margin: 0 0 16px; } h3 { margin: 18px 0 8px; }
    .barra { display: flex; align-items: center; gap: 14px; padding: 14px 16px; margin-bottom: 14px; flex-wrap: wrap; }
    .barra label { display: flex; align-items: center; gap: 8px; font-weight: 600; }
    .barra select { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 1rem; }
    .cont { display: flex; gap: 12px; flex: 1; }
    .cont .t { font-weight: 700; color: var(--bad); } .cont .t.ok { color: var(--ok); }
    .cont .s { color: var(--muted); }
    .guardar { padding: 9px 18px; border: none; border-radius: 10px; background: var(--primary); color: #fff; font-weight: 700; cursor: pointer; }
    .aviso { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px 14px; border-radius: 10px; }
    .lista { display: flex; flex-direction: column; gap: 8px; }
    .fila { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; }
    .jug { display: flex; flex-direction: column; }
    .nom { font-weight: 600; } .club { color: var(--muted); font-size: .82rem; }
    .roles { display: flex; gap: 6px; }
    .roles button { padding: 6px 10px; border: 1px solid var(--border); background: var(--surface);
      border-radius: 8px; cursor: pointer; font-size: .82rem; }
    .roles button.on { background: var(--primary); color: #fff; border-color: var(--primary); }
    .muted { color: var(--muted); } .err { color: var(--bad); }
  `],
})
export class AlineacionComponent implements OnInit {
  formaciones = FORMACIONES;
  formacion = '4-4-2';
  equipo = signal<Equipo | null>(null);
  jornada = signal<JornadaFalm | null>(null);
  plantilla = signal<ItemPlantilla[]>([]);
  roles = signal<Record<string, RolAlineacion>>({});
  cargando = signal(true);
  guardando = signal(false);
  error = signal('');
  aviso = signal('');

  titulares = computed(() => Object.values(this.roles()).filter((r) => r === 'TITULAR').length);
  suplentes = computed(() => Object.values(this.roles()).filter((r) => r && r !== 'TITULAR').length);

  grupos = computed(() => {
    const by: Record<string, ItemPlantilla[]> = {};
    for (const it of this.plantilla()) (by[it.posicion] ??= []).push(it);
    return Object.keys(by).sort((a, b) => ORDEN[a] - ORDEN[b]).map((pos) => ({ pos, eti: ETI[pos] ?? pos, items: by[pos] }));
  });

  constructor(private falm: FalmService) {}

  async ngOnInit() {
    try {
      const eq = await this.falm.miEquipo();
      this.equipo.set(eq);
      if (!eq) return;
      const [jor, plant] = await Promise.all([this.falm.jornadaActualLiga(), this.falm.miPlantilla(eq.id)]);
      this.jornada.set(jor);
      this.plantilla.set(plant);
      if (jor) {
        const ali: AlineacionGuardada | null = await this.falm.getAlineacion(eq.id, jor.id);
        if (ali) { this.formacion = ali.formacion; this.roles.set(ali.roles); }
      }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error cargando la alineación');
    } finally {
      this.cargando.set(false);
    }
  }

  rol(activoId: string): RolAlineacion { return this.roles()[activoId] ?? null; }
  esSuplente(activoId: string) { const r = this.rol(activoId); return !!r && r !== 'TITULAR'; }
  suplRol(pos: string): RolAlineacion {
    return pos === 'DEFENSA' ? 'SUPLENTE_DEFENSA' : pos === 'MEDIO' ? 'SUPLENTE_MEDIO' : pos === 'DELANTERO' ? 'SUPLENTE_DELANTERO' : null;
  }
  set(j: ItemPlantilla, rol: RolAlineacion) {
    this.roles.update((r) => ({ ...r, [j.activo_id]: rol }));
  }

  async guardar() {
    this.aviso.set(''); this.error.set('');
    // Modo demo (sesión anónima sin ownership): no se persiste por RLS.
    if (environment.devEquipoNombre) {
      this.aviso.set('Modo demo: tu selección no se guarda hasta que actives tu cuenta (login). La pantalla es totalmente funcional.');
      return;
    }
    const eq = this.equipo(); const jor = this.jornada();
    if (!eq || !jor) return;
    this.guardando.set(true);
    try {
      await this.falm.guardarAlineacion(eq.id, jor.id, this.formacion, this.roles());
      this.aviso.set('✅ Alineación guardada.');
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al guardar');
    } finally {
      this.guardando.set(false);
    }
  }
}
