import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Alineado, AlineacionGuardada, Competicion, Equipo, FalmService, FORMACIONES, ItemPlantilla, JornadaFalm,
} from '../../core/falm.service';
import { FutCardComponent } from '../../shared/fut-card.component';

const ETI: Record<string, string> = { PORTERO: 'Portero', DEFENSA: 'Defensa', MEDIO: 'Medio', DELANTERO: 'Delantero' };
const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };
const LINEAS = ['DEFENSA', 'MEDIO', 'DELANTERO'];

/** Once: campo por huecos de formación (toca el hueco → elige) + banquillo multi-línea. */
@Component({
  selector: 'app-alineacion',
  standalone: true,
  imports: [FormsModule, FutCardComponent],
  template: `
    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else if (!equipo()) {
      <p class="muted">No tienes equipo en esta temporada.</p>
    } @else {
      @if (competiciones().length > 1) {
        <div class="comps">
          @for (c of competiciones(); track c.id) {
            <button class="comp" [class.on]="c.id === competicionId()" (click)="seleccionarCompeticion(c.id)">
              {{ icono(c.tipo) }} {{ etiqueta(c.tipo) }}
            </button>
          }
        </div>
      }
      @if (jornadasComp().length) {
        <div class="jchips">
          @for (j of jornadasComp(); track j.id) {
            <button class="jchip" [class.on]="j.id === jornada()?.id" (click)="seleccionarJornada(j)">J{{ j.numero }}</button>
          }
        </div>
      }

      <div class="barra">
        <select [ngModel]="formacion()" (ngModelChange)="cambiarFormacion($event)">
          @for (f of formaciones; track f) { <option [value]="f">{{ f }}</option> }
        </select>
        <span class="cont" [class.ok]="titulares().length === 11">{{ titulares().length }}<small>/11</small></span>
        <button class="btn" (click)="guardar()" [disabled]="guardando()">{{ guardando() ? '…' : 'Guardar' }}</button>
      </div>

      <div class="atajos">
        <button class="atajo" (click)="repetirUltima()">↩︎ Repetir última</button>
        @if (!esLiga()) { <button class="atajo" (click)="copiarDeLiga()">📋 Copiar de Liga</button> }
      </div>
      @if (aviso()) { <p class="aviso">{{ aviso() }}</p> }

      <!-- CAMPO: huecos por formación -->
      <div class="pitch">
        @for (pos of ['DELANTERO','MEDIO','DEFENSA','PORTERO']; track pos) {
          <div class="fila">
            @for (j of enLinea(pos); track j.activo_id) {
              <button class="slot" (click)="abrirLinea(pos)">
                <falm-fut-card [nombre]="j.nombre" [posicion]="j.posicion" [foto]="j.foto ?? null"
                  [escudo]="j.escudo ?? null" [media]="media(j)" />
              </button>
            }
            @for (h of huecos(pos); track h) {
              <button class="slot vacio" (click)="abrirLinea(pos)" [attr.data-pos]="abr(pos)">
                <span class="mas">+</span><span class="lb">{{ abr(pos) }}</span>
              </button>
            }
          </div>
        }
      </div>
      <p class="hint">Toca un hueco para elegir. {{ titulares().length }}/11 titulares.</p>

      <!-- BANQUILLO -->
      <div class="banco">
        <div class="bh">
          <h3>Banquillo</h3>
          <button class="add" (click)="abrirBanca()">+ Añadir</button>
        </div>
        <p class="faint sm">Prioridad ↓ · marca qué líneas cubre cada suplente.</p>
        @for (b of banca(); track b.id; let i = $index) {
          <div class="bfila">
            <span class="prio">{{ i + 1 }}</span>
            <span class="bnm">{{ nombreDe(b.id) }}</span>
            <div class="chips">
              @for (l of lineas; track l) {
                <button class="ch" [class.on]="b.lineas.includes(l)" [class]="abr(l)" (click)="toggleLinea(b, l)">{{ abr(l) }}</button>
              }
            </div>
            <button class="mv" (click)="subir(i)" [disabled]="i===0">▲</button>
            <button class="mv" (click)="bajar(i)" [disabled]="i===banca().length-1">▼</button>
            <button class="rm" (click)="fueraId(b.id)">✕</button>
          </div>
        }
      </div>
    }

    <!-- SELECTOR (bottom sheet) -->
    @if (picker(); as p) {
      <div class="back" (click)="picker.set(null)">
        <div class="sheet rise" (click)="$event.stopPropagation()">
          <div class="sh">
            <span class="st">{{ p.banca ? 'Añadir suplente' : 'Elegir ' + etiquetaPos(p.pos!) + ' · ' + enLinea(p.pos!).length + '/' + cupo(p.pos!) }}</span>
            <button class="x" (click)="picker.set(null)">✕</button>
          </div>
          <div class="cands">
            @for (j of candidatos(); track j.activo_id) {
              <button class="cand" [class.sel]="seleccionado(j)" (click)="elegir(j)">
                <span class="cm num">{{ media(j) }}</span>
                <span class="cav" [class]="abr(j.posicion)">
                  @if (j.foto) { <img [src]="j.foto" alt="" loading="lazy" (error)="j.foto=null" /> }
                  @else if (j.escudo) { <img class="esc" [src]="j.escudo" alt="" /> }
                  @else { {{ j.nombre.charAt(0) }} }
                </span>
                <span class="cn">{{ j.nombre }}</span>
                <span class="ck">{{ seleccionado(j) ? '✓' : '' }}</span>
              </button>
            }
            @if (candidatos().length === 0) { <p class="muted sm" style="padding:14px">No hay jugadores disponibles para esta línea.</p> }
          </div>
          <button class="listo" (click)="picker.set(null)">Listo</button>
        </div>
      </div>
    }
  `,
  styles: [`
    .comps { display: flex; gap: 8px; margin-bottom: 12px; overflow-x: auto; padding-bottom: 4px; }
    .comp { flex: 0 0 auto; padding: 8px 14px; border-radius: 11px; border: 1px solid var(--border); background: var(--surface);
      color: var(--muted); cursor: pointer; font-weight: 800; font-size: .82rem; white-space: nowrap; }
    .comp.on { background: rgba(0,230,118,.1); color: var(--primary); border-color: var(--primary); }
    .jchips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 12px; }
    .jchip { flex: 0 0 auto; min-width: 42px; height: 36px; border: 1px solid var(--border); background: var(--surface);
      color: var(--muted); border-radius: 10px; cursor: pointer; font-weight: 800; }
    .jchip.on { background: var(--primary); color: var(--primary-ink); border-color: var(--primary); }
    .barra { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
    .barra select { font-weight: 800; }
    .cont { font-weight: 900; font-size: 1.2rem; color: var(--bad); } .cont.ok { color: var(--primary); }
    .cont small { color: var(--muted); font-size: .9rem; } .barra .btn { margin-left: auto; }
    .atajos { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .atajo { background: var(--surface-2); border: 1px solid var(--border); color: var(--ink); border-radius: 10px;
      padding: 8px 13px; cursor: pointer; font-weight: 700; font-size: .8rem; }
    .aviso { background: rgba(0,230,118,.08); border: 1px solid rgba(0,230,118,.22); color: var(--primary); padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; }
    .hint { text-align: center; color: var(--muted); font-size: .76rem; margin: 6px 0 16px; }

    .pitch { position: relative; border-radius: 16px; padding: 16px 8px;
      background: repeating-linear-gradient(0deg, #0f3d24 0 38px, #114327 38px 76px);
      border: 1px solid rgba(255,255,255,.12); display: flex; flex-direction: column; gap: 12px;
      min-height: 380px; box-shadow: inset 0 0 60px rgba(0,0,0,.4); overflow: hidden; }
    .pitch::before { content:''; position:absolute; left:50%; top:50%; width:84px; height:84px;
      border:2px solid rgba(255,255,255,.16); border-radius:50%; transform:translate(-50%,-50%); }
    .fila { position: relative; z-index: 1; display: flex; justify-content: space-evenly; gap: 6px; flex-wrap: wrap; }
    .slot { background: none; border: none; cursor: pointer; width: 60px; padding: 0; }
    .slot.vacio { height: 86px; border: 2px dashed rgba(255,255,255,.28); border-radius: 12px; display: flex;
      flex-direction: column; align-items: center; justify-content: center; gap: 2px; background: rgba(255,255,255,.05); }
    .slot.vacio .mas { font-size: 1.4rem; color: rgba(255,255,255,.6); line-height: 1; }
    .slot.vacio .lb { font-size: .56rem; font-weight: 800; color: rgba(255,255,255,.5); }

    .banco { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 14px; margin-bottom: 18px; }
    .bh { display: flex; align-items: center; justify-content: space-between; }
    .banco h3 { margin: 0; font-size: 1rem; }
    .add { background: rgba(0,230,118,.1); border: 1px solid var(--primary); color: var(--primary); border-radius: 9px;
      padding: 6px 12px; cursor: pointer; font-weight: 800; font-size: .78rem; }
    .sm { font-size: .8rem; } .faint { color: var(--faint); }
    .bfila { display: flex; align-items: center; gap: 8px; padding: 9px 4px; border-bottom: 1px solid var(--border); }
    .bfila:last-child { border-bottom: none; }
    .prio { width: 22px; height: 22px; border-radius: 50%; background: var(--surface-2); border: 1px solid var(--border);
      display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: .72rem; flex: 0 0 auto; }
    .bnm { flex: 1; font-weight: 700; font-size: .85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .chips { display: flex; gap: 4px; }
    .ch { width: 32px; padding: 5px 0; border-radius: 7px; border: 1px solid var(--border); background: var(--surface-2);
      color: var(--muted); font-weight: 800; font-size: .62rem; cursor: pointer; }
    .ch.on.DEF { background: var(--pos-DEF); color: #07120d; border-color: var(--pos-DEF); }
    .ch.on.MED { background: var(--pos-MED); color: #07120d; border-color: var(--pos-MED); }
    .ch.on.DEL { background: var(--pos-DEL); color: #07120d; border-color: var(--pos-DEL); }
    .mv { width: 26px; padding: 5px 0; border: 1px solid var(--border); background: var(--surface-2); color: var(--muted); border-radius: 7px; cursor: pointer; font-size: .7rem; }
    .mv:disabled { opacity: .3; }
    .rm { width: 26px; padding: 5px 0; border: 1px solid var(--border); background: var(--surface-2); color: var(--bad); border-radius: 7px; cursor: pointer; }

    /* bottom sheet selector */
    .back { position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,.66); backdrop-filter: blur(4px);
      display: flex; align-items: flex-end; justify-content: center; }
    .sheet { width: 100%; max-width: 520px; max-height: 82vh; display: flex; flex-direction: column;
      background: linear-gradient(180deg, var(--surface), var(--bg-elev)); border: 1px solid var(--border);
      border-top: 3px solid var(--primary); border-radius: 22px 22px 0 0; padding: 16px; }
    @media (min-width: 560px) { .back { align-items: center; } .sheet { border-radius: 22px; } }
    .sh { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .st { font-weight: 800; font-size: .95rem; }
    .x { background: var(--surface-2); border: 1px solid var(--border); color: var(--muted); width: 30px; height: 30px; border-radius: 8px; cursor: pointer; }
    .cands { overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
    .cand { display: grid; grid-template-columns: 32px 40px 1fr 22px; align-items: center; gap: 10px; padding: 8px 10px;
      background: var(--surface-2); border: 1px solid var(--border); border-radius: 11px; cursor: pointer; text-align: left; }
    .cand.sel { border-color: var(--primary); background: rgba(0,230,118,.08); }
    .cm { font-weight: 900; color: var(--primary); text-align: center; }
    .cav { width: 40px; height: 40px; border-radius: 11px; display: flex; align-items: center; justify-content: center;
      font-weight: 800; color: #07120d; overflow: hidden; }
    .cav img { width: 100%; height: 100%; object-fit: cover; } .cav img.esc { object-fit: contain; padding: 5px; }
    .cav.POR { background: var(--pos-POR); } .cav.DEF { background: var(--pos-DEF); }
    .cav.MED { background: var(--pos-MED); } .cav.DEL { background: var(--pos-DEL); }
    .cn { font-weight: 700; font-size: .88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ck { color: var(--primary); font-weight: 900; text-align: center; }
    .listo { margin-top: 12px; background: var(--primary); color: var(--primary-ink); border: none; border-radius: 12px;
      padding: 12px; cursor: pointer; font-weight: 800; }
    .muted { color: var(--muted); }
  `],
})
export class AlineacionComponent implements OnInit {
  formaciones = FORMACIONES;
  lineas = LINEAS;
  formacion = signal('4-4-2');
  equipo = signal<Equipo | null>(null);
  competiciones = signal<Competicion[]>([]);
  competicionId = signal('');
  jornadasComp = signal<JornadaFalm[]>([]);
  jornada = signal<JornadaFalm | null>(null);
  plantilla = signal<ItemPlantilla[]>([]);
  puntos = signal<Record<string, number>>({});
  titulares = signal<string[]>([]);
  banca = signal<{ id: string; lineas: string[] }[]>([]);
  picker = signal<{ pos?: string; banca?: boolean } | null>(null);
  cargando = signal(true);
  guardando = signal(false);
  aviso = signal('');

