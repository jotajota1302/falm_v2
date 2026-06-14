import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Alineado, AlineacionGuardada, Competicion, Equipo, FalmService, FORMACIONES, ItemPlantilla, JornadaFalm,
} from '../../core/falm.service';
import { FutCardComponent } from '../../shared/fut-card.component';

const ORDEN: Record<string, number> = { PORTERO: 0, DEFENSA: 1, MEDIO: 2, DELANTERO: 3 };
const ETI: Record<string, string> = { PORTERO: 'Porteros', DEFENSA: 'Defensas', MEDIO: 'Medios', DELANTERO: 'Delanteros' };
const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };
const LINEAS = ['DEFENSA', 'MEDIO', 'DELANTERO'];

/** Once: campo con cartas FIFA + banquillo de suplentes multi-línea. */
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
        <select [ngModel]="formacion()" (ngModelChange)="formacion.set($event)">
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

      <!-- CAMPO -->
      <div class="pitch">
        @for (linea of lineasCampo(); track linea.pos) {
          <div class="fila">
            @for (j of linea.jug; track j.activo_id) {
              <button class="slot" (click)="fuera(j)" title="Quitar del once">
                <falm-fut-card [nombre]="j.nombre" [posicion]="j.posicion" [foto]="j.foto ?? null"
                  [escudo]="j.escudo ?? null" [media]="media(j)" />
              </button>
            }
          </div>
        }
        @if (titulares().length === 0) { <p class="vacio">Toca jugadores de tu plantilla para poner el once.</p> }
      </div>

      <!-- BANQUILLO -->
      <div class="banco">
        <h3>Banquillo <small class="faint">prioridad ↓ · marca qué líneas cubre cada uno</small></h3>
        @if (banca().length === 0) { <p class="muted sm">Sin suplentes. Añade desde tu plantilla con «Banca».</p> }
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

      <!-- PLANTILLA -->
      <h3 class="ph">Plantilla</h3>
      @for (g of grupos(); track g.pos) {
        <div class="lh"><span class="pos" [class]="abr(g.pos)">{{ abr(g.pos) }}</span> {{ g.eti }}</div>
        <div class="lista">
          @for (j of g.items; track j.activo_id) {
            <div class="pj" [class.tit]="esTitular(j.activo_id)" [class.ban]="enBanca(j.activo_id)">
              <span class="pm num">{{ media(j) }}</span>
              <span class="pn">{{ j.nombre }}</span>
              <span class="acc">
                <button [class.on]="esTitular(j.activo_id)" (click)="aTitular(j)">XI</button>
                @if (j.posicion !== 'PORTERO') { <button [class.on]="enBanca(j.activo_id)" (click)="aBanca(j)">Banca</button> }
                <button [class.on]="!esTitular(j.activo_id) && !enBanca(j.activo_id)" (click)="fuera(j)">—</button>
              </span>
            </div>
          }
        </div>
      }
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

    .pitch { position: relative; border-radius: 16px; padding: 14px 8px;
      background: repeating-linear-gradient(0deg, #0f3d24 0 38px, #114327 38px 76px);
      border: 1px solid rgba(255,255,255,.12); display: flex; flex-direction: column-reverse; gap: 10px;
      min-height: 360px; box-shadow: inset 0 0 60px rgba(0,0,0,.4); overflow: hidden; margin-bottom: 18px; }
    .pitch::before { content:''; position:absolute; left:50%; top:50%; width:80px; height:80px;
      border:2px solid rgba(255,255,255,.16); border-radius:50%; transform:translate(-50%,-50%); }
    .fila { position: relative; z-index: 1; display: flex; justify-content: space-evenly; gap: 6px; flex-wrap: wrap; }
    .slot { background: none; border: none; cursor: pointer; width: 58px; padding: 0; }
    .vacio { position: relative; z-index: 1; text-align: center; color: rgba(255,255,255,.6); font-size: .85rem; margin: auto; }

    .banco { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 14px; margin-bottom: 18px; }
    .banco h3 { margin: 0 0 10px; font-size: 1rem; } .banco h3 small { font-weight: 600; font-size: .68rem; margin-left: 6px; }
    .sm { font-size: .82rem; }
    .bfila { display: flex; align-items: center; gap: 8px; padding: 8px 6px; border-bottom: 1px solid var(--border); }
    .bfila:last-child { border-bottom: none; }
    .prio { width: 22px; height: 22px; border-radius: 50%; background: var(--surface-2); border: 1px solid var(--border);
      display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: .72rem; flex: 0 0 auto; }
    .bnm { flex: 1; font-weight: 700; font-size: .85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .chips { display: flex; gap: 4px; }
    .ch { width: 34px; padding: 4px 0; border-radius: 7px; border: 1px solid var(--border); background: var(--surface-2);
      color: var(--muted); font-weight: 800; font-size: .64rem; cursor: pointer; }
    .ch.on.DEF { background: var(--pos-DEF); color: #07120d; border-color: var(--pos-DEF); }
    .ch.on.MED { background: var(--pos-MED); color: #07120d; border-color: var(--pos-MED); }
    .ch.on.DEL { background: var(--pos-DEL); color: #07120d; border-color: var(--pos-DEL); }
    .mv { width: 26px; padding: 4px 0; border: 1px solid var(--border); background: var(--surface-2); color: var(--muted);
      border-radius: 7px; cursor: pointer; font-size: .7rem; }
    .mv:disabled { opacity: .3; }
    .rm { width: 26px; padding: 4px 0; border: 1px solid var(--border); background: var(--surface-2); color: var(--bad); border-radius: 7px; cursor: pointer; }

    .ph { margin: 16px 0 10px; }
    .lh { display: flex; align-items: center; gap: 8px; margin: 14px 0 6px; font-weight: 700; color: var(--muted); font-size: .85rem; }
    .pos { padding: 2px 7px; border-radius: 6px; font-size: .62rem; font-weight: 800; color: #07120d; }
    .pos.POR { background: var(--pos-POR); } .pos.DEF { background: var(--pos-DEF); }
    .pos.MED { background: var(--pos-MED); } .pos.DEL { background: var(--pos-DEL); }
    .lista { display: flex; flex-direction: column; gap: 6px; }
    .pj { display: flex; align-items: center; gap: 11px; padding: 8px 12px; background: var(--surface);
      border: 1px solid var(--border); border-radius: 11px; }
    .pj.tit { border-color: rgba(0,230,118,.4); } .pj.ban { border-color: rgba(255,194,75,.4); }
    .pm { width: 30px; text-align: center; font-weight: 900; color: var(--primary); }
    .pn { flex: 1; font-weight: 600; font-size: .88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .acc { display: flex; gap: 5px; }
    .acc button { padding: 6px 9px; border: 1px solid var(--border); background: var(--surface-2); color: var(--muted);
      border-radius: 8px; cursor: pointer; font-size: .74rem; font-weight: 800; }
    .acc button.on { background: var(--primary); color: var(--primary-ink); border-color: var(--primary); }
    .muted { color: var(--muted); } .faint { color: var(--faint); }
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
  cargando = signal(true);
  guardando = signal(false);
  aviso = signal('');

  compTipo = computed(() => this.competiciones().find((c) => c.id === this.competicionId())?.tipo ?? 'LIGA');
  esLiga = computed(() => this.compTipo() === 'LIGA');

  grupos = computed(() => {
    const by: Record<string, ItemPlantilla[]> = {};
    for (const it of this.plantilla()) (by[it.posicion] ??= []).push(it);
    return Object.keys(by).sort((a, b) => ORDEN[a] - ORDEN[b]).map((pos) => ({ pos, eti: ETI[pos] ?? pos, items: by[pos] }));
  });

  lineasCampo = computed(() => {
    const set = new Set(this.titulares());
    const tit = this.plantilla().filter((j) => set.has(j.activo_id));
    return ['PORTERO', 'DEFENSA', 'MEDIO', 'DELANTERO'].map((pos) => ({ pos, jug: tit.filter((j) => j.posicion === pos) }));
  });

  constructor(private falm: FalmService) {}

  icono(t: string) { return t === 'CHAMPIONS' ? '🌟' : t === 'CLAUSURA' ? '🔚' : '🏆'; }
  etiqueta(t: string) { return t === 'CHAMPIONS' ? 'Champions' : t === 'CLAUSURA' ? 'Clausura' : 'Liga'; }
  abr(p: string) { return ABR[p] ?? p; }
  media(j: ItemPlantilla) { return this.puntos()[j.activo_id] ?? 0; }
  nombreDe(id: string) { return this.plantilla().find((p) => p.activo_id === id)?.nombre ?? '?'; }
  esTitular(id: string) { return this.titulares().includes(id); }
  enBanca(id: string) { return this.banca().some((b) => b.id === id); }

  aTitular(j: ItemPlantilla) {
    this.banca.update((b) => b.filter((x) => x.id !== j.activo_id));
    this.titulares.update((t) => t.includes(j.activo_id) ? t : [...t, j.activo_id]);
  }
  aBanca(j: ItemPlantilla) {
    this.titulares.update((t) => t.filter((x) => x !== j.activo_id));
    if (!this.enBanca(j.activo_id)) {
      const natural = LINEAS.includes(j.posicion) ? [j.posicion] : ['MEDIO'];
      this.banca.update((b) => [...b, { id: j.activo_id, lineas: natural }]);
    }
  }
  fuera(j: ItemPlantilla) { this.fueraId(j.activo_id); }
  fueraId(id: string) {
    this.titulares.update((t) => t.filter((x) => x !== id));
    this.banca.update((b) => b.filter((x) => x.id !== id));
  }
  toggleLinea(b: { id: string; lineas: string[] }, l: string) {
    const has = b.lineas.includes(l);
    const next = has ? b.lineas.filter((x) => x !== l) : [...b.lineas, l];
    if (next.length === 0) return; // al menos una línea
    this.banca.update((arr) => arr.map((x) => x.id === b.id ? { ...x, lineas: next } : x));
  }
  subir(i: number) { if (i > 0) this.swap(i, i - 1); }
  bajar(i: number) { if (i < this.banca().length - 1) this.swap(i, i + 1); }
  private swap(a: number, c: number) {
    this.banca.update((arr) => { const n = [...arr]; [n[a], n[c]] = [n[c], n[a]]; return n; });
  }

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
    const enPlantilla = new Set(this.plantilla().map((p) => p.activo_id));
    this.formacion.set(ali.formacion || '4-4-2');
    this.titulares.set(ali.jugadores.filter((j) => j.rol === 'TITULAR' && enPlantilla.has(j.activo_id)).map((j) => j.activo_id));
    this.banca.set(ali.jugadores.filter((j) => j.rol === 'SUPLENTE' && enPlantilla.has(j.activo_id))
      .sort((a, b) => a.orden - b.orden)
      .map((j) => ({ id: j.activo_id, lineas: j.lineas?.length ? j.lineas : ['MEDIO'] })));
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
