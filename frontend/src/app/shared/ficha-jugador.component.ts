import { Component, computed, effect, signal } from '@angular/core';
import { FalmService } from '../core/falm.service';
import { FichaService } from './ficha.service';

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
          <button class="x" (click)="ficha.close()">✕</button>
          <div class="head">
            <span class="av">
              @if (j.foto) { <img [src]="j.foto" alt="" (error)="sinFoto.set(true)" [style.display]="sinFoto() ? 'none':'block'" /> }
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
          } @else {
            <div class="acum">
              <div class="s"><b class="num">{{ acum().puntos }}</b><span>Puntos</span></div>
              <div class="s"><b class="num">{{ acum().goles }}</b><span>Goles</span></div>
              <div class="s"><b class="num">{{ acum().asis }}</b><span>Asist.</span></div>
              <div class="s"><b class="num">{{ acum().estrellas }}</b><span>Estrellas</span></div>
              <div class="s"><b class="num">{{ acum().imbatidos }}</b><span>Imbatido</span></div>
              <div class="s"><b class="num">{{ acum().jugadas }}</b><span>Jornadas</span></div>
            </div>

            <h3 class="th">Puntos por jornada</h3>
            <div class="chart">
              @for (d of barras(); track d.j) {
                <div class="bar" [title]="'J' + d.j + ': ' + d.p + ' pts'">
                  <span class="fill" [style.height.%]="d.h" [class.neg]="d.p < 0"></span>
                  <span class="jl">{{ d.j }}</span>
                </div>
              }
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .back { position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,.66);
      backdrop-filter: blur(4px); display: flex; align-items: flex-end; justify-content: center; }
    .panel { position: relative; width: 100%; max-width: 520px; max-height: 88vh; overflow-y: auto;
      background: linear-gradient(180deg, var(--surface), var(--bg-elev));
      border: 1px solid var(--border); border-top: 3px solid var(--c, var(--primary));
      border-radius: 22px 22px 0 0; padding: 22px; }
    @media (min-width: 560px) { .back { align-items: center; } .panel { border-radius: 22px; } }
    .panel[data-pos=POR] { --c: var(--pos-POR); } .panel[data-pos=DEF] { --c: var(--pos-DEF); }
    .panel[data-pos=MED] { --c: var(--pos-MED); } .panel[data-pos=DEL] { --c: var(--pos-DEL); }
    .x { position: absolute; top: 14px; right: 14px; background: var(--surface-2); border: 1px solid var(--border);
      color: var(--muted); width: 32px; height: 32px; border-radius: 9px; cursor: pointer; }
    .head { display: flex; gap: 16px; align-items: center; margin-bottom: 18px; }
    .av { width: 84px; height: 84px; border-radius: 18px; overflow: hidden; flex: 0 0 auto;
      background: var(--c, var(--surface-2)); display: flex; align-items: center; justify-content: center; }
    .av img { width: 100%; height: 100%; object-fit: cover; }
    .av .ini { font-size: 2.4rem; font-weight: 900; color: #07120d; }
    .meta h2 { margin: 4px 0; font-size: 1.4rem; }
    .eq { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: .85rem; }
    .esc { width: 18px; height: 18px; object-fit: contain; }
    .acum { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px; }
    .acum .s { background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px;
      padding: 12px; text-align: center; }
    .acum .s b { display: block; font-size: 1.5rem; font-weight: 900; }
    .acum .s span { font-size: .72rem; color: var(--muted); }
    .th { margin: 4px 0 10px; }
    .chart { display: flex; align-items: flex-end; gap: 4px; height: 110px; overflow-x: auto; padding-bottom: 4px; }
    .bar { flex: 0 0 16px; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 3px; }
    .fill { width: 100%; min-height: 2px; background: var(--primary); border-radius: 4px 4px 0 0; }
    .fill.neg { background: var(--bad); }
    .jl { font-size: .56rem; color: var(--faint); }
    .muted { color: var(--muted); }
  `],
})
export class FichaJugadorComponent {
  cargando = signal(false);
  sinFoto = signal(false);
  jornadas = signal<any[]>([]);

  acum = computed(() => {
    const h = this.jornadas();
    const sum = (k: string) => h.reduce((s, x) => s + Number(x[k] ?? 0), 0);
    return {
      puntos: +sum('puntosJornada').toFixed(1),
      goles: sum('goles') + sum('golesPenalti'),
      asis: sum('asistencias'),
      estrellas: sum('estrellas'),
      imbatidos: h.filter((x) => x.imbatido).length,
      jugadas: h.filter((x) => Number(x.minutosJugados ?? 0) > 0).length,
    };
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
      if (j) this.cargar(j.id);
      else this.jornadas.set([]);
    });
  }

  abr(p?: string) { return ABR[p ?? ''] ?? 'MED'; }

  private async cargar(id: number) {
    this.cargando.set(true);
    try { this.jornadas.set(await this.falm.jugadorJornadas(id)); }
    catch { this.jornadas.set([]); }
    finally { this.cargando.set(false); }
  }
}
