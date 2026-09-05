import { Component, computed, effect, signal } from '@angular/core';
import { FalmService } from '../core/falm.service';
import { FichaService, JugadorRef } from './ficha.service';

const ABR: Record<string, string> = { Portero: 'POR', PORTERO: 'POR', Defensa: 'DEF', DEFENSA: 'DEF',
  Mediocampista: 'MED', MEDIO: 'MED', Delantero: 'DEL', DELANTERO: 'DEL' };

/** Overlay con la ficha de un jugador: datos + stats acumuladas + puntos por jornada. */
@Component({
  selector: 'falm-ficha-jugador',
  standalone: true,
  template: `
    @if (ficha.abierto(); as j) {
      <div class="back" (click)="ficha.close()">
        <div class="panel rise" (click)="$event.stopPropagation()" [attr.data-pos]="abr(j.posicion)">
          <button class="x" (click)="ficha.close()" aria-label="Cerrar ficha">✕</button>

          <div class="head">
            <span class="av" [class.solo-escudo]="(!j.foto || sinFoto()) && !!j.escudo">
              @if (j.escudo) { <img class="wm" [src]="j.escudo" alt="" /> }
              @if (j.foto) { <img class="pl" [src]="j.foto" alt="" (error)="sinFoto.set(true)" [style.display]="sinFoto() ? 'none':'block'" /> }
              <!-- Sin retrato manda el escudo del club, que ya está de fondo: la
                   inicial solo aparece si tampoco hay escudo (una "P" de Portería
                   no dice nada). -->
              @if ((!j.foto || sinFoto()) && !j.escudo) { <span class="ini">{{ (j.nombre || '?').charAt(0) }}</span> }
            </span>
            <div class="meta">
              <span class="pos" [class]="abr(j.posicion)">{{ abr(j.posicion) }}</span>
              <h2>{{ j.nombre }}</h2>
              <span class="eq">
                @if (j.escudo) { <img class="esc" [src]="j.escudo" alt="" /> } {{ j.equipo }}
              </span>
            </div>
          </div>

          @if (cargando()) {
            <p class="muted">Cargando estadísticas…</p>
          } @else if (fallo()) {
            <p class="muted">No se pudieron cargar las estadísticas. Cierra y vuelve a intentarlo en un momento.</p>
          } @else {
            <div class="acum">
              <div class="s"><b class="num">{{ acum().puntos }}</b><span>Puntos</span></div>
              <div class="s"><b class="num">{{ acum().goles }}</b><span>Goles</span></div>
              <!-- La casilla que cambia según a quién se mire: al portero y al
                   defensa les interesa la portería a cero, que la cobran; a los
                   demás, las asistencias, que ni cobran ni les afectan pero se
                   guardan. Los minutos son de todos y ya no los pisa nadie. -->
              @if (puntuaImbatido()) {
                <div class="s"><b class="num">{{ acum().imbatidos }}</b><span>Imbatido</span></div>
              } @else {
                <div class="s"><b class="num">{{ acum().asis }}</b><span>Asistencias</span></div>
              }
              <div class="s"><b class="num">{{ acum().estrellas }}</b><span>Estrellas</span></div>
              <div class="s"><b class="num">{{ acum().minutos }}</b><span>Minutos</span></div>
              <div class="s"><b class="num">{{ acum().jugadas }}</b><span>Jornadas</span></div>
            </div>

            <h3>Puntos por jornada</h3>
            @if (barras().length) {
              <!-- Cero en medio: lo que suma va hacia arriba y lo que resta hacia
                   abajo, con la cifra dentro de su propia barra. -->
              <div class="chart" [class.conneg]="hayNegativos()">
                @for (d of barras(); track d.j) {
                  <button class="bar" type="button" [class.sel]="verJ() === d.j"
                          (click)="verJ.set(verJ() === d.j ? null : d.j)"
                          [title]="d.jugo ? 'Jornada ' + d.j + ': ' + d.p + ' puntos en ' + d.min + ' minutos'
                                          : 'Jornada ' + d.j + ': no jugó'">
                    <span class="up" [style.flex-basis.%]="zonaPos()">
                      @if (!d.jugo) {
                        <span class="fill nojugo"><i>NJ</i></span>
                      } @else if (d.p >= 0) {
                        <span class="fill" [style.height.%]="d.h"><i class="num">{{ d.p }}</i></span>
                      }
                    </span>
                    <span class="dn">
                      @if (d.jugo && d.p < 0) {
                        <span class="fill neg" [style.height.%]="d.h"><i class="num">{{ d.p }}</i></span>
                      }
                    </span>
                    <span class="jl">J{{ d.j }}</span>
                  </button>
                }
              </div>

              <!-- De qué se compone la jornada que se toca. -->
              @if (detalleJ(); as dj) {
                <div class="detj">
                  <span class="dt">Jornada {{ dj.j }}</span>
                  @if (dj.jugo) {
                    <span class="dp num" [class.neg]="dj.p < 0">{{ dj.p }} pts</span>
                    <span class="dh">{{ hechosDe(dj) }}</span>
                  } @else {
                    <span class="dh">No jugó esta jornada.</span>
                  }
                </div>
              } @else {
                <p class="pista">Toca una barra para ver de qué salen esos puntos.</p>
              }
            } @else {
              <p class="muted">Aún sin puntos esta temporada.</p>
            }
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .back { position: fixed; inset: 0; z-index: 60; background: rgba(22,19,15,.42);
      display: flex; align-items: flex-end; justify-content: center; }
    .panel { position: relative; width: 100%; max-width: 520px; max-height: 88vh; overflow-y: auto;
      background: var(--surface); border: 1px solid var(--line);
      border-top: 3px solid var(--c, var(--accent));
      border-radius: 22px 22px 0 0; padding: 22px; }
    @media (min-width: 560px) { .back { align-items: center; } .panel { border-radius: 22px; } }
    @media (max-width: 560px) {
      .panel { padding: 18px 15px; }
      .head { gap: 12px; }
      .av { width: 68px; height: 68px; }
      .acum .s { padding: 10px 6px; }
    }
    /* El filo superior identifica la posición sin repetirla en color por todo el panel. */
    .panel[data-pos=POR] { --c: var(--por); } .panel[data-pos=DEF] { --c: var(--def); }
    .panel[data-pos=MED] { --c: var(--med); } .panel[data-pos=DEL] { --c: var(--del); }

    .x { position: absolute; top: 14px; right: 14px; background: var(--surface2); border: 1px solid var(--line);
      color: var(--text2); width: 32px; height: 32px; border-radius: 9px; cursor: pointer; font-size: var(--t-sm); }

    .head { display: flex; gap: 16px; align-items: center; margin-bottom: 18px; }
    .av { position: relative; width: 84px; height: 84px; border-radius: 16px; overflow: hidden; flex: 0 0 auto;
      background: var(--surface2); border: 1px solid var(--line);
      display: flex; align-items: flex-end; justify-content: center; }
    .av .wm { position: absolute; width: 124%; left: 50%; top: 50%; transform: translate(-50%,-50%); opacity: .16; object-fit: contain; }
    /* Una portería no tiene cara: su escudo deja de ser marca de agua y pasa a
       ser la imagen, entero y centrado. */
    .av.solo-escudo .wm { width: 72%; opacity: 1; }
    .av .pl { position: relative; z-index: 1; width: 100%; height: 100%; object-fit: contain; object-position: bottom; }
    .av .ini { position: relative; z-index: 1; font-family: var(--fb); font-weight: 700; font-size: var(--t-xl); padding-bottom: 6px; color: var(--text2); }
    .meta h2 { margin: 5px 0; font-size: var(--t-xl); letter-spacing: -.01em; }
    /* El club se escribe como en Mercado o Inicio: texto normal con su escudo. */
    .eq { display: flex; align-items: center; gap: 7px; color: var(--text2); font-size: var(--t-sm); }
    .esc { width: 18px; height: 18px; object-fit: contain; }

    .acum { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; margin-bottom: 20px;
      background: var(--line); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
    .acum .s { background: var(--surface); padding: 12px 10px; text-align: center; }
    .acum .s b { display: block; font-family: var(--fm); font-size: var(--t-lg); font-weight: 700; }
    .acum .s span { font-size: var(--t-xs); font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--text2); }

    h3 { margin: 0 0 12px; color: var(--text2); letter-spacing: .16em; font-size: var(--t-xs); font-weight: 700; }
    /* Los puntos van dentro de su barra y la jornada debajo. Sin hueco entre
       columnas, la línea del cero sale continua de lado a lado. */
    .chart { display: flex; align-items: stretch; height: 160px; overflow-x: auto; padding-bottom: 4px; }
    .bar { flex: 0 0 34px; display: flex; flex-direction: column; align-items: stretch; padding: 0 3px; }
    .up { display: flex; align-items: flex-end; }
    .chart.conneg .up { border-bottom: 1px solid var(--line); }
    .dn { flex: 1 1 auto; display: flex; align-items: flex-start; }
    .fill { width: 100%; min-height: 19px; background: var(--accent); border-radius: 4px 4px 0 0;
      display: flex; align-items: flex-start; justify-content: center; padding-top: 3px; }
    .fill.neg { background: var(--bad); border-radius: 0 0 4px 4px;
      align-items: flex-end; padding: 0 0 3px; }
    /* Sin registro en esa jornada: no es un cero, es que no estuvo. */
    .fill.nojugo { height: 19px; background: repeating-linear-gradient(135deg,
        var(--surface2) 0 4px, var(--surface) 4px 8px);
      border: 1px solid var(--line); border-radius: 4px; }
    .fill.nojugo i { font-family: var(--fb); font-size: 10px; letter-spacing: .04em;
      color: var(--text2); }
    .fill i { font-family: var(--fm); font-style: normal; font-size: var(--t-xs);
      font-weight: 700; color: var(--accent-ink); line-height: 1; }
    .jl { text-align: center; margin-top: 4px; font-size: var(--t-xs);
      color: var(--text2); font-weight: 600; }
    .bar { border: none; background: none; cursor: pointer; font-family: var(--fb); }
    .bar.sel .jl { color: var(--accent); }
    .bar.sel .fill { outline: 2px solid var(--accent); outline-offset: 1px; }

    /* El desglose de la jornada tocada, en palabras. */
    .detj { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px;
      margin-top: 10px; padding: 10px 12px; background: var(--surface2);
      border: 1px solid var(--line); border-radius: var(--r-sm); font-size: var(--t-sm); }
    .dt { font-weight: 700; }
    .dp { font-family: var(--fm); font-weight: 700; color: var(--accent); }
    .dp.neg { color: var(--bad); }
    .dh { color: var(--text2); }
    .pista { margin: 10px 0 0; font-size: var(--t-xs); color: var(--text2); }
    .muted { color: var(--text2); }
  `],
})
export class FichaJugadorComponent {
  cargando = signal(false);
  sinFoto = signal(false);
  fallo = signal(false);
  jornadas = signal<any[]>([]);

