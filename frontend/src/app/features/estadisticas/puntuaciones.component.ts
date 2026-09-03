import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FalmService, JornadaLfp, PuntosJugador } from '../../core/falm.service';
import { FichaService } from '../../shared/ficha.service';

const ABR: Record<string, string> = { Portero: 'POR', PORTERO: 'POR', Defensa: 'DEF', DEFENSA: 'DEF',
  Mediocampista: 'MED', MEDIO: 'MED', Delantero: 'DEL', DELANTERO: 'DEL' };

/** Estadísticas: puntos de cada jugador, acumulados o de una jornada LFP. */
@Component({
  selector: 'app-puntuaciones',
  standalone: true,
  imports: [FormsModule],
  template: `
    <header class="phead">
      <h1>Estadísticas</h1>
      <p class="sub">{{ subtitulo() }}</p>
    </header>

    <div class="modos">
      <button [class.on]="modo() === 'acumulada'" (click)="setModo('acumulada')">Acumulada</button>
      <button [class.on]="modo() === 'jornada'" (click)="setModo('jornada')">Por jornada</button>
    </div>

    @if (modo() === 'jornada' && jornadas().length) {
      <div class="jchips">
        @for (j of jornadas(); track j.numero) {
          <button [class.on]="j.numero === sel()" (click)="elegir(j.numero)">J{{ j.numero }}</button>
        }
      </div>
    }

    @if (cargando()) {
      <p class="muted">Cargando{{ modo() === 'jornada' ? ' la jornada ' + sel() : ' la acumulada' }}…</p>
    } @else if (error()) {
      <p class="err">{{ error() }}</p>
    } @else {
      <section class="tabla">
        <div class="barra">
          <span class="lb">{{ modo() === 'acumulada' ? 'Más puntuados' : 'Jornada ' + sel() }}</span>
          <input class="buscar" type="search" placeholder="Buscar jugador o equipo…"
                 [ngModel]="texto()" (ngModelChange)="texto.set($event); limite.set(30)" />
        </div>

        @if (visibles().length === 0) {
          <p class="vacio muted">Sin resultados.</p>
        } @else {
          @for (p of visibles().slice(0, limite()); track p.jugador.id; let i = $index) {
            <button class="fila" (click)="abrirFicha(p)">
              <span class="rk num">{{ i + 1 }}</span>
              <span class="av">
                @if (p.jugador.escudo) { <img class="wm" [src]="p.jugador.escudo" alt="" /> }
                @if (p.jugador.foto) { <img class="pl" [src]="p.jugador.foto" alt="" loading="lazy" (error)="p.jugador.foto = ''" /> }
                @else { <span class="ini">{{ p.jugador.nombre.charAt(0) }}</span> }
              </span>
              <span class="who">
                <span class="nm">{{ p.jugador.nombre }}</span>
                <span class="meta">
                  <span class="pos" [class]="abr(p.jugador.posicion)">{{ abr(p.jugador.posicion) }}</span>
                  {{ p.jugador.equipo }} · {{ modo() === 'jornada' ? p.minutosJugados + "'" : jorn(p) + ' jorn.' }}
                </span>
              </span>
              <span class="hechos">
                @if (p.goles) { <b>{{ p.goles }} gol{{ p.goles === 1 ? '' : 'es' }}</b> }
                @if (p.golesPenalti) { <b>{{ p.golesPenalti }} pen.</b> }
                @if (p.asistencias) { <b>{{ p.asistencias }} asis.</b> }
                @if (p.estrellas) { <b class="est">{{ p.estrellas }} ★</b> }
                @if (p.imbatido && esCero(p.jugador.posicion)) { <b>{{ p.imbatido }} a cero</b> }
                @if (p.tarjetasRojas) { <b class="roja">roja</b> } @else if (p.tarjetasAmarillas) { <b class="amar">amarilla</b> }
              </span>
              <span class="barra-p"><span class="rel" [style.width]="ancho(p)"></span></span>
              <span class="pts num" [class.neg]="p.puntosTotales < 0">{{ p.puntosTotales }}</span>
            </button>
          }
        }
      </section>

      <div class="pie">
        <span class="muted">{{ visibles().length }} jugadores</span>
        @if (visibles().length > limite()) {
          <button class="btn-sec" (click)="limite.set(limite() + 30)">Ver 30 más</button>
        }
      </div>
    }
  `,
  styles: [`
    .phead { margin-bottom: 16px; }
    .phead .sub { margin: 5px 0 0; color: var(--text2); font-size: var(--t-sm); }

    .modos { display: flex; gap: 8px; margin-bottom: 12px; }
    .modos button { flex: 1; background: var(--surface); border: 1px solid var(--line); color: var(--text2);
      border-radius: 12px; padding: 10px; cursor: pointer; font-family: var(--fb); font-weight: 700; font-size: var(--t-sm); }
    .modos button.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }

    .jchips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px; margin-bottom: 12px; }
    .jchips button { flex: 0 0 auto; min-width: 44px; padding: 8px 10px; border: 1px solid var(--line);
      background: var(--surface); color: var(--text2); border-radius: 10px; cursor: pointer;
      font-family: var(--fm); font-weight: 600; font-size: var(--t-sm); }
    .jchips button.on { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }

    .tabla { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; overflow: hidden; }
    .barra { display: flex; align-items: center; gap: 10px; padding: 13px 18px; border-bottom: 1px solid var(--line); }
    .barra .lb { font-size: var(--t-xs); font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--text2); }
    .barra .buscar { margin-left: auto; flex: 0 1 250px; padding: 7px 13px; font-size: var(--t-sm); border-radius: var(--pill); }

    .fila { width: 100%; display: grid; align-items: center; gap: 12px;
      grid-template-columns: 28px 42px minmax(0, 1.5fr) minmax(0, 1fr) 90px 52px;
      padding: 9px 18px; border: none; border-bottom: 1px solid var(--line);
      background: transparent; text-align: left; font-family: var(--fb); color: var(--text); cursor: pointer; }
    .fila:last-child { border-bottom: none; }
    .fila:hover { background: var(--surface2); }
    .rk { text-align: center; color: var(--text2); font-size: var(--t-sm); }

    .av { position: relative; width: 42px; height: 42px; border-radius: 10px; overflow: hidden;
      background: var(--surface2); border: 1px solid var(--line);
      display: flex; align-items: flex-end; justify-content: center; }
    .av .wm { position: absolute; width: 118%; left: 50%; top: 50%; transform: translate(-50%,-50%); opacity: .16; object-fit: contain; }
    .av .pl { position: relative; z-index: 1; height: 100%; width: 100%; object-fit: contain; }
    .av .ini { position: relative; z-index: 1; font-family: var(--fh); font-size: var(--t-lg); padding-bottom: 6px; color: var(--text2); }

    .who { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .nm { font-weight: 700; font-size: var(--t-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .meta { display: flex; align-items: center; gap: 6px; color: var(--text2); font-size: var(--t-xs);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .meta .pos { min-width: 30px; padding: 2px 5px; font-size: var(--t-xs); }

    /* Los hechos del partido, escritos: se leen mejor que una fila de iconos. */
    .hechos { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: var(--t-xs); color: var(--text2); min-width: 0; }
    .hechos b { font-weight: 600; }
    .hechos .est { color: var(--por); }
    .hechos .amar { color: var(--por); } .hechos .roja { color: var(--bad); }

    /* La barra da la escala de un vistazo: el líder ocupa el ancho entero. */
    .barra-p { height: 8px; border-radius: var(--pill); background: var(--surface2); overflow: hidden; }
    .barra-p .rel { display: block; height: 100%; background: var(--accent); }

    .pts { text-align: right; font-size: var(--t-lg); font-weight: 700; }
    .pts.neg { color: var(--bad); }
    .vacio { padding: 22px 18px; margin: 0; font-size: var(--t-sm); }

    .pie { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; }
    .pie .muted { font-size: var(--t-sm); }
    .muted { color: var(--text2); } .err { color: var(--bad); }

    @media (max-width: 900px) { .fila { grid-template-columns: 28px 42px 1fr 90px 52px; } .hechos { display: none; } }
    @media (max-width: 620px) {
      .fila { grid-template-columns: 24px 38px 1fr 48px; padding: 9px 13px; }
      .barra-p { display: none; }
      .barra .buscar { flex: 1; }
    }
  `],
})
export class PuntuacionesComponent implements OnInit {
  jornadas = signal<JornadaLfp[]>([]);
  sel = signal<number>(0);
  modo = signal<'jornada' | 'acumulada'>('acumulada');
  jugadores = signal<PuntosJugador[]>([]);
  texto = signal('');
  limite = signal(30);
  cargando = signal(true);
  error = signal('');

