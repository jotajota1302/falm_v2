import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FalmService } from '../core/falm.service';
import { FichaService } from './ficha.service';

/** Las cuatro lineas, en el orden en que se lee un once. */
const ORDEN = ['PORTERO', 'DEFENSA', 'MEDIO', 'DELANTERO'];
const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/**
 * El detalle de un partido: los dos onces con lo que lleva cada jugador. Vivía dentro de
 * Partidos, pero es lo que se quiere ver también desde Inicio sin cambiar de pantalla, así
 * que se saca aquí para que sea el mismo en los dos sitios.
 */
@Component({
  selector: 'falm-detalle-partido',
  standalone: true,
  template: `
    @if (abierto()) {
      <div class="back" (click)="cerrar.emit()">
        <div class="panel rise" (click)="$event.stopPropagation()">
          <button class="x" (click)="cerrar.emit()" aria-label="Cerrar">✕</button>
          @if (cargando()) {
            <p class="muted pad">Cargando detalle…</p>
          } @else if (!detalle()?.local?.jugadores?.length && !detalle()?.visitante?.jugadores?.length) {
            <p class="muted pad">Sin alineaciones guardadas en este partido.</p>
          } @else {
            <div class="dmarcador">
              <span class="de">{{ detalle().local.equipo }}</span>
              <span class="dm num">{{ detalle().local.total }} – {{ detalle().visitante.total }}</span>
              <span class="de">{{ detalle().visitante.equipo }}</span>
            </div>
            <div class="dcols">
              @for (lado of [detalle().local, detalle().visitante]; track lado.equipo) {
                <div class="dcol">
                  @for (grupo of grupos(lado); track grupo.rol) {
                    @if (grupo.js.length) {
                      <span class="drol">{{ grupo.rol === 'TITULAR' ? 'Once' : 'Banquillo' }}</span>
                      @for (j of grupo.js; track j.nombre) {
                        <!-- La cifra sola no dice de dónde sale: al tocar se despliega de
                             qué se compone en ESTE partido, sin irse a la ficha entera. -->
                        <button class="dj" [class.supl]="j.rol !== 'TITULAR'"
                                [class.nojugo]="j.estado === 'NO_JUGO' || j.estado === 'SIN_PARTIDO'"
                                [class.hecho]="j.estado === 'PUNTUADO' || j.estado === 'ESPERANDO' || j.estado === 'EN_JUEGO'"
                                [class.fuera]="j.rol !== 'TITULAR' && !j.cuenta"
                                [class.abierto]="verJug() === j.activo_id"
                                (click)="tocar(j)" [title]="porQue(j)">
                          <span class="pos" [class]="abrPos(j.pos)">{{ abrPos(j.pos) }}</span>
                          <img class="dfo" [class.es]="!j.foto" [src]="j.foto || j.escudo" alt=""
                               loading="lazy" (error)="j.foto = null" />
                          <span class="dn">
                            {{ j.nombre }}
                            @if (j.entra_por) { <b class="entra" title="Entra por un titular que no jugó">▲</b> }
                          </span>
                          @if (j.foto && j.escudo) { <img class="dcl" [src]="j.escudo" alt="" loading="lazy" /> }
                          @else { <span></span> }
                          <!-- Tres marcas distintas para tres cosas distintas: el aro
                               girando es "esto esta pasando ahora", los puntos suspensivos
                               "acabo y falta la nota", y el guion "aqui no hay nada". El
                               reloj de arena valia para las dos primeras y ademas se
                               confundia con una copa. -->
                          @switch (j.estado) {
                            @case ('EN_JUEGO') {
                              <span class="dp viva" aria-label="Su partido se está jugando"></span>
                            }
                            @case ('ESPERANDO') { <span class="dp esp">···</span> }
                            @case ('PUNTUADO') { <span class="dp num" [class.neg]="j.puntos < 0">{{ j.puntos }}</span> }
                            @default { <span class="dp vacio">–</span> }
                          }
                        </button>
                        @if (verJug() === j.activo_id) {
                          <div class="djdet">
                            <p class="dq">{{ deQueSale(j) }}</p>
                            @if (j.rol !== 'TITULAR' && !j.cuenta && j.estado === 'PUNTUADO') {
                              <p class="dq nota">No suma: el titular al que taparía todavía
                                tiene su partido por jugar.</p>
                            }
                            <button class="vertodo" (click)="abrirFicha(j); $event.stopPropagation()">
                              Ver todas sus jornadas ›
                            </button>
                          </div>
                        }
                      }
                    }
                  }
                </div>
              }
            </div>
            <p class="dleg">
              En verde, el que ya está jugando o ha jugado su partido; en gris, quien no
              llegó a jugar. Los suplentes van con borde discontinuo.
              @if (hayEnJuego()) {
                <br /><b class="lviva"></b> su partido se está jugando ahora: los puntos
                llegan cuando acabe.
              }
              @if (hayEsperando()) {
                <br /><b>···</b> ya ha jugado y falta su nota: la prensa la publica un rato
                después del partido y entonces entra sola.
              }
            </p>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .back { position: fixed; inset: 0; z-index: 60; background: rgba(22,19,15,.42);
      display: flex; align-items: flex-end; justify-content: center; }
    .panel { position: relative; width: 100%; max-width: 640px; max-height: 88vh; overflow-y: auto;
      background: var(--surface); border: 1px solid var(--line); border-top: 3px solid var(--accent);
      border-radius: var(--r-lg) var(--r-lg) 0 0; padding: 22px; }
    @media (min-width: 621px) { .back { align-items: center; } .panel { border-radius: var(--r-lg); } }
    .x { position: absolute; top: 14px; right: 14px; background: var(--surface2); border: 1px solid var(--line);
      color: var(--text2); width: 32px; height: 32px; border-radius: var(--r-xs); cursor: pointer; font-size: var(--t-sm); z-index: 1; }
    .pad { padding: 18px 0; }
    .dmarcador { display: grid; grid-template-columns: 1fr auto 1fr; align-items: baseline; gap: 12px;
      margin-bottom: 18px; padding-right: 40px; }
    .de { font-family: var(--fh); font-size: var(--t-md); font-weight: 600; text-transform: uppercase; }
    .dmarcador .de:last-child { text-align: right; }
    .dm { font-size: var(--t-lg); font-weight: 700; text-align: center; color: var(--accent); white-space: nowrap; }
    .dcols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .dcol { display: flex; flex-direction: column; gap: 4px; }
    /* Titulares y suplentes, cada grupo bajo su rótulo: el borde discontinuo
       apenas se veía y no decía cuál era cuál. */
    .drol { display: block; margin: 12px 0 5px; font-size: var(--t-xs); font-weight: 700;
      letter-spacing: .1em; text-transform: uppercase; color: var(--text2); }
    .dcol > .drol:first-child { margin-top: 0; }
    .dj { display: grid; grid-template-columns: 32px 24px 1fr 16px auto; align-items: center; gap: 8px;
      padding: 5px 8px; background: var(--surface); border: 1px solid var(--line);
      border-radius: var(--r-xs); font-size: var(--t-sm);
      width: 100%; text-align: left; font-family: inherit; color: inherit; cursor: pointer; }
    .dj:hover { border-color: var(--accent); }
    .dfo { width: 24px; height: 24px; border-radius: 50%; object-fit: cover;
      object-position: top center; background: var(--surface2); }
    .dfo.es { object-fit: contain; padding: 2px; border: 1px solid var(--line); }
    .dcl { width: 16px; height: 16px; object-fit: contain; opacity: .85; }
    .dj.supl { background: var(--surface2); border-style: dashed; }
    .dj.nojugo { color: var(--text2); }
    .dj.nojugo .dp { color: var(--text2); }
    /* Quien ya ha jugado, en verde: de un vistazo se ve cuánto queda por resolver
       sin tener que leer fila por fila. Va después de .supl para ganarle el fondo. */
    .dj.hecho { background: color-mix(in oklab, var(--good) 9%, var(--surface));
      border-color: color-mix(in oklab, var(--good) 30%, var(--line)); }
    .dp.esp { font-size: var(--t-md); line-height: 1; color: var(--text2); letter-spacing: .1em; }
    /* Su partido esta rodando ahora mismo: un aro girando, que es lo que se
       entiende sin leyenda. Solo gira lo que de verdad esta en juego, asi que
       el movimiento senala justo donde hay que mirar. */
    .dp.viva { display: inline-block; width: 13px; height: 13px; border-radius: 50%;
      border: 2px solid color-mix(in oklab, var(--accent) 26%, transparent);
      border-top-color: var(--accent); animation: gira .9s linear infinite; }
    @keyframes gira { to { transform: rotate(360deg); } }
    /* A quien le moleste el movimiento, el aro se queda quieto y sigue leyendose. */
    @media (prefers-reduced-motion: reduce) { .dp.viva { animation: none; } }
    .dp.vacio { color: var(--text2); font-weight: 600; }
    /* El banquillo, apagado: nadie cuenta hasta que se cae un titular. El que entra
       recupera el color y lleva flecha. */
    .dj.fuera { opacity: .55; }
    .dn .entra { color: var(--good); font-size: var(--t-xs); margin-left: 4px; }
    .dj.abierto { border-color: var(--accent); }
    /* De qué salen sus puntos en ESTE partido, sin abrir la ficha entera. */
    .djdet { margin: -1px 0 4px; padding: 9px 11px; font-size: var(--t-xs); line-height: 1.5;
      background: var(--surface2); border: 1px solid var(--accent-line);
      border-radius: 0 0 var(--r-xs) var(--r-xs); }
    .djdet .dq { margin: 0; color: var(--text); }
    .djdet .dq.nota { margin-top: 4px; color: var(--text2); }
    .vertodo { margin-top: 6px; padding: 0; background: none; border: none; cursor: pointer;
      color: var(--accent); font-family: inherit; font-size: var(--t-xs); font-weight: 600; }
    .dj .pos { min-width: 30px; padding: 2px 4px; font-size: var(--t-xs); }
    .dn { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
    .dp { font-weight: 700; color: var(--accent); } .dp.neg { color: var(--bad); }
    .dleg { margin: 14px 0 0; font-size: var(--t-xs); color: var(--text2); }
    /* El mismo aro de la fila, en la leyenda, para que se reconozca. */
    .dleg .lviva { display: inline-block; width: 10px; height: 10px; border-radius: 50%;
      vertical-align: -1px; margin-right: 2px;
      border: 2px solid color-mix(in oklab, var(--accent) 26%, transparent);
      border-top-color: var(--accent); animation: gira .9s linear infinite; }
    @media (prefers-reduced-motion: reduce) { .dleg .lviva { animation: none; } }
    .muted { color: var(--text2); }

    @media (max-width: 620px) {
      .panel { padding: 18px 15px; }
      .dcols { grid-template-columns: 1fr; }
    }
  `],
})
export class DetallePartidoComponent {
  detalle = signal<any | null>(null);
  cargando = signal(false);
  abierto = signal(false);