  /**
   * La portería a cero solo puntúa a porteros y defensas (+2 y +1), así que a un
   * medio o un delantero no se le enseña: contarla ahí hacía pensar que sumaba.
   */
  puntuaImbatido = computed(() => {
    const p = this.abr(this.ficha.abierto()?.posicion ?? '');
    return p === 'POR' || p === 'DEF';
  });

  acum = computed(() => {
    const h = this.jornadas();
    const cero = this.puntuaImbatido();
    if (h.length) {
      const sum = (k: string) => h.reduce((s, x) => s + Number(x[k] ?? 0), 0);
      return {
        puntos: +sum('puntosJornada').toFixed(1),
        goles: sum('goles') + sum('golesPenalti'),
        asis: sum('asistencias'),
        estrellas: sum('estrellas'),
        // Mismo criterio que stats_equipo: hay que pasar de 45 minutos.
        imbatidos: cero
          ? h.filter((x) => x.imbatido && Number(x.minutosJugados ?? 0) > 45).length
          : 0,
        minutos: sum('minutosJugados'),
        jugadas: h.filter((x) => Number(x.minutosJugados ?? 0) > 0).length,
      };
    }
    // respaldo: totales ya conocidos (Estadísticas/Equipo)
    const t = this.ficha.abierto()?.tot;
    return { puntos: 0, goles: 0, asis: 0, estrellas: 0, imbatidos: 0, jugadas: 0,
             ...(t ?? {}), minutos: 0 };
  });