  compTipo = computed(() => this.competiciones().find((c) => c.id === this.competicionId())?.tipo ?? 'LIGA');
  esLiga = computed(() => this.compTipo() === 'LIGA');

  /** Cupos por línea según la formación (POR siempre 1). */
  cupos = computed(() => {
    const p = this.formacion().split('-').map(Number);
    return { PORTERO: 1, DEFENSA: p[0] || 0, MEDIO: p[1] || 0, DELANTERO: p[2] || 0 } as Record<string, number>;
  });

  candidatos = computed(() => {
    const p = this.picker();
    if (!p) return [] as ItemPlantilla[];
    if (p.banca) {
      const enBanca = new Set(this.banca().map((b) => b.id));
      return this.plantilla().filter((j) => j.posicion !== 'PORTERO' && !this.esTitular(j.activo_id) && !enBanca.has(j.activo_id));
    }
    return this.plantilla().filter((j) => j.posicion === p.pos);
  });

  constructor(private falm: FalmService) {}

  icono(t: string) { return t === 'CHAMPIONS' ? '🌟' : t === 'CLAUSURA' ? '🔚' : '🏆'; }
  etiqueta(t: string) { return t === 'CHAMPIONS' ? 'Champions' : t === 'CLAUSURA' ? 'Clausura' : 'Liga'; }
  etiquetaPos(p: string) { return ETI[p] ?? p; }
  abr(p: string) { return ABR[p] ?? p; }
  media(j: ItemPlantilla) { return this.puntos()[j.activo_id] ?? 0; }
  nombreDe(id: string) { return this.plantilla().find((p) => p.activo_id === id)?.nombre ?? '?'; }
  esTitular(id: string) { return this.titulares().includes(id); }
  cupo(pos: string) { return this.cupos()[pos] ?? 0; }

