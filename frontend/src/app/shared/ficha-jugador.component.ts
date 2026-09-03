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
            <span class="av">
              @if (j.escudo) { <img class="wm" [src]="j.escudo" alt="" /> }
              @if (j.foto) { <img class="pl" [src]="j.foto" alt="" (error)="sinFoto.set(true)" [style.display]="sinFoto() ? 'none':'block'" /> }
              @if (!j.foto || sinFoto()) { <span class="ini">{{ (j.nombre || '?').charAt(0) }}</span> }
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
              <div class="s"><b class="num">{{ acum().asis }}</b><span>Asistencias</span></div>
              <div class="s"><b class="num">{{ acum().estrellas }}</b><span>Estrellas</span></div>
              @if (puntuaImbatido()) {
                <div class="s"><b class="num">{{ acum().imbatidos }}</b><span>Imbatido</span></div>
              } @else {
                <div class="s"><b class="num">{{ acum().minutos }}</b><span>Minutos</span></div>
              }
              <div class="s"><b class="num">{{ acum().jugadas }}</b><span>Jornadas</span></div>
            </div>

            <h3>Puntos por jornada</h3>
            @if (barras().length) {
              <div class="chart">
                @for (d of barras(); track d.j) {
                  <div class="bar" [title]="'J' + d.j + ': ' + d.p + ' pts'">
                    <span class="fill" [style.height.%]="d.h" [class.neg]="d.p < 0"></span>
                    <span class="jl num">{{ d.j }}</span>
                  </div>
                }
              </div>
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
    .chart { display: flex; align-items: flex-end; gap: 5px; height: 118px; overflow-x: auto; padding-bottom: 4px; }
    .bar { flex: 0 0 17px; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 4px; }
    .fill { width: 100%; min-height: 2px; background: var(--accent); border-radius: 4px 4px 0 0; }
    .fill.neg { background: var(--bad); }
    .jl { font-size: var(--t-xs); color: var(--text2); font-weight: 600; }
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
    const max = Math.max(1, ...h.map((x) => Math.abs(Number(x.puntosJornada ?? 0))));
    return h.map((x) => ({ j: jn(x), p: Number(x.puntosJornada ?? 0), h: Math.abs(Number(x.puntosJornada ?? 0)) / max * 100 }));
  });

  constructor(public ficha: FichaService, private falm: FalmService) {
    effect(() => {
      const j = this.ficha.abierto();
      this.sinFoto.set(false);
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
