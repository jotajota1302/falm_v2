import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FalmService, JornadaLfp, PuntosJugador } from '../../core/falm.service';
import { FichaService } from '../../shared/ficha.service';
import { clubGrad, clubInk } from '../../shared/club-colors';

const ABR: Record<string, string> = { Portero: 'POR', PORTERO: 'POR', Defensa: 'DEF', DEFENSA: 'DEF',
  Mediocampista: 'MED', MEDIO: 'MED', Delantero: 'DEL', DELANTERO: 'DEL' };

/** Estadísticas: puntos de cada jugador por jornada LFP (en vivo del backend). */
@Component({
  selector: 'app-puntuaciones',
  standalone: true,
  imports: [FormsModule],
  template: `
    <h1>📊 Estadísticas</h1>

    <div class="modos">
      <button [class.on]="modo() === 'acumulada'" (click)="setModo('acumulada')">🏆 Acumulada</button>
      <button [class.on]="modo() === 'jornada'" (click)="setModo('jornada')">📅 Por jornada</button>
    </div>

    @if (modo() === 'jornada' && jornadas().length) {
      <div class="jchips">
        @for (j of jornadas(); track j.numero) {
          <button class="jchip" [class.on]="j.numero === sel()" (click)="elegir(j.numero)">J{{ j.numero }}</button>
        }
      </div>
    }

    <input class="buscar" type="search" placeholder="Buscar jugador o equipo…"
           [ngModel]="texto()" (ngModelChange)="texto.set($event); limite.set(30)" />

    @if (cargando()) {
      <p class="muted">Cargando{{ modo() === 'jornada' ? ' jornada ' + sel() : ' acumulada' }}…</p>
    } @else if (error()) {
      <p class="err">{{ error() }}</p>
    } @else {
      <div class="lista">
        @for (p of visibles().slice(0, limite()); track p.jugador.id; let i = $index) {
          <div class="fila card" (click)="abrirFicha(p)">
            <span class="rk num">{{ i + 1 }}</span>
            <span class="av" [style.background]="grad(p.jugador)" [style.color]="ink(p.jugador)">
              @if (p.jugador.escudo) { <img class="wm" [src]="p.jugador.escudo" alt="" /> }
              @if (p.jugador.foto) { <img class="pl" [src]="p.jugador.foto" alt="" loading="lazy" (error)="p.jugador.foto = ''" /> }
              @else { <span class="ini">{{ p.jugador.nombre.charAt(0) }}</span> }
            </span>
            <div class="who">
              <span class="nm">{{ p.jugador.nombre }}</span>
              <span class="eq">
                @if (p.jugador.escudo) { <img class="esc" [src]="p.jugador.escudo" alt="" /> }
                {{ p.jugador.equipo }}
              </span>
              <span class="stats">
                @if (p.goles) { <b>⚽ {{ p.goles }}</b> }
                @if (p.golesPenalti) { <b>🎯 {{ p.golesPenalti }}</b> }
                @if (p.asistencias) { <b>🅰️ {{ p.asistencias }}</b> }
                @if (p.estrellas) { <b>⭐ {{ p.estrellas }}</b> }
                @if (p.imbatido && esCero(p.jugador.posicion)) { <b>🧤 {{ p.imbatido }}</b> }
                @if (p.tarjetasRojas) { <b>🟥</b> } @else if (p.tarjetasAmarillas) { <b>🟨</b> }
                @if (modo() === 'jornada') { <span class="min">{{ p.minutosJugados }}'</span> }
                @else { <span class="min">{{ jorn(p) }} jorn.</span> }
              </span>
            </div>
            <span class="pts num" [class.neg]="p.puntosTotales < 0">{{ p.puntosTotales }}</span>
          </div>
        }
      </div>
      @if (visibles().length > limite()) {
        <button class="mas" (click)="limite.set(limite() + 30)">Ver más</button>
      }
    }
  `,
  styles: [`
    h1 { margin: 0 0 14px; }
    .modos { display: flex; gap: 8px; margin-bottom: 14px; }
    .modos button { flex: 1; background: var(--surface); border: 1px solid var(--border); color: var(--muted);
      border-radius: 11px; padding: 10px; cursor: pointer; font-weight: 800; font-size: .85rem; }
    .modos button.on { background: rgba(0,230,118,.1); color: var(--primary); border-color: var(--primary); }
    .jchips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 12px; }
    .jchip { flex: 0 0 auto; min-width: 44px; height: 38px; border: 1px solid var(--border); background: var(--surface);
      color: var(--muted); border-radius: 10px; cursor: pointer; font-weight: 800; }
    .jchip.on { background: var(--primary); color: var(--primary-ink); border-color: var(--primary); }
    .buscar { width: 100%; margin-bottom: 14px; }
    .lista { display: flex; flex-direction: column; gap: 8px; }
    .fila { display: grid; grid-template-columns: 26px 46px 1fr auto; align-items: center; gap: 11px; padding: 10px 13px;
      cursor: pointer; transition: border-color .12s ease; }
    .fila:hover { border-color: var(--border-strong); }
    .rk { text-align: center; color: var(--faint); font-weight: 800; font-size: .9rem; }
    .av { position: relative; width: 46px; height: 46px; border-radius: 12px; overflow: hidden;
      display: flex; align-items: flex-end; justify-content: center; font-weight: 800; }
    .av .wm { position: absolute; width: 122%; left: 50%; top: 50%; transform: translate(-50%,-50%); opacity: .2; object-fit: contain; }
    .av .pl { position: relative; z-index: 1; height: 100%; width: 100%; object-fit: contain; filter: drop-shadow(0 2px 3px rgba(0,0,0,.45)); }
    .av .ini { position: relative; z-index: 1; font-size: 1.1rem; padding-bottom: 8px; }
    .who { min-width: 0; }
    .nm { display: block; font-weight: 700; font-size: .92rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .eq { display: flex; align-items: center; gap: 5px; color: var(--muted); font-size: .76rem; }
    .esc { width: 14px; height: 14px; object-fit: contain; }
    .stats { display: flex; align-items: center; gap: 8px; margin-top: 3px; font-size: .76rem; }
    .stats b { font-weight: 700; } .stats .min { color: var(--faint); margin-left: auto; }
    .pts { font-weight: 900; font-size: 1.5rem; color: var(--primary); min-width: 42px; text-align: right; }
    .pts.neg { color: var(--bad); }
    .mas { display: block; margin: 16px auto 0; background: var(--surface); border: 1px solid var(--border);
      color: var(--ink); border-radius: 12px; padding: 11px 22px; cursor: pointer; font-weight: 700; }
    .muted { color: var(--muted); } .err { color: var(--bad); }
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

  constructor(private falm: FalmService, public ficha: FichaService) {}
  abr(p: string) { return ABR[p] ?? 'MED'; }
  grad(j: any) { return clubGrad(j.escudo, this.abr(j.posicion)); }
  ink(j: any) { return clubInk(j.escudo); }
  esCero(pos: string) { const a = this.abr(pos); return a === 'POR' || a === 'DEF'; }
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