  barras = computed(() => {
    const jn = (x: any) => Number(x.jornada?.numero ?? x.jornada ?? 0);
    const h = [...this.jornadas()].sort((a, b) => jn(a) - jn(b));
    const maxP = Math.max(1, ...h.map((x) => Number(x.puntosJornada ?? 0)));
    const maxN = Math.max(1, ...h.map((x) => -Number(x.puntosJornada ?? 0)));
    return h.map((x) => {
      const p = Number(x.puntosJornada ?? 0);
      // jugo=false es "no jugó esa jornada", que no es lo mismo que hacer 0.
      const jugo = x.jugo !== false;
      return { j: jn(x), p, jugo, min: Number(x.minutosJugados ?? 0),
        h: (p >= 0 ? p / maxP : -p / maxN) * 100, datos: x };
    });
  });

  /** La jornada cuyo desglose se está mirando. */
  verJ = signal<number | null>(null);
  detalleJ = computed(() => this.barras().find((d) => d.j === this.verJ()) ?? null);

  /** De qué se compone esa jornada, en palabras y por orden de importancia. */
  hechosDe(d: any): string {
    const x = d.datos ?? {};
    const n = (v: any) => Number(v ?? 0);
    const p: string[] = [];
    const plural = (c: number, uno: string, varios: string) => `${c} ${c === 1 ? uno : varios}`;
    if (n(x.goles)) p.push(plural(n(x.goles), 'gol', 'goles'));
    if (n(x.golesPenalti)) p.push(plural(n(x.golesPenalti), 'gol de penalti', 'goles de penalti'));
    if (n(x.asistencias)) p.push(plural(n(x.asistencias), 'asistencia', 'asistencias'));
    if (n(x.estrellas)) p.push(`${n(x.estrellas)} ${Math.abs(n(x.estrellas)) === 1 ? 'estrella' : 'estrellas'}`);
    if (x.imbatido && n(x.minutosJugados) > 45) p.push('portería a cero');
    if (n(x.penaltiParado)) p.push(plural(n(x.penaltiParado), 'penalti parado', 'penaltis parados'));
    if (n(x.penaltiFallado)) p.push(plural(n(x.penaltiFallado), 'penalti fallado', 'penaltis fallados'));
    if (n(x.golesEnPropia)) p.push(plural(n(x.golesEnPropia), 'gol en propia', 'goles en propia'));
    if (n(x.tarjetasRojas)) p.push(plural(n(x.tarjetasRojas), 'roja', 'rojas'));
    if (n(x.golesEnContra) > 1) p.push(`${n(x.golesEnContra)} goles encajados`);
    const res = x.resultado === 'VICTORIA' ? 'victoria' : x.resultado === 'EMPATE' ? 'empate'
      : x.resultado === 'DERROTA' ? 'derrota' : '';
    if (res) p.push(res);
    p.push(`${n(x.minutosJugados)} min`);
    return p.join(' · ');
  }