  /** El partido a enseñar. Al ponerlo se pide el detalle; a null, se cierra. */
  @Input() set enfrentamiento(id: string | null) {
    if (!id) { this.abierto.set(false); this.detalle.set(null); return; }
    this.abierto.set(true);
    this.cargar(id);
  }
  @Output() cerrar = new EventEmitter<void>();

  constructor(private falm: FalmService, public ficha: FichaService) {}

  private async cargar(id: string) {
    this.cargando.set(true);
    this.detalle.set(null);
    try { this.detalle.set(await this.falm.detalleEnfrentamiento(id)); }
    catch { this.detalle.set(null); }
    finally { this.cargando.set(false); }
  }

  abrPos(p: string) { return ABR[p] ?? p; }

  /** El jugador cuyo desglose está desplegado. */
  verJug = signal<string | null>(null);
  tocar(j: any) { this.verJug.set(this.verJug() === j.activo_id ? null : j.activo_id); }

  /**
   * De qué se componen sus puntos EN ESTE PARTIDO, en palabras. Lo que no puntúa a esa
   * posición no se enumera: la portería a cero es del portero y del defensa, y los goles
   * encajados y el penalti parado solo del portero.
   */
  deQueSale(j: any): string {
    if (j.estado === 'EN_JUEGO') return 'Su partido se está jugando ahora mismo: los puntos llegan cuando acabe.';
    if (j.estado === 'ESPERANDO') return 'Ya ha jugado. Falta su nota de prensa, que entra sola en cuanto se publica.';
    if (j.estado === 'NO_JUGO') return 'No jugó este partido.';
    if (j.estado === 'PENDIENTE') return 'Su partido todavía no se ha jugado.';
    if (j.estado === 'SIN_PARTIDO') return 'Su club no juega esta jornada.';
    const x = j.detalle ?? {};
    const n = (v: any) => Number(v ?? 0);
    const p: string[] = [];
    const plural = (c: number, uno: string, varios: string) => `${c} ${c === 1 ? uno : varios}`;
    const pos = this.abrPos(j.pos);
    if (n(x.goles)) p.push(plural(n(x.goles), 'gol', 'goles'));
    if (n(x.golesPenalti)) p.push(plural(n(x.golesPenalti), 'gol de penalti', 'goles de penalti'));
    if (n(x.asistencias)) p.push(plural(n(x.asistencias), 'asistencia', 'asistencias'));
    if (n(x.estrellas)) p.push(`${n(x.estrellas)} ${Math.abs(n(x.estrellas)) === 1 ? 'estrella' : 'estrellas'}`);
    if ((pos === 'POR' || pos === 'DEF') && x.imbatido && n(x.minutosJugados) > 45) p.push('portería a cero');
    if (pos === 'POR' && n(x.penaltiParado)) p.push(plural(n(x.penaltiParado), 'penalti parado', 'penaltis parados'));
    if (n(x.penaltiFallado)) p.push(plural(n(x.penaltiFallado), 'penalti fallado', 'penaltis fallados'));
    if (n(x.golesEnPropia)) p.push(plural(n(x.golesEnPropia), 'gol en propia', 'goles en propia'));
    if (n(x.tarjetasRojas)) p.push(plural(n(x.tarjetasRojas), 'roja', 'rojas'));
    // El baremo solo descuenta a partir del segundo, de ahí el > 1.
    if (pos === 'POR' && n(x.golesEnContra) > 1) p.push(`${n(x.golesEnContra)} goles encajados`);
    const res = x.resultado === 'VICTORIA' ? 'victoria' : x.resultado === 'EMPATE' ? 'empate'
      : x.resultado === 'DERROTA' ? 'derrota' : '';
    if (res) p.push(res);
    p.push(`${n(x.minutosJugados)} min`);
    return `${j.puntos} ${Math.abs(Number(j.puntos)) === 1 ? 'punto' : 'puntos'}: ${p.join(' · ')}`;
  }