  enLinea(pos: string): ItemPlantilla[] {
    const set = new Set(this.titulares());
    return this.plantilla().filter((j) => set.has(j.activo_id) && j.posicion === pos);
  }
  huecos(pos: string): number[] {
    const n = Math.max(0, this.cupo(pos) - this.enLinea(pos).length);
    return Array.from({ length: n }, (_, i) => i);
  }

  abrirLinea(pos: string) { this.picker.set({ pos }); }
  abrirBanca() { this.picker.set({ banca: true }); }

  /** Cambia formación y recorta cada línea a su nuevo cupo (quedan los de mayor media). */
  cambiarFormacion(f: string) {
    this.formacion.set(f);
    const p = f.split('-').map(Number);
    const cupos: Record<string, number> = { PORTERO: 1, DEFENSA: p[0] || 0, MEDIO: p[1] || 0, DELANTERO: p[2] || 0 };
    const set = new Set(this.titulares());
    const keep: string[] = [];
    for (const pos of ['PORTERO', 'DEFENSA', 'MEDIO', 'DELANTERO']) {
      this.plantilla()
        .filter((j) => set.has(j.activo_id) && j.posicion === pos)
        .sort((a, b) => this.media(b) - this.media(a))
        .slice(0, cupos[pos])
        .forEach((j) => keep.push(j.activo_id));
    }
    this.titulares.set(keep);
  }