  hayNegativos = computed(() => this.barras().some((d) => d.p < 0));
  /**
   * Cuánto alto se lleva la mitad de arriba. Sin negativos, todo; con ellos, en
   * proporción a lo mejor y lo peor, sin que ninguna zona baje del 30%.
   */
  zonaPos = computed(() => {
    if (!this.hayNegativos()) return 100;
    const maxP = Math.max(0, ...this.barras().map((d) => d.p));
    const maxN = Math.max(0, ...this.barras().map((d) => -d.p));
    const total = maxP + maxN || 1;
    return Math.min(70, Math.max(30, Math.round((maxP / total) * 100)));
  });

  constructor(public ficha: FichaService, private falm: FalmService) {
    effect(() => {
      const j = this.ficha.abierto();
      this.sinFoto.set(false);
      this.verJ.set(null);
      if (j) this.cargar(j);
      else this.jornadas.set([]);
    }, { allowSignalWrites: true });
  }

  abr(p?: string) { return ABR[p ?? ''] ?? 'MED'; }

  private async cargar(j: JugadorRef) {
    this.cargando.set(true);
    this.fallo.set(false);
    let data: any[] = [];
    let err = false;
    for (let i = 0; i < 2; i++) {
      try {
        data = j.activoId ? await this.falm.activoJornadas(j.activoId) : await this.falm.jugadorJornadas(j.id);
        err = false; break;
      } catch { err = true; /* fallo real: reintenta */ }
    }
    this.jornadas.set(data);
    this.fallo.set(err); // solo error real; sin datos = 0 puntos (no error)
    this.cargando.set(false);
  }
}
