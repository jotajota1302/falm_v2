import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import {
  AlineacionGuardada, Competicion, Equipo, FalmService, FORMACIONES, ItemPlantilla, JornadaFalm, RolAlineacion,
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
      @if (competiciones().length > 1) {
        <div class="comps">
          @for (c of competiciones(); track c.id) {
            <button class="comp" [class.on]="c.id === competicionId()" (click)="seleccionarCompeticion(c.id)">
              <span class="ci">{{ icono(c.tipo) }}</span> {{ etiqueta(c.tipo) }}
            </button>
          }
        </div>
      }

      @if (jornadasComp().length > 0) {
        <div class="jchips">
          @for (j of jornadasComp(); track j.id) {
            <button class="jchip" [class.on]="j.id === jornada()?.id" (click)="seleccionarJornada(j)">J{{ j.numero }}</button>
          }
        </div>
      }

      <div class="barra">
        <label class="form">
          <select [ngModel]="formacion()" (ngModelChange)="formacion.set($event)">
            @for (f of formaciones; track f) { <option [value]="f">{{ f }}</option> }
          </select>
        </label>
        <span class="cont" [class.ok]="titulares() === 11">{{ titulares() }}<small>/11</small></span>
        <button class="btn" (click)="guardar()" [disabled]="guardando()">{{ guardando() ? '…' : 'Guardar' }}</button>
      </div>

      <div class="atajos">
        <button class="atajo" (click)="repetirUltima()">↩︎ Repetir última</button>
        @if (!esLiga()) { <button class="atajo" (click)="copiarDeLiga()">📋 Copiar de Liga</button> }
      </div>

      @if (heredada()) { <p class="hered">↩︎ Heredada de tu última jornada de {{ etiqueta(compTipo()) }}. Ajústala y guarda si quieres cambiarla.</p> }
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
    .comps { display: flex; gap: 8px; margin-bottom: 12px; overflow-x: auto; padding-bottom: 4px; }
    .comp { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 11px;
      border: 1px solid var(--border); background: var(--surface); color: var(--muted); cursor: pointer;
      font-weight: 800; font-size: .82rem; white-space: nowrap; transition: all .14s ease; }
    .comp .ci { font-size: 1rem; }
    .comp.on { background: rgba(0,230,118,.1); color: var(--primary); border-color: var(--primary); box-shadow: inset 0 0 0 1px var(--primary); }
    .jchips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 12px; }
    .jchip { flex: 0 0 auto; min-width: 42px; height: 36px; border: 1px solid var(--border); background: var(--surface);
      color: var(--muted); border-radius: 10px; cursor: pointer; font-weight: 800; }
    .jchip.on { background: var(--primary); color: var(--primary-ink); border-color: var(--primary); }
    .atajos { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .atajo { background: var(--surface-2); border: 1px solid var(--border); color: var(--ink); border-radius: 10px;
      padding: 8px 13px; cursor: pointer; font-weight: 700; font-size: .8rem; }
    .atajo:hover { border-color: var(--border-strong); }
    .barra { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
    .form select { font-weight: 800; }
    .cont { font-weight: 900; font-size: 1.2rem; color: var(--bad); }
    .cont.ok { color: var(--primary); } .cont small { color: var(--muted); font-size: .9rem; }
    .barra .btn { margin-left: auto; }
    .aviso { background: rgba(0,230,118,.08); border: 1px solid rgba(0,230,118,.22); color: var(--primary); padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; }
    .hered { background: rgba(255,194,75,.08); border: 1px solid rgba(255,194,75,.22); color: var(--gold); padding: 9px 13px; border-radius: 10px; margin-bottom: 10px; font-size: .85rem; }

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
  competiciones = signal<Competicion[]>([]);
  competicionId = signal('');
  jornadasComp = signal<JornadaFalm[]>([]);
  jornada = signal<JornadaFalm | null>(null);
  plantilla = signal<ItemPlantilla[]>([]);
  roles = signal<Record<string, RolAlineacion>>({});
  cargando = signal(true);
  guardando = signal(false);
  aviso = signal('');
  heredada = signal(false);

  titulares = computed(() => Object.values(this.roles()).filter((r) => r === 'TITULAR').length);
  compTipo = computed(() => this.competiciones().find((c) => c.id === this.competicionId())?.tipo ?? 'LIGA');
  esLiga = computed(() => this.compTipo() === 'LIGA');

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

  icono(t: string) { return t === 'CHAMPIONS' ? '🌟' : t === 'CLAUSURA' ? '🔚' : '🏆'; }
  etiqueta(t: string) { return t === 'CHAMPIONS' ? 'Champions' : t === 'CLAUSURA' ? 'Clausura' : 'Liga'; }
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
      if (!eq) { this.cargando.set(false); return; }
      const [comps, plant] = await Promise.all([this.falm.competiciones(), this.falm.miPlantilla(eq.id)]);
      this.plantilla.set(plant);
      const orden = { LIGA: 0, CHAMPIONS: 1, CLAUSURA: 2 } as Record<string, number>;
      comps.sort((a, b) => (orden[a.tipo] ?? 9) - (orden[b.tipo] ?? 9));
      this.competiciones.set(comps);
      const liga = comps.find((c) => c.tipo === 'LIGA') ?? comps[0];
      if (liga) await this.seleccionarCompeticion(liga.id);
    } catch (e: any) {
      this.aviso.set(e?.message ?? 'Error');
    } finally { this.cargando.set(false); }
  }

  async seleccionarCompeticion(compId: string) {
    this.competicionId.set(compId);
    const js = await this.falm.jornadas(compId);
    this.jornadasComp.set(js);
    if (js.length > 0) await this.seleccionarJornada(js[js.length - 1]);
    else { this.jornada.set(null); this.roles.set({}); }
  }

  async seleccionarJornada(j: JornadaFalm) {
    this.jornada.set(j);
    this.aviso.set(''); this.heredada.set(false);
    const eq = this.equipo();
    if (!eq) return;
    const ali = await this.falm.getAlineacion(eq.id, j.id);
    if (ali) { this.aplicar(ali, false); return; }
    // No hay alineación en esta jornada: heredamos la última de ESTA competición (por defecto).
    const prev = await this.falm.ultimaAlineacion(eq.id, this.competicionId(), j.numero);
    if (prev) this.aplicar(prev, true);
    else { this.formacion.set('4-4-2'); this.roles.set({}); }
  }

  /** Aplica una alineación al editor, filtrando a jugadores que sigan en plantilla. */
  private aplicar(ali: AlineacionGuardada, heredada: boolean) {
    const enPlantilla = new Set(this.plantilla().map((p) => p.activo_id));
    const roles: Record<string, RolAlineacion> = {};
    for (const [id, r] of Object.entries(ali.roles)) if (enPlantilla.has(id)) roles[id] = r;
    this.formacion.set(ali.formacion);
    this.roles.set(roles);
    this.heredada.set(heredada);
  }

  async repetirUltima() {
    const eq = this.equipo(); const j = this.jornada();
    if (!eq || !j) return;
    const prev = await this.falm.ultimaAlineacion(eq.id, this.competicionId(), j.numero);
    if (prev) { this.aplicar(prev, false); this.aviso.set('↩︎ Cargada tu última alineación de ' + this.etiqueta(this.compTipo()) + '. Revisa y guarda.'); }
    else this.aviso.set('No hay una alineación anterior en esta competición para repetir.');
  }

  async copiarDeLiga() {
    const eq = this.equipo(); const j = this.jornada();
    if (!eq || !j) return;
    const liga = await this.falm.copiarDesdeLiga(eq.id, j.fecha);
    if (liga) { this.aplicar(liga, false); this.aviso.set('📋 Copiada tu alineación de Liga del mismo fin de semana. Revisa y guarda.'); }
    else this.aviso.set('No hay alineación de Liga de ese fin de semana para copiar.');
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
