import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import {
  AlineacionGuardada, Equipo, FalmService, FORMACIONES, ItemPlantilla, JornadaFalm, RolAlineacion,
} from '../../core/falm.service';

const ORDEN: Record<string, number> = { PORTERO: 0, DEFENSA: 1, MEDIO: 2, DELANTERO: 3 };
const ETI: Record<string, string> = { PORTERO: 'Porteros', DEFENSA: 'Defensas', MEDIO: 'Medios', DELANTERO: 'Delanteros' };
const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/** Alineación con vista de CAMPO (pitch) + selección desde la plantilla. */
@Component({
  selector: 'app-alineacion',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else if (!equipo()) {
      <p class="muted">No tienes equipo en la temporada activa.</p>
    } @else {
      <div class="barra">
        <label class="form">
          <select [ngModel]="formacion()" (ngModelChange)="formacion.set($event)">
            @for (f of formaciones; track f) { <option [value]="f">{{ f }}</option> }
          </select>
        </label>
        <span class="cont" [class.ok]="titulares() === 11">{{ titulares() }}<small>/11</small></span>
        <button class="btn" (click)="guardar()" [disabled]="guardando()">{{ guardando() ? '…' : 'Guardar' }}</button>
      </div>

      @if (aviso()) { <p class="aviso">{{ aviso() }}</p> }

      <!-- CAMPO -->
      <div class="pitch">
        @for (linea of lineasCampo(); track linea.pos) {
          <div class="fila">
            @for (j of linea.jug; track j.activo_id) {
              <button class="ficha" (click)="quitar(j)">
                <span class="av" [class]="ABR[j.posicion]">
                  @if (j.foto) { <img [src]="j.foto" alt="" (error)="j.foto = null" /> }
                  @else { {{ inicialJ(j.nombre) }} }
                </span>
                <span class="nm">{{ corto(j.nombre) }}</span>
              </button>
            }
            @for (h of huecos(linea); track h) {
              <span class="ficha vacia"><span class="av">+</span></span>
            }
          </div>
        }
      </div>

      <!-- BANCO -->
      @if (suplentesList().length) {
        <div class="banco">
          <span class="bl">Banquillo</span>
          @for (j of suplentesList(); track j.activo_id) {
            <button class="mini" (click)="set(j, 'TITULAR')">{{ corto(j.nombre) }} <small>↑</small></button>
          }
        </div>
      }

      <!-- PLANTILLA -->
      <h3 class="ph">Plantilla</h3>
      @for (g of grupos(); track g.pos) {
        <div class="linea-h"><span class="pos" [class]="ABR[g.pos]">{{ ABR[g.pos] }}</span> {{ g.eti }}</div>
        <div class="lista">
          @for (j of g.items; track j.activo_id) {
            <div class="fila-j" [class.tit]="rol(j.activo_id)==='TITULAR'">
              <span class="nm">{{ j.nombre }}</span>
              <span class="acc">
                <button [class.on]="rol(j.activo_id)==='TITULAR'" (click)="set(j,'TITULAR')">XI</button>
                @if (j.posicion!=='PORTERO') { <button [class.on]="esSupl(j.activo_id)" (click)="set(j,suplRol(j.posicion))">B</button> }
                <button [class.on]="!rol(j.activo_id)" (click)="set(j,null)">—</button>
              </span>
            </div>
          }
        </div>
      }
    }
  `,
  styles: [`
    .barra { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
    .form select { font-weight: 800; }
    .cont { font-weight: 900; font-size: 1.2rem; color: var(--bad); }
    .cont.ok { color: var(--primary); } .cont small { color: var(--muted); font-size: .9rem; }
    .barra .btn { margin-left: auto; }
    .aviso { background: rgba(0,230,118,.08); border: 1px solid rgba(0,230,118,.22); color: var(--primary); padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; }

    /* campo */
    .pitch { position: relative; border-radius: 16px; padding: 16px 10px;
      background:
        repeating-linear-gradient(0deg, #0f3d24 0 36px, #114327 36px 72px);
      border: 1px solid rgba(255,255,255,.12);
      display: flex; flex-direction: column-reverse; gap: 8px; min-height: 360px;
      box-shadow: inset 0 0 60px rgba(0,0,0,.4); overflow: hidden; }
    .pitch::before { content: ''; position: absolute; left: 50%; top: 50%; width: 88px; height: 88px;
      border: 2px solid rgba(255,255,255,.18); border-radius: 50%; transform: translate(-50%,-50%); }
    .pitch::after { content: ''; position: absolute; left: 8px; right: 8px; top: 50%; height: 0;
      border-top: 2px solid rgba(255,255,255,.18); }
    .fila { position: relative; z-index: 1; display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; }
    .ficha { background: none; border: none; cursor: pointer; display: flex; flex-direction: column;
      align-items: center; gap: 3px; width: 60px; }
    .ficha .av { width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center;
      justify-content: center; font-weight: 800; color: #07120d; overflow: hidden;
      box-shadow: 0 4px 10px rgba(0,0,0,.5); border: 2px solid rgba(255,255,255,.5); }
    .ficha .av img { width: 100%; height: 100%; object-fit: cover; }
    .ficha .av.POR { background: var(--pos-POR); } .ficha .av.DEF { background: var(--pos-DEF); }
    .ficha .av.MED { background: var(--pos-MED); } .ficha .av.DEL { background: var(--pos-DEL); }
    .ficha .nm { font-size: .64rem; font-weight: 700; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.8);
      max-width: 60px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ficha.vacia .av { background: rgba(255,255,255,.07); border: 2px dashed rgba(255,255,255,.25);
      color: rgba(255,255,255,.5); }

    .banco { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 14px 0; }
    .banco .bl { font-size: .7rem; text-transform: uppercase; letter-spacing: .05em; color: var(--faint); font-weight: 700; }
    .mini { background: var(--surface); border: 1px solid var(--border); color: var(--ink); border-radius: 8px;
      padding: 6px 10px; cursor: pointer; font-size: .78rem; font-weight: 700; }

    .ph { margin: 18px 0 10px; }
    .linea-h { display: flex; align-items: center; gap: 8px; margin: 14px 0 6px; font-weight: 700; color: var(--muted); font-size: .85rem; }
    .lista { display: flex; flex-direction: column; gap: 6px; }
    .fila-j { display: flex; align-items: center; justify-content: space-between; padding: 9px 13px;
      background: var(--surface); border: 1px solid var(--border); border-radius: 11px; }
    .fila-j.tit { border-color: rgba(0,230,118,.4); }
    .fila-j .nm { font-weight: 600; font-size: .88rem; }
    .acc { display: flex; gap: 5px; }
    .acc button { width: 34px; padding: 6px 0; border: 1px solid var(--border); background: var(--surface-2);
      color: var(--muted); border-radius: 8px; cursor: pointer; font-size: .76rem; font-weight: 800; }
    .acc button.on { background: var(--primary); color: var(--primary-ink); border-color: var(--primary); }
    .muted { color: var(--muted); }
  `],
})
export class AlineacionComponent implements OnInit {
  formaciones = FORMACIONES;
  ABR = ABR;
  formacion = signal('4-4-2');
  equipo = signal<Equipo | null>(null);
  jornada = signal<JornadaFalm | null>(null);
  plantilla = signal<ItemPlantilla[]>([]);
  roles = signal<Record<string, RolAlineacion>>({});
  cargando = signal(true);
  guardando = signal(false);
  aviso = signal('');

  titulares = computed(() => Object.values(this.roles()).filter((r) => r === 'TITULAR').length);

  grupos = computed(() => {
    const by: Record<string, ItemPlantilla[]> = {};
    for (const it of this.plantilla()) (by[it.posicion] ??= []).push(it);
    return Object.keys(by).sort((a, b) => ORDEN[a] - ORDEN[b]).map((pos) => ({ pos, eti: ETI[pos] ?? pos, items: by[pos] }));
  });

  // jugadores titulares colocados por línea (orden campo: POR, DEF, MED, DEL)
  lineasCampo = computed(() => {
    const tit = this.plantilla().filter((j) => this.roles()[j.activo_id] === 'TITULAR');
    return ['PORTERO', 'DEFENSA', 'MEDIO', 'DELANTERO'].map((pos) => ({
      pos, jug: tit.filter((j) => j.posicion === pos),
    }));
  });
  suplentesList = computed(() =>
    this.plantilla().filter((j) => { const r = this.roles()[j.activo_id]; return r && r !== 'TITULAR'; }));

  constructor(private falm: FalmService) {}

  inicialJ(n: string) { return (n || '?').charAt(0).toUpperCase(); }
  corto(n: string) { const p = (n || '').split(' '); return p.length > 1 ? p[p.length - 1] : n; }
  rol(id: string): RolAlineacion { return this.roles()[id] ?? null; }
  esSupl(id: string) { const r = this.rol(id); return !!r && r !== 'TITULAR'; }
  suplRol(pos: string): RolAlineacion {
    return pos === 'DEFENSA' ? 'SUPLENTE_DEFENSA' : pos === 'MEDIO' ? 'SUPLENTE_MEDIO' : pos === 'DELANTERO' ? 'SUPLENTE_DELANTERO' : null;
  }
  set(j: ItemPlantilla, rol: RolAlineacion) { this.roles.update((r) => ({ ...r, [j.activo_id]: rol })); }
  quitar(j: ItemPlantilla) { this.set(j, null); }
  huecos(linea: { pos: string; jug: any[] }): number[] {
    // un hueco visible solo si la portería está vacía
    return linea.pos === 'PORTERO' && linea.jug.length === 0 ? [0] : [];
  }

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
        if (ali) { this.formacion.set(ali.formacion); this.roles.set(ali.roles); }
      }
    } catch (e: any) {
      this.aviso.set(e?.message ?? 'Error');
    } finally { this.cargando.set(false); }
  }

  async guardar() {
    this.aviso.set('');
    if (environment.devEquipoNombre) {
      this.aviso.set('Modo demo: tu alineación no se guarda hasta activar tu cuenta. La pantalla es funcional.');
      return;
    }
    const eq = this.equipo(); const jor = this.jornada();
    if (!eq || !jor) return;
    this.guardando.set(true);
    try {
      await this.falm.guardarAlineacion(eq.id, jor.id, this.formacion(), this.roles());
      this.aviso.set('✅ Alineación guardada.');
    } catch (e: any) { this.aviso.set(e?.message ?? 'Error al guardar'); }
    finally { this.guardando.set(false); }
  }
}
