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

      <!-- Jornada: se abre en la que toca y se pasa de una en una. -->
      @if (jornada(); as j) {
        <div class="jnav">
          <button class="jb" (click)="irJornada(-1)" [disabled]="!jAnterior()">
            @if (jAnterior(); as a) { ‹ Jornada {{ a.numero }} } @else { ‹ }
          </button>
          <div class="jc">
            <h1>Jornada {{ j.numero }}</h1>
            @if (j.fecha) { <span class="jf">{{ fechaCorta(j.fecha) }}</span> }
            @if (!esJornadaPorDefecto()) {
              <button class="jhoy" (click)="irAJornadaActual()">Ir a la actual</button>
            }
          </div>
          <button class="jb" (click)="irJornada(1)" [disabled]="!jSiguiente()">
            @if (jSiguiente(); as b) { Jornada {{ b.numero }} › } @else { › }
          </button>
        </div>
      }

      @if (!esLiga()) {
        <div class="atajos">
          <button class="atajo" (click)="copiarDeLiga()">Copiar de Liga</button>
        </div>
      }
      @if (aviso()) { <p class="aviso">{{ aviso() }}</p> }

      <!-- CAMPO: huecos por formación -->
      <div class="zona">
        <div class="lado-campo">
          <div class="pitch">
        <span class="lineas" aria-hidden="true"></span>
        @for (pos of ['PORTERO','DEFENSA','MEDIO','DELANTERO']; track pos) {
          <div class="fila" [attr.data-linea]="abr(pos)">
            @for (j of enLinea(pos); track j.activo_id) {
              <button class="slot" (click)="abrirLinea(pos, j.activo_id)">
                <falm-fut-card [nombre]="j.nombre" [posicion]="j.posicion" [foto]="j.foto ?? null"
                  [escudo]="j.escudo ?? null" [media]="media(j)" [campo]="true" />
              </button>
            }
            @for (h of huecos(pos); track h) {
              <button class="slot vacio" (click)="abrirLinea(pos)" [attr.data-pos]="abr(pos)">
                <span class="hueco">
                  <span class="mas">
                    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7 1h2v6h6v2H9v6H7V9H1V7h6z" /></svg>
                  </span>
                  <span class="col">
                    <span class="fig">
                      <svg viewBox="0 0 24 23" aria-hidden="true">
                        <path d="M9.1 1 3 4.2l1.7 4.6 2.1-.8V22h10.4V8l2.1.8L21 4.2 14.9 1a3 3 0 0 1-5.8 0z" />
                      </svg>
                      <span class="q">{{ iniciales() }}</span>
                    </span>
                    <span class="lb">{{ abr(pos) }}</span>
                  </span>
                </span>
              </button>
            }
          </div>
        }
          </div>
        </div>

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
      </div>

      <!-- Barra de envío: lo último de la pantalla y siempre a la vista. -->
      <div class="envio">
        <span class="est" [class.ok]="titulares().length === 11">
          {{ titulares().length }} de 11 titulares@if (banca().length) { · {{ banca().length }} en el banquillo }
        </span>
        <button class="btn-sec" (click)="repetirUltima()">Repetir última</button>
        <button class="btn" (click)="guardar()" [disabled]="guardando()">{{ guardando() ? 'Enviando…' : 'Enviar alineación' }}</button>
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
      font-weight: 600; font-size: var(--t-sm); white-space: nowrap; }
    .comp.on { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
    /* Navegador de jornada: la abierta en el centro, y a los lados la de
       antes y la de después, con su número, para saber a dónde vas. */
    .jnav { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
      gap: 12px; margin-bottom: 12px; }
    .jb { justify-self: end; padding: 9px 15px; border: 1px solid var(--line);
      background: var(--surface); color: var(--text2); border-radius: var(--pill); cursor: pointer;
      font-family: var(--fb); font-size: var(--t-sm); font-weight: 600; white-space: nowrap; }
    .jnav .jb:last-child { justify-self: start; }
    .jb:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .jb:disabled { opacity: .3; cursor: not-allowed; }
    /* Jornada y fecha en la misma línea: dos renglones ahí arriba le quitaban
       altura al campo, que es lo que se quiere ver. */
    .jc { display: flex; align-items: baseline; justify-content: center;
      gap: 10px; flex-wrap: wrap; text-align: center; }
    .jc h1 { font-size: var(--t-xl); }
    .jf { font-size: var(--t-sm); color: var(--text2); text-transform: capitalize; }
    .jhoy { background: none; border: none; cursor: pointer; padding: 0;
      font-family: var(--fb); font-size: var(--t-sm); color: var(--text2);
      text-decoration: underline; text-underline-offset: 3px; }
    .jhoy:hover { color: var(--accent); }

    .comps { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-bottom: 12px; }

    /* Se compone arriba y se envía abajo: la barra se queda pegada al fondo
       mientras editas, para no tener que subir a buscar el botón. */
    .envio { position: sticky; bottom: 0; z-index: 6;
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      margin: 14px auto 0; max-width: 1120px; padding: 12px 16px;
      background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); }
    .envio .est { flex: 1 1 auto; min-width: 130px; font-size: var(--t-sm);
      color: var(--bad); font-weight: 600; }
    .envio .est.ok { color: var(--good); }
    /* Las dos acciones, juntas y de la misma altura: la de verdad en granate. */
    .envio .btn-sec, .envio .btn { padding: 11px 20px; font-size: var(--t-sm); }
    .envio .btn-sec { order: 2; }
    .envio .btn { order: 3; }

    @media (max-width: 480px) {
      .envio { gap: 8px; padding: 11px 13px; }
      .envio .est { flex: 1 1 100%; }
      .envio .btn-sec, .envio .btn { flex: 1 1 0; padding: 12px 10px; text-align: center; }
    }

    /* Formación y recuento de titulares, pegados al campo que gobiernan. */
    /* La formación se queda en el campo, en la esquina que nadie usa: se
       cambia mirando el once, y en el móvil no hay que ir hasta el pie. */
    .fsel { position: absolute; z-index: 2; top: 12px; left: 12px;
      display: flex; flex-direction: column; gap: 3px;
      background: var(--surface); border: 1px solid var(--line);
      border-radius: 10px; padding: 7px 9px; }
    .fsel select { padding: 5px 6px; border: none; background: none;
      font-size: var(--t-sm); font-weight: 700; }
    .fsel select:focus { outline: none; }

    .atajos { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .atajo { background: var(--surface); border: 1px solid var(--line); color: var(--text); border-radius: 11px;
      padding: 10px 15px; cursor: pointer; font-weight: 600; font-size: var(--t-sm); }
    .atajo:hover { border-color: var(--accent); }
    .aviso { background: var(--surface); border: 1px solid var(--accent); color: var(--accent);
      padding: 10px 15px; border-radius: 11px; margin-bottom: 12px; font-size: var(--t-sm); font-weight: 600; }

    /* Campo de verdad: césped segado y líneas de cal dibujadas en CSS, sin
       imagen que cargar. La portería arriba, como se ha alineado siempre. */
    /* En pantalla ancha, el banquillo se pone al lado del campo en vez de
       obligar a bajar para verlo. */
    .zona { display: flex; align-items: flex-start; justify-content: center;
      gap: 18px; max-width: 1120px; margin: 0 auto; }
    .lado-campo { flex: 1 1 620px; min-width: 0; max-width: 760px; }

    .pitch { position: relative; overflow: hidden; max-width: 760px; margin: 0 auto;
      background: repeating-linear-gradient(180deg, #e3e9d8 0 52px, #dde4d0 52px 104px);
      border: 1px solid var(--line); border-radius: 14px;
      padding: 26px 14px; display: flex; flex-direction: column; gap: 6px;
      min-height: 500px; justify-content: space-between; }
    .lineas { position: absolute; inset: 14px; pointer-events: none; z-index: 0;
      border: 2px solid rgba(255,255,255,.8); border-radius: 4px;
      background:
        linear-gradient(rgba(255,255,255,.8), rgba(255,255,255,.8)) center / 100% 2px no-repeat,
        radial-gradient(circle at 50% 50%, transparent 56px, rgba(255,255,255,.8) 56px,
                        rgba(255,255,255,.8) 58px, transparent 58px); }
    /* áreas grandes, arriba y abajo */
    .lineas::before, .lineas::after { content: ''; position: absolute; left: 50%;
      transform: translateX(-50%); width: 54%; height: 74px;
      border: 2px solid rgba(255,255,255,.8); }
    .lineas::before { top: -2px; border-top: none; border-radius: 0 0 4px 4px; }
    .lineas::after { bottom: -2px; border-bottom: none; border-radius: 4px 4px 0 0; }

    .fila { position: relative; z-index: 1; display: flex; justify-content: center;
      align-items: center; gap: 10px; flex-wrap: wrap; padding: 4px; }

    .slot { background: none; border: none; cursor: pointer; width: 88px; padding: 0; }
    .slot.vacio { min-height: 112px; border-radius: 13px; display: flex;
      flex-direction: column; align-items: center; justify-content: center; gap: 6px;
      border: 1.5px dashed rgba(255,255,255,.9);
      background: rgba(255,255,255,.28); }
    .slot.vacio:hover { background: rgba(255,255,255,.5); }
    /* Un hueco se lee de un vistazo: el signo de añadir y la silueta de quien
       falta, con la posición debajo. */
    .hueco { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 0 10px; }
    .col { display: flex; flex-direction: column; align-items: center; gap: 1px; }
    /* La cruz va dibujada, no escrita: el glifo "+" nunca cae centrado en un
       círculo, le sobra hueco por debajo. */
    .slot.vacio .mas { display: flex; align-items: center; justify-content: center;
      width: 30px; height: 30px; border-radius: 50%; flex: 0 0 auto;
      background: var(--surface); border: 1px solid var(--line);
      transition: background .12s ease, border-color .12s ease; }
    .slot.vacio .mas svg { width: 12px; height: 12px; fill: var(--text2); }
    .slot.vacio:hover .mas { background: var(--accent); border-color: var(--accent); }
    .slot.vacio:hover .mas svg { fill: var(--accent-ink); }
    .fig { position: relative; display: flex; align-items: center; justify-content: center; }
    /* Una sola camiseta para todos los huecos: el color ya lo dice la etiqueta
       de debajo, y cuatro tonos en el campo eran ruido. */
    .fig svg { width: 46px; height: 44px; fill: var(--text2); opacity: .45; }
    .fig .q { position: absolute; top: 58%; left: 50%; transform: translate(-50%, -50%);
      font-family: var(--fb); font-size: var(--t-sm); font-weight: 700; letter-spacing: .02em;
      color: var(--surface); }
    /* El color de la posición vive aquí, en el hueco, no en franjas de fondo. */

    .slot.vacio .lb { font-family: var(--fb); font-size: var(--t-xs); font-weight: 700;
      letter-spacing: .08em; color: var(--text); }

    .banco { flex: 1 1 300px; min-width: 280px;
      background: var(--surface); border: 1px solid var(--line); border-radius: 18px;
      padding: 16px; margin: 0; }
    .bh { display: flex; align-items: center; justify-content: space-between; }
    .add { background: var(--surface); border: 1px solid var(--line); color: var(--text); border-radius: 11px;
      padding: 8px 13px; cursor: pointer; font-weight: 600; font-size: var(--t-sm); }
    .add:hover { border-color: var(--accent); }
    .sm { font-size: var(--t-xs); } .faint { color: var(--text2); }
    .bfila { display: flex; align-items: center; gap: 8px; padding: 8px 10px; margin-top: 6px;
      background: var(--surface2); border: 1px solid var(--line); border-radius: 11px; }
    .prio { width: 22px; height: 22px; border-radius: 50%; background: var(--surface); border: 1px solid var(--line);
      display: flex; align-items: center; justify-content: center; font-family: var(--fm);
      font-weight: 700; font-size: var(--t-xs); flex: 0 0 auto; }
    .bnm { flex: 1; font-weight: 700; font-size: var(--t-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .chips { display: flex; gap: 4px; }
    .ch { width: 28px; padding: 5px 0; border-radius: 6px; border: 1px solid var(--line); background: transparent;
      color: var(--text2); font-weight: 700; font-size: var(--t-xs); cursor: pointer; }
    .ch.on.DEF { background: var(--def); color: var(--accent-ink); border-color: var(--def); }
    .ch.on.MED { background: var(--med); color: var(--accent-ink); border-color: var(--med); }
    .ch.on.DEL { background: var(--del); color: var(--accent-ink); border-color: var(--del); }
    .mv { width: 26px; padding: 5px 0; border: 1px solid var(--line); background: var(--surface); color: var(--text2);
      border-radius: 7px; cursor: pointer; font-size: var(--t-xs); }
    .mv:disabled { opacity: .3; }
    .rm { width: 26px; padding: 5px 0; border: 1px solid var(--line); background: var(--surface); color: var(--bad);
      border-radius: 7px; cursor: pointer; font-size: var(--t-xs); }

    /* bottom sheet selector */
    .back { position: fixed; inset: 0; z-index: 60; background: rgba(22,19,15,.42);
      display: flex; align-items: flex-end; justify-content: center; }
    .sheet { width: 100%; max-width: 520px; max-height: 82vh; display: flex; flex-direction: column;
      background: var(--surface); border: 1px solid var(--line);
      border-top: 3px solid var(--accent); border-radius: 20px 20px 0 0; padding: 16px; }
    @media (min-width: 560px) { .back { align-items: center; } .sheet { border-radius: 22px; } }

    /* En el teléfono el campo se estrecha para que la línea no se parta en dos. */
    /* Cuando el banquillo dejaría el campo demasiado estrecho, vuelve abajo. */
    @media (max-width: 1000px) {
      .zona { flex-direction: column; align-items: stretch; }
      .lado-campo, .banco { max-width: 760px; width: 100%; margin: 0 auto; }
    }

    @media (max-width: 760px) {
      .envio { bottom: calc(47px + env(safe-area-inset-bottom)); }
    }

    @media (max-width: 620px) {
      .pitch { padding: 14px 8px; min-height: 384px; gap: 8px; }
      .fila { gap: 6px; padding: 5px 2px 5px 18px; }
      .banda { width: 12px; font-size: var(--t-xs); letter-spacing: .14em; }
      .slot { width: 62px; }
      .slot.vacio { min-height: 76px; }
      .slot.vacio .mas { width: 28px; height: 28px; font-size: var(--t-md); }
      .slot.vacio .lb { font-size: var(--t-xs); }
      .formas { width: 100%; }
      .forma { flex: 1; padding: 10px 8px; }
      .atajo { flex: 1 1 auto; }
    }
    .sh { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .st { font-family: var(--fh); font-size: var(--t-md); font-weight: 600; text-transform: uppercase; }
    .quitar { background: transparent; border: 1px solid var(--bad); color: var(--bad);
      border-radius: 8px; padding: 6px 12px; cursor: pointer; font-family: var(--fb);
      font-weight: 600; font-size: var(--t-sm); margin-left: auto; margin-right: 8px; }
    .x { background: var(--surface2); border: 1px solid var(--line); color: var(--text2);
      width: 30px; height: 30px; border-radius: 8px; cursor: pointer; font-size: var(--t-sm); }
    .cands { overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
    .cand { display: grid; grid-template-columns: 32px 40px 1fr 22px; align-items: center; gap: 10px; padding: 8px 10px;
      background: var(--surface); border: 1px solid var(--line); border-radius: 11px; cursor: pointer; text-align: left; }
    .cand:hover { background: var(--surface2); }
    .cand.sel { border-color: var(--accent); background: var(--accent-soft); }
    .cm { font-family: var(--fm); font-weight: 700; color: var(--accent); text-align: center; }
    .cav { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
      font-family: var(--fh); font-size: var(--t-md); color: var(--accent-ink); overflow: hidden; }
    .cav img { width: 100%; height: 100%; object-fit: cover; } .cav img.esc { object-fit: contain; padding: 5px; }
    .cav.POR { background: var(--por); } .cav.DEF { background: var(--def); }
    .cav.MED { background: var(--med); } .cav.DEL { background: var(--del); }
    .cn { font-weight: 700; font-size: var(--t-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ck { color: var(--accent); font-weight: 700; text-align: center; }
    .listo { margin-top: 12px; background: var(--accent); color: var(--accent-ink); border: none; border-radius: 11px;
      padding: 12px; cursor: pointer; font-family: var(--fb); font-weight: 700; font-size: var(--t-sm); }
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
  /** Calendario de cada competición, ya consultado al arrancar. */
  private cacheJornadas = new Map<string, JornadaFalm[]>();
  jornada = signal<JornadaFalm | null>(null);
  plantilla = signal<ItemPlantilla[]>([]);
  puntos = signal<Record<string, number>>({});
  titulares = signal<string[]>([]);
  banca = signal<{ id: string; lineas: string[] }[]>([]);
  picker = signal<{ pos?: string; banca?: boolean; reemplazar?: string } | null>(null);
  cargando = signal(true);
  guardando = signal(false);
  aviso = signal('');

  /** El dorsal de la camiseta del hueco: las iniciales de tu equipo. */
  iniciales = computed(() => {
    const p = (this.equipo()?.nombre ?? '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    return ((p[0][0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
  });

  compTipo = computed(() => this.competiciones().find((c) => c.id === this.competicionId())?.tipo ?? 'LIGA');
  esLiga = computed(() => this.compTipo() === 'LIGA');
  /** Suma de medias del once: el dato que se mira antes de enviar. */
  mediaPrevista = computed(() => {
    const p = this.puntos();
    const t = this.titulares().reduce((a, id) => a + (p[id] ?? 0), 0);
    return Math.round(t * 10) / 10;
  });

  /** Posición de la jornada abierta dentro de la competición. */
  idxJornada = computed(() => this.jornadasComp().findIndex((j) => j.id === this.jornada()?.id));

  /** La jornada que toca: la primera por jugar, o la última si ya pasaron todas. */
  private porDefecto(): JornadaFalm | null {
    const js = this.jornadasComp();
    if (!js.length) return null;
    const ahora = Date.now();
    return js.find((j) => j.fecha && new Date(j.fecha).getTime() > ahora) ?? js[js.length - 1];
  }
  esJornadaPorDefecto = computed(() => {
    const js = this.jornadasComp();
    if (!js.length) return true;
    const ahora = Date.now();
    const def = js.find((j) => j.fecha && new Date(j.fecha).getTime() > ahora) ?? js[js.length - 1];
    return def?.id === this.jornada()?.id;
  });

  /** Las jornadas vecinas, para enseñar a dónde lleva cada flecha. */
  jAnterior = computed(() => this.jornadasComp()[this.idxJornada() - 1] ?? null);
  jSiguiente = computed(() => this.jornadasComp()[this.idxJornada() + 1] ?? null);

  async irJornada(paso: number) {
    const js = this.jornadasComp();
    const i = this.idxJornada() + paso;
    if (i >= 0 && i < js.length) await this.seleccionarJornada(js[i]);
  }
  async irAJornadaActual() {
    const j = this.porDefecto();
    if (j) await this.seleccionarJornada(j);
  }

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
      // La Champions y la Clausura empiezan a mitad de temporada: hasta que no
      // tienen jornadas no hay nada que alinear, así que ni se ofrecen.
      const calendarios = await Promise.all(comps.map((c) => this.falm.jornadas(c.id).catch(() => [])));
      comps.forEach((c, i) => this.cacheJornadas.set(c.id, calendarios[i]));
      const conCalendario = comps.filter((c, i) => calendarios[i].length > 0);
      this.competiciones.set(conCalendario.length ? conCalendario : comps);
      const liga = this.competiciones().find((c) => c.tipo === 'LIGA') ?? this.competiciones()[0];
      if (liga) await this.seleccionarCompeticion(liga.id);
    } catch (e: any) { this.aviso.set(e?.message ?? 'Error'); }
    finally { this.cargando.set(false); }
  }

  async seleccionarCompeticion(compId: string) {
    this.competicionId.set(compId);
    const js = this.cacheJornadas.get(compId) ?? await this.falm.jornadas(compId);
    this.cacheJornadas.set(compId, js);
    this.jornadasComp.set(js);
    const proxima = this.porDefecto();
    if (proxima) await this.seleccionarJornada(proxima);
    else { this.jornada.set(null); this.limpiar(); }
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