  visibles = computed(() => {
    const f = this.texto().trim().toLowerCase();
    const arr = [...this.jugadores()].sort((a, b) => b.puntosTotales - a.puntosTotales);
    return f ? arr.filter((p) => p.jugador.nombre.toLowerCase().includes(f) || (p.jugador.equipo || '').toLowerCase().includes(f)) : arr;
  });

  /** Tope de la escala de barras: el jugador más puntuado de la lista visible. */
  tope = computed(() => Math.max(1, ...this.visibles().map((p) => Number(p.puntosTotales) || 0)));

  subtitulo = computed(() => {
    const n = this.jugadores().length;
    if (this.modo() === 'jornada') return `Jornada ${this.sel()} de LaLiga · ${n} jugadores con puntos.`;
    const js = this.jornadas().length;
    return js ? `Acumulado de ${js} ${js === 1 ? 'jornada' : 'jornadas'} · ${n} jugadores.` : `Acumulado de la temporada · ${n} jugadores.`;
  });

  constructor(private falm: FalmService, public ficha: FichaService) {}
  abr(p: string) { return ABR[p] ?? 'MED'; }
  esCero(pos: string) { const a = this.abr(pos); return a === 'POR' || a === 'DEF'; }
  ancho(p: PuntosJugador) {
    const v = Math.max(0, Number(p.puntosTotales) || 0);
    return Math.round((v / this.tope()) * 100) + '%';
  }
  abrirFicha(p: PuntosJugador) {
    this.ficha.open({ ...p.jugador, tot: {
      puntos: Number(p.puntosTotales ?? 0),
      goles: Number(p.goles ?? 0) + Number(p.golesPenalti ?? 0),
      asis: Number(p.asistencias ?? 0),
      estrellas: Number(p.estrellas ?? 0),
      imbatidos: this.esCero(p.jugador.posicion) ? Number(p.imbatido ?? 0) : 0,
      jugadas: Number((p as any).jornadas ?? 0),
    } });
  }
  jorn(p: any) { return p.jornadas ?? 0; }

  async ngOnInit() {
    try {
      this.jornadas.set(await this.falm.jornadasLfp());
      await this.cargarAcumulada(); // por defecto: acumulada
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error'); this.cargando.set(false);
    }
  }

  async setModo(m: 'jornada' | 'acumulada') {
    if (m === this.modo()) return;
    this.modo.set(m); this.limite.set(30); this.error.set('');
    if (m === 'acumulada') await this.cargarAcumulada();
    else await this.elegir(this.sel() || this.jornadas()[0]?.numero || 0);
  }

  private async cargarAcumulada() {
    this.cargando.set(true);
    try { this.jugadores.set(await this.falm.puntuacionesAcumuladas()); }
    catch (e: any) { this.error.set(e?.message ?? 'Error cargando acumulada'); }
    finally { this.cargando.set(false); }
  }

  async elegir(n: number) {
    this.modo.set('jornada');
    this.sel.set(n); this.cargando.set(true); this.error.set(''); this.limite.set(30);
    try { this.jugadores.set(await this.falm.puntuacionesJornada(n)); }
    catch (e: any) { this.error.set(e?.message ?? 'Error cargando la jornada'); }
    finally { this.cargando.set(false); }
  }
}