  private todos() {
    const d = this.detalle();
    return [...(d?.local?.jugadores ?? []), ...(d?.visitante?.jugadores ?? [])];
  }
  /** Si hay algún partido rodando, hay que explicar el aro que gira. */
  hayEnJuego() { return this.todos().some((j: any) => j.estado === 'EN_JUEGO'); }
  /** Y si alguien espera nota de prensa, los puntos suspensivos. */
  hayEsperando() { return this.todos().some((j: any) => j.estado === 'ESPERANDO'); }

  /** En qué anda cada uno, que un 0 y un "aún no se sabe" no son lo mismo. */
  porQue(j: any): string {
    switch (j.estado) {
      case 'EN_JUEGO': return `${j.nombre}: su partido se está jugando ahora`;
      case 'ESPERANDO': return `${j.nombre} ya ha jugado · falta la nota de la prensa`;
      case 'NO_JUGO': return `${j.nombre} no jugó`;
      case 'PENDIENTE': return `${j.nombre} juega más adelante en esta jornada`;
      case 'SIN_PARTIDO': return `${j.nombre} no tiene partido esta jornada`;
      default: return `${j.nombre}: ${j.puntos} puntos · toca para ver de dónde salen`;
    }
  }

  /** Por líneas, como se lee un once: la consulta los devuelve por orden de guardado. */
  grupos(lado: any) {
    const js = (lado?.jugadores ?? []) as any[];
    // Una posicion que no reconozcamos se va al final, no al principio.
    const linea = (j: any) => (ORDEN.indexOf(j?.pos) + 1) || ORDEN.length + 1;
    const porLinea = (a: any, b: any) => linea(a) - linea(b);
    return [
      { rol: 'TITULAR', js: js.filter((j) => j.rol === 'TITULAR').sort(porLinea) },
      { rol: 'SUPLENTE', js: js.filter((j) => j.rol !== 'TITULAR').sort(porLinea) },
    ];
  }

  /**
   * La ficha del jugador tocado, con el detalle de su jornada. Las porterías de club no
   * son un jugador y no tienen ext_id: van por activo_id, que es lo que entiende el
   * historial.
   */
  abrirFicha(j: any) {
    this.ficha.open({
      id: j.ext_id ?? 0, activoId: j.activo_id, nombre: j.nombre,
      equipo: j.club ?? '', escudo: j.escudo ?? '', foto: j.foto ?? '', posicion: j.pos,
    });
  }
}
