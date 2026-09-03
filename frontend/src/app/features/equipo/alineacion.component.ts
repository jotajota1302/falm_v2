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
              {{ etiqueta(c.tipo) }}
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

      @if (jornada(); as j) {
        <div class="jhead">
          <span class="je">Editando</span>
          <strong>Jornada {{ j.numero }}</strong>
          @if (j.fecha) { <span class="jf">· cierra {{ fechaCorta(j.fecha) }}</span> }
        </div>
      }

      <header class="phead">
        <div class="ptit">
          <h1>Manda tu alineación</h1>
          <p class="sub">Toca un hueco del campo y elige jugador. Once titulares, más suplentes con la cobertura por línea que quieras.</p>
        </div>
        <div class="acciones">
          <div class="formas">
            @for (f of formaciones; track f) {
              <button class="forma" [class.on]="f === formacion()" (click)="cambiarFormacion(f)">{{ f }}</button>
            }
          </div>
          <button class="btn-sec" (click)="repetirUltima()">↩ Repetir última</button>
          <button class="btn" (click)="guardar()" [disabled]="guardando()">{{ guardando() ? '…' : 'Enviar alineación' }}</button>
        </div>
      </header>

      @if (!esLiga()) {
        <div class="atajos">
          <button class="atajo" (click)="copiarDeLiga()">Copiar de Liga</button>
        </div>
      }
      @if (aviso()) { <p class="aviso">{{ aviso() }}</p> }

      <!-- CAMPO: huecos por formación -->
      <div class="kpis">
        <div class="kpi">
          <span class="lb">Titulares</span>
          <span class="v num" [class.ok]="titulares().length === 11" [class.ko]="titulares().length !== 11">{{ titulares().length }}/11</span>
        </div>
        <div class="kpi">
          <span class="lb">Media prevista</span>
          <span class="v num acc">{{ mediaPrevista() }}</span>
        </div>
        <span class="form-actual num">{{ formacion() }}</span>
      </div>
      <div class="pitch">
        @for (pos of ['DELANTERO','MEDIO','DEFENSA','PORTERO']; track pos) {
          <div class="fila" [attr.data-linea]="abr(pos)">
            <span class="banda">{{ etiquetaPos(pos) }}s</span>
            @for (j of enLinea(pos); track j.activo_id) {
              <button class="slot" (click)="abrirLinea(pos, j.activo_id)">
                <falm-fut-card [nombre]="j.nombre" [posicion]="j.posicion" [foto]="j.foto ?? null"
                  [escudo]="j.escudo ?? null" [media]="media(j)" [campo]="true" />
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
            <span class="st">{{ tituloPicker(p) }}</span>
            @if (p.reemplazar) { <button class="quitar" (click)="quitarReemplazo()">Quitar</button> }
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
    .comp { flex: 0 0 auto; padding: 7px 16px; border-radius: var(--pill); border: 1px solid var(--line);
      background: var(--surface); color: var(--text2); cursor: pointer; font-family: var(--fb);
      font-weight: 600; font-size: 12.5px; white-space: nowrap; }
    .comp.on { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
    .jchips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 12px; }
    .jchip { flex: 0 0 auto; min-width: 44px; padding: 8px 10px; border: 1px solid var(--line); background: var(--surface);
      color: var(--text2); border-radius: 10px; cursor: pointer; font-family: var(--fm); font-weight: 600; font-size: 12px; }
    .jchip.on { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
    .jhead { display: flex; align-items: baseline; gap: 7px; margin: 4px 0 12px; }
    .jhead .je { font-size: 9px; text-transform: uppercase; letter-spacing: .16em; color: var(--text2); font-weight: 700; }
    .jhead strong { font-family: var(--fh); font-size: 17px; font-weight: 600; text-transform: uppercase; color: var(--accent); }
    .jhead .jf { font-size: 12px; color: var(--text2); text-transform: capitalize; }
    /* cabecera de pantalla */
    .phead { display: flex; align-items: flex-start; justify-content: space-between;
      gap: 18px; flex-wrap: wrap; margin-bottom: 16px; }
    .ptit .sub { margin: 5px 0 0; font-size: 13.5px; color: var(--text2); max-width: 62ch; }
    .acciones { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
    .formas { display: flex; gap: 3px; padding: 3px; background: var(--surface2);
      border: 1px solid var(--line); border-radius: 11px; }
    .forma { font-family: var(--fm); font-size: 12.5px; font-weight: 700; padding: 8px 12px;
      border: none; border-radius: 8px; background: transparent; color: var(--text2); cursor: pointer; }
    .forma.on { background: var(--accent); color: var(--accent-ink); }

    .atajos { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .atajo { background: var(--surface); border: 1px solid var(--line); color: var(--text); border-radius: 11px;
      padding: 10px 15px; cursor: pointer; font-weight: 600; font-size: 13px; }
    .atajo:hover { border-color: var(--accent); }
    .aviso { background: var(--surface); border: 1px solid var(--accent); color: var(--accent);
      padding: 10px 15px; border-radius: 11px; margin-bottom: 12px; font-size: 13px; font-weight: 600; }
    .hint { text-align: center; color: var(--text2); font-size: 11.5px; margin: 8px 0 18px; }

    /* KPIs del campo */
    .kpis { display: flex; align-items: flex-end; gap: 26px; padding: 0 4px 11px; }
    .kpi { display: flex; flex-direction: column; gap: 2px; }
    .kpi .lb { font-size: 9px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--text2); }
    .kpi .v { font-size: 17px; font-weight: 700; }
    .kpi .v.ok { color: var(--good); }
    .kpi .v.ko { color: var(--bad); }
    .kpi .v.acc { color: var(--accent); }
    .form-actual { margin-left: auto; font-size: 12px; color: var(--text2); }

    /* campo: hierba segada sobre papel, no estadio nocturno */
    .pitch { position: relative; background: var(--pitch); border: 1px solid var(--line);
      border-radius: 14px; padding: 18px 12px; display: flex; flex-direction: column; gap: 10px;
      min-height: 430px; justify-content: space-between; overflow: hidden; }
    .fila { position: relative; display: flex; justify-content: center; align-items: center;
      gap: 10px; flex-wrap: wrap; padding: 6px 4px 6px 22px; border-radius: 12px; }
    .fila[data-linea=POR] { background: color-mix(in oklab, var(--por) 12%, transparent); }
    .fila[data-linea=DEF] { background: color-mix(in oklab, var(--def) 12%, transparent); }
    .fila[data-linea=MED] { background: color-mix(in oklab, var(--med) 12%, transparent); }
    .fila[data-linea=DEL] { background: color-mix(in oklab, var(--del) 12%, transparent); }
    .banda { position: absolute; left: 2px; top: 0; bottom: 0; width: 14px; display: flex; align-items: center; justify-content: center;
      writing-mode: vertical-rl; transform: rotate(180deg); font-size: 9px; font-weight: 700; letter-spacing: .18em;
      text-transform: uppercase; pointer-events: none; }
    .fila[data-linea=POR] .banda { color: var(--por); }
    .fila[data-linea=DEF] .banda { color: var(--def); }
    .fila[data-linea=MED] .banda { color: var(--med); }
    .fila[data-linea=DEL] .banda { color: var(--del); }
    .slot { background: none; border: none; cursor: pointer; width: 88px; padding: 0; }
    .slot.vacio { min-height: 104px; border: 1.5px dashed var(--line); border-radius: 13px; display: flex;
      flex-direction: column; align-items: center; justify-content: center; gap: 6px;
      background: color-mix(in oklab, var(--surface) 55%, transparent); }
    .slot.vacio .mas { display: flex; align-items: center; justify-content: center;
      width: 34px; height: 34px; border-radius: 50%; font-size: 17px; line-height: 1; color: var(--text2); }
    .slot.vacio[data-pos=POR] .mas { border: 1.5px dashed var(--por); color: var(--por); }
    .slot.vacio[data-pos=DEF] .mas { border: 1.5px dashed var(--def); color: var(--def); }
    .slot.vacio[data-pos=MED] .mas { border: 1.5px dashed var(--med); color: var(--med); }
    .slot.vacio[data-pos=DEL] .mas { border: 1.5px dashed var(--del); color: var(--del); }
    .slot.vacio .lb { font-size: 9.5px; font-weight: 700; letter-spacing: .14em; color: var(--text2); }

    .banco { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 16px; margin-bottom: 18px; }
    .bh { display: flex; align-items: center; justify-content: space-between; }
    .add { background: var(--surface); border: 1px solid var(--line); color: var(--text); border-radius: 11px;
      padding: 8px 13px; cursor: pointer; font-weight: 600; font-size: 12.5px; }
    .add:hover { border-color: var(--accent); }
    .sm { font-size: 11.5px; } .faint { color: var(--text2); }
    .bfila { display: flex; align-items: center; gap: 8px; padding: 8px 10px; margin-top: 6px;
      background: var(--surface2); border: 1px solid var(--line); border-radius: 11px; }
    .prio { width: 22px; height: 22px; border-radius: 50%; background: var(--surface); border: 1px solid var(--line);
      display: flex; align-items: center; justify-content: center; font-family: var(--fm);
      font-weight: 700; font-size: 11px; flex: 0 0 auto; }
    .bnm { flex: 1; font-weight: 700; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .chips { display: flex; gap: 4px; }
    .ch { width: 28px; padding: 5px 0; border-radius: 6px; border: 1px solid var(--line); background: transparent;
      color: var(--text2); font-weight: 700; font-size: 9px; cursor: pointer; }
    .ch.on.DEF { background: var(--def); color: var(--accent-ink); border-color: var(--def); }
    .ch.on.MED { background: var(--med); color: var(--accent-ink); border-color: var(--med); }
    .ch.on.DEL { background: var(--del); color: var(--accent-ink); border-color: var(--del); }
    .mv { width: 26px; padding: 5px 0; border: 1px solid var(--line); background: var(--surface); color: var(--text2);
      border-radius: 7px; cursor: pointer; font-size: 11px; }
    .mv:disabled { opacity: .3; }
    .rm { width: 26px; padding: 5px 0; border: 1px solid var(--line); background: var(--surface); color: var(--bad);
      border-radius: 7px; cursor: pointer; font-size: 11px; }

    /* bottom sheet selector */
    .back { position: fixed; inset: 0; z-index: 60; background: rgba(22,19,15,.42);
      display: flex; align-items: flex-end; justify-content: center; }
    .sheet { width: 100%; max-width: 520px; max-height: 82vh; display: flex; flex-direction: column;
      background: var(--surface); border: 1px solid var(--line);
      border-top: 3px solid var(--accent); border-radius: 20px 20px 0 0; padding: 16px; }
    @media (min-width: 560px) { .back { align-items: center; } .sheet { border-radius: 22px; } }

    /* En el teléfono el campo se estrecha para que la línea no se parta en dos. */
    @media (max-width: 620px) {
      .pitch { padding: 14px 8px; min-height: 384px; gap: 8px; }
      .fila { gap: 6px; padding: 5px 2px 5px 18px; }
      .banda { width: 12px; font-size: 8px; letter-spacing: .14em; }
      .slot { width: 62px; }
      .slot.vacio { min-height: 76px; }
      .slot.vacio .mas { width: 28px; height: 28px; font-size: 15px; }
      .slot.vacio .lb { font-size: 8.5px; }
      .kpis { gap: 16px; }
      .formas { width: 100%; }
      .forma { flex: 1; padding: 10px 8px; }
      .atajo { flex: 1 1 auto; }
    }
    .sh { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .st { font-family: var(--fh); font-size: 15px; font-weight: 600; text-transform: uppercase; }
    .quitar { background: transparent; border: 1px solid var(--bad); color: var(--bad);
      border-radius: 8px; padding: 6px 12px; cursor: pointer; font-family: var(--fb);
      font-weight: 600; font-size: 12px; margin-left: auto; margin-right: 8px; }
    .x { background: var(--surface2); border: 1px solid var(--line); color: var(--text2);
      width: 30px; height: 30px; border-radius: 8px; cursor: pointer; font-size: 13px; }
    .cands { overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
    .cand { display: grid; grid-template-columns: 32px 40px 1fr 22px; align-items: center; gap: 10px; padding: 8px 10px;
      background: var(--surface); border: 1px solid var(--line); border-radius: 11px; cursor: pointer; text-align: left; }
    .cand:hover { background: var(--surface2); }
    .cand.sel { border-color: var(--accent); background: var(--accent-soft); }
    .cm { font-family: var(--fm); font-weight: 700; color: var(--accent); text-align: center; }
    .cav { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
      font-family: var(--fh); font-size: 16px; color: var(--accent-ink); overflow: hidden; }
    .cav img { width: 100%; height: 100%; object-fit: cover; } .cav img.esc { object-fit: contain; padding: 5px; }
    .cav.POR { background: var(--por); } .cav.DEF { background: var(--def); }
    .cav.MED { background: var(--med); } .cav.DEL { background: var(--del); }
    .cn { font-weight: 700; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ck { color: var(--accent); font-weight: 700; text-align: center; }
    .listo { margin-top: 12px; background: var(--accent); color: var(--accent-ink); border: none; border-radius: 11px;
      padding: 12px; cursor: pointer; font-family: var(--fb); font-weight: 700; font-size: 13.5px; }
    .muted { color: var(--text2); }
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
  picker = signal<{ pos?: string; banca?: boolean; reemplazar?: string } | null>(null);
  cargando = signal(true);
  guardando = signal(false);
  aviso = signal('');

  compTipo = computed(() => this.competiciones().find((c) => c.id === this.competicionId())?.tipo ?? 'LIGA');
  esLiga = computed(() => this.compTipo() === 'LIGA');
  /** Suma de medias del once: el dato que se mira antes de enviar. */
  mediaPrevista = computed(() => {
    const p = this.puntos();
    const t = this.titulares().reduce((a, id) => a + (p[id] ?? 0), 0);
    return Math.round(t * 10) / 10;
  });

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
    // sustituir: candidatos = jugadores de esa línea que NO están ya de titulares
    if (p.reemplazar) {
      return this.plantilla().filter((j) => j.posicion === p.pos && !this.esTitular(j.activo_id));
    }
    return this.plantilla().filter((j) => j.posicion === p.pos);
  });

  constructor(private falm: FalmService) {}

  etiqueta(t: string) { return t === 'CHAMPIONS' ? 'Champions' : t === 'CLAUSURA' ? 'Clausura' : 'Liga'; }
  etiquetaPos(p: string) { return ETI[p] ?? p; }
  abr(p: string) { return ABR[p] ?? p; }
  fechaCorta(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) +
      ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }
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

  abrirLinea(pos: string, reemplazar?: string) { this.picker.set({ pos, reemplazar }); }
  abrirBanca() { this.picker.set({ banca: true }); }
  tituloPicker(p: { pos?: string; banca?: boolean; reemplazar?: string }) {
    if (p.banca) return 'Añadir suplente';
    if (p.reemplazar) return 'Cambiar ' + this.nombreDe(p.reemplazar);
    return 'Elegir ' + this.etiquetaPos(p.pos!) + ' · ' + this.enLinea(p.pos!).length + '/' + this.cupo(p.pos!);
  }
  quitarReemplazo() {
    const id = this.picker()?.reemplazar;
    if (id) this.titulares.update((t) => t.filter((x) => x !== id));
    this.picker.set(null);
  }

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
      const natural = LINEAS.includes(j.posicion) ? j.posicion : 'MEDIO';
      if (this.cubren(natural) >= 2) {
        this.aviso.set(`Ya tienes 2 suplentes para ${this.abr(natural)} (máximo por línea).`);
        this.picker.set(null);
        return;
      }
      this.banca.update((b) => [...b, { id: j.activo_id, lineas: [natural] }]);
      this.aviso.set('');
      this.picker.set(null);
      return;
    }
    // sustituir: saca al jugador tocado y mete al elegido (misma línea)
    if (p.reemplazar) {
      const sale = p.reemplazar;
      this.banca.update((b) => b.filter((x) => x.id !== j.activo_id));
      this.titulares.update((t) => [...t.filter((x) => x !== sale && x !== j.activo_id), j.activo_id]);
      this.aviso.set('');
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
  cubren(l: string) { return this.banca().filter((b) => b.lineas.includes(l)).length; }
  toggleLinea(b: { id: string; lineas: string[] }, l: string) {
    const adding = !b.lineas.includes(l);
    if (adding && this.cubren(l) >= 2) {
      this.aviso.set(`Ya hay 2 suplentes cubriendo ${this.abr(l)} (máximo por línea).`);
      return;
    }
    const next = adding ? [...b.lineas, l] : b.lineas.filter((x) => x !== l);
    if (next.length === 0) return;
    this.aviso.set('');
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
    if (js.length) {
      // por defecto, la próxima jornada a jugar (primera con fecha futura); si todas pasaron, la última
      const ahora = Date.now();
      const proxima = js.find((j) => j.fecha && new Date(j.fecha).getTime() > ahora) ?? js[js.length - 1];
      await this.seleccionarJornada(proxima);
    } else { this.jornada.set(null); this.limpiar(); }
  }
  async seleccionarJornada(j: JornadaFalm) {
    this.jornada.set(j); this.aviso.set('');
    const eq = this.equipo(); if (!eq) return;
    const ali = await this.falm.getAlineacion(eq.id, j.id);
    if (ali) { this.aplicar(ali); return; }
    const prev = await this.falm.ultimaAlineacion(eq.id, this.competicionId(), j.numero);
    if (prev) { this.aplicar(prev); }
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
    if (liga) { this.aplicar(liga); this.aviso.set('Copiada de Liga. Revisa y guarda.'); }
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
      try { await this.falm.recalcular(); this.aviso.set('Alineación guardada y clasificación recalculada.'); }
      catch { this.aviso.set('Alineación guardada.'); }
    } catch (e: any) { this.aviso.set(e?.message ?? 'Error al guardar'); }
    finally { this.guardando.set(false); }
  }
}