  seleccionado(j: ItemPlantilla) {
    const p = this.picker();
    return p?.banca ? false : this.esTitular(j.activo_id);
  }
  elegir(j: ItemPlantilla) {
    const p = this.picker();
    if (!p) return;
    if (p.banca) {
      const natural = LINEAS.includes(j.posicion) ? [j.posicion] : ['MEDIO'];
      this.banca.update((b) => [...b, { id: j.activo_id, lineas: natural }]);
      this.picker.set(null);
      return;
    }
    // titular: toggle (sin pasar del cupo de la línea)
    if (this.esTitular(j.activo_id)) {
      this.titulares.update((t) => t.filter((x) => x !== j.activo_id));
      this.aviso.set('');
    } else if (this.enLinea(j.posicion).length >= this.cupo(j.posicion)) {
      this.aviso.set(`Línea ${this.abr(j.posicion)} completa (${this.cupo(j.posicion)}). Quita uno o cambia la formación.`);
    } else {
      this.banca.update((b) => b.filter((x) => x.id !== j.activo_id));
      this.titulares.update((t) => [...t, j.activo_id]);
      this.aviso.set('');
    }
  }

  fueraId(id: string) {
    this.titulares.update((t) => t.filter((x) => x !== id));
    this.banca.update((b) => b.filter((x) => x.id !== id));
  }
  toggleLinea(b: { id: string; lineas: string[] }, l: string) {
    const next = b.lineas.includes(l) ? b.lineas.filter((x) => x !== l) : [...b.lineas, l];
    if (next.length === 0) return;
    this.banca.update((arr) => arr.map((x) => x.id === b.id ? { ...x, lineas: next } : x));
  }
  subir(i: number) { if (i > 0) this.swap(i, i - 1); }
  bajar(i: number) { if (i < this.banca().length - 1) this.swap(i, i + 1); }
  private swap(a: number, c: number) { this.banca.update((arr) => { const n = [...arr]; [n[a], n[c]] = [n[c], n[a]]; return n; }); }

  async ngOnInit() {
    try {
      const eq = await this.falm.miEquipo();
      this.equipo.set(eq);
      if (!eq) { this.cargando.set(false); return; }
      const [comps, plant, pts] = await Promise.all([
        this.falm.competiciones(), this.falm.miPlantilla(eq.id), this.falm.puntosEquipo(eq.id),
      ]);
      this.plantilla.set(plant); this.puntos.set(pts);
      const orden = { LIGA: 0, CHAMPIONS: 1, CLAUSURA: 2 } as Record<string, number>;
      comps.sort((a, b) => (orden[a.tipo] ?? 9) - (orden[b.tipo] ?? 9));
      this.competiciones.set(comps);
      const liga = comps.find((c) => c.tipo === 'LIGA') ?? comps[0];
      if (liga) await this.seleccionarCompeticion(liga.id);
    } catch (e: any) { this.aviso.set(e?.message ?? 'Error'); }
    finally { this.cargando.set(false); }
  }

  async seleccionarCompeticion(compId: string) {
    this.competicionId.set(compId);
    const js = await this.falm.jornadas(compId);
    this.jornadasComp.set(js);
    if (js.length) await this.seleccionarJornada(js[js.length - 1]);
    else { this.jornada.set(null); this.limpiar(); }
  }
  async seleccionarJornada(j: JornadaFalm) {
    this.jornada.set(j); this.aviso.set('');
    const eq = this.equipo(); if (!eq) return;
    const ali = await this.falm.getAlineacion(eq.id, j.id);
    if (ali) { this.aplicar(ali); return; }
    const prev = await this.falm.ultimaAlineacion(eq.id, this.competicionId(), j.numero);
    if (prev) { this.aplicar(prev); this.aviso.set('↩︎ Heredada de tu última jornada de ' + this.etiqueta(this.compTipo()) + '.'); }
    else this.limpiar();
  }
  private limpiar() { this.titulares.set([]); this.banca.set([]); this.formacion.set('4-4-2'); }
  private aplicar(ali: AlineacionGuardada) {
    const enP = new Set(this.plantilla().map((p) => p.activo_id));
    this.formacion.set(ali.formacion || '4-4-2');
    this.titulares.set(ali.jugadores.filter((j) => j.rol === 'TITULAR' && enP.has(j.activo_id)).map((j) => j.activo_id));
    this.banca.set(ali.jugadores.filter((j) => j.rol === 'SUPLENTE' && enP.has(j.activo_id))
      .sort((a, b) => a.orden - b.orden).map((j) => ({ id: j.activo_id, lineas: j.lineas?.length ? j.lineas : ['MEDIO'] })));
  }

  async repetirUltima() {
    const eq = this.equipo(); const j = this.jornada(); if (!eq || !j) return;
    const prev = await this.falm.ultimaAlineacion(eq.id, this.competicionId(), j.numero);
    if (prev) { this.aplicar(prev); this.aviso.set('↩︎ Cargada tu última. Revisa y guarda.'); }
    else this.aviso.set('No hay alineación anterior en esta competición.');
  }
  async copiarDeLiga() {
    const eq = this.equipo(); const j = this.jornada(); if (!eq || !j) return;
    const liga = await this.falm.copiarDesdeLiga(eq.id, j.fecha);
    if (liga) { this.aplicar(liga); this.aviso.set('📋 Copiada de Liga. Revisa y guarda.'); }
    else this.aviso.set('No hay alineación de Liga de ese fin de semana.');
  }

  async guardar() {
    this.aviso.set('');
    const eq = this.equipo(); const jor = this.jornada(); if (!eq || !jor) return;
    const jugadores: Alineado[] = [
      ...this.titulares().map((id) => ({ activo_id: id, rol: 'TITULAR' as const, lineas: [], orden: 0 })),
      ...this.banca().map((b, i) => ({ activo_id: b.id, rol: 'SUPLENTE' as const, lineas: b.lineas, orden: i + 1 })),
    ];
    this.guardando.set(true);
    try {
      await this.falm.guardarAlineacion(eq.id, jor.id, this.formacion(), jugadores);
      try { await this.falm.recalcular(); this.aviso.set('✅ Alineación guardada y clasificación recalculada.'); }
      catch { this.aviso.set('✅ Alineación guardada.'); }
    } catch (e: any) { this.aviso.set(e?.message ?? 'Error al guardar'); }
    finally { this.guardando.set(false); }
  }
}
