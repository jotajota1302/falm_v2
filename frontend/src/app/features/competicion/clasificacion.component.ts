import { Component, OnInit, signal } from '@angular/core';
import { Competicion, FalmService, FilaClasificacion, RondaEliminatoria } from '../../core/falm.service';

const COLORES = ['#00e676', '#38bdf8', '#fb7185', '#a3e635', '#ffc24b', '#c084fc', '#f97316', '#2dd4bf', '#f472b6', '#60a5fa'];

/** Clasificación con avatares de equipo y top-3 destacado. */
@Component({
  selector: 'app-clasificacion',
  standalone: true,
  template: `
    <h1>🏆 Clasificación</h1>

    @if (competiciones().length > 1) {
      <div class="comps">
        @for (c of competiciones(); track c.id) {
          <button class="comp" [class.on]="c.id === competicionId()" (click)="seleccionar(c.id)">
            <span class="ci">{{ icono(c.tipo) }}</span> {{ etiqueta(c.tipo) }}
          </button>
        }
      </div>
    }

    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else if (error()) {
      <p class="err">{{ error() }}</p>
    } @else if (modo() === 'bracket') {
      @if (rondas().length === 0) { <p class="muted">Aún no hay eliminatoria.</p> }
      <div class="bracket">
        @for (r of rondas(); track r.ronda) {
          <div class="ronda">
            <h3 class="rt">{{ r.ronda }}</h3>
            @for (k of r.llaves; track k.a + k.b) {
              <div class="llave card rise">
                @if (k.subtitulo) { <span class="sub">{{ k.subtitulo }}</span> }
                <div class="eq" [class.gana]="k.ganador === k.a">
                  <span class="av" [style.background]="color(k.a)">{{ inicial(k.a) }}</span>
                  <span class="nm">{{ k.a }}</span>
                  <span class="ag num">{{ k.aggA }}</span>
                </div>
                <div class="eq" [class.gana]="k.ganador === k.b">
                  <span class="av" [style.background]="color(k.b)">{{ inicial(k.b) }}</span>
                  <span class="nm">{{ k.b }}</span>
                  <span class="ag num">{{ k.aggB }}</span>
                </div>
                <div class="legs">
                  @for (l of k.legs; track $index) {
                    <span class="leg">{{ l.local }} {{ l.pl }}–{{ l.pv }} {{ l.visitante }}</span>
                  }
                </div>
              </div>
            }
          </div>
        }
      </div>
    } @else if (filas().length === 0) {
      <p class="muted">Aún no hay clasificación.</p>
    } @else {
      <div class="tabla card rise">
        <div class="row head">
          <span class="c-pos">#</span><span class="c-eq">Equipo</span>
          <span class="c-n">PJ</span><span class="c-sec">V</span><span class="c-sec">E</span>
          <span class="c-sec">D</span><span class="c-pts">Pts</span>
        </div>
        @for (f of filas(); track f.equipo_falm_id; let i = $index) {
          <div class="row" [class.top]="i < 3" [style.--accent]="color(f.equipo_nombre)">
            <span class="c-pos num">
              @if (i < 3) { <span class="medal" [attr.data-m]="i+1">{{ i+1 }}</span> }
              @else { {{ f.posicion }} }
            </span>
            <span class="c-eq">
              <span class="av" [style.background]="color(f.equipo_nombre)">{{ inicial(f.equipo_nombre) }}</span>
              <span class="nm">{{ f.equipo_nombre }}</span>
            </span>
            <span class="c-n num">{{ f.partidos_jugados }}</span>
            <span class="c-sec num">{{ f.victorias }}</span>
            <span class="c-sec num">{{ f.empates }}</span>
            <span class="c-sec num">{{ f.derrotas }}</span>
            <span class="c-pts num">{{ f.puntos_clasificacion }}</span>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    h1 { margin: 0 0 16px; }
    .comps { display: flex; gap: 8px; margin-bottom: 16px; overflow-x: auto; padding-bottom: 4px; }
    .comp { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; padding: 9px 15px; border-radius: 11px;
      border: 1px solid var(--border); background: var(--surface); color: var(--muted); cursor: pointer;
      font-weight: 800; font-size: .82rem; white-space: nowrap; transition: all .14s ease; }
    .comp .ci { font-size: 1rem; }
    .comp.on { background: rgba(0,230,118,.1); color: var(--primary); border-color: var(--primary);
      box-shadow: inset 0 0 0 1px var(--primary); }
    .bracket { display: flex; flex-direction: column; gap: 18px; }
    .ronda { display: flex; flex-direction: column; gap: 10px; }
    .rt { margin: 0; font-size: 1rem; color: var(--gold); }
    .llave { position: relative; padding: 12px 14px; }
    .llave .sub { position: absolute; top: 10px; right: 12px; font-size: .62rem; font-weight: 800; text-transform: uppercase;
      letter-spacing: .04em; color: var(--faint); background: var(--surface-2); border: 1px solid var(--border); padding: 2px 8px; border-radius: 999px; }
    .eq { display: flex; align-items: center; gap: 10px; padding: 5px 0; }
    .eq .av { flex: 0 0 auto; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center;
      justify-content: center; font-weight: 800; font-size: .8rem; color: #07120d; }
    .eq .nm { flex: 1; font-weight: 700; font-size: .9rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .eq .ag { font-weight: 900; font-size: 1.1rem; color: var(--muted); }
    .eq.gana .nm { color: var(--ink); } .eq.gana .ag { color: var(--primary); }
    .legs { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
    .leg { font-size: .72rem; color: var(--faint); }
    .tabla { overflow: hidden; }
    .row { display: grid; grid-template-columns: 42px 1fr 36px 30px 30px 30px 54px;
      align-items: center; padding: 11px 12px; border-bottom: 1px solid var(--border); }
    .row:last-child { border-bottom: none; }
    .row.head { font-size: .66rem; text-transform: uppercase; letter-spacing: .06em; color: var(--faint); font-weight: 700; }
    .row.head span { text-align: center; }
    .row.top { background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 10%, transparent), transparent 40%); }
    .c-pos { text-align: center; font-weight: 700; color: var(--muted); }
    .medal { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px;
      border-radius: 50%; font-weight: 800; font-size: .8rem; color: #07120d; }
    .medal[data-m="1"] { background: #ffc24b; } .medal[data-m="2"] { background: #cbd5e1; } .medal[data-m="3"] { background: #d4915a; }
    .c-eq { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .av { flex: 0 0 auto; width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center;
      justify-content: center; font-weight: 800; font-size: .85rem; color: #07120d; }
    .nm { font-weight: 700; font-size: .9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .c-n, .c-sec { text-align: center; color: var(--muted); font-size: .85rem; }
    .c-pts { text-align: center; font-weight: 900; font-size: 1.05rem; color: var(--primary); }
    .muted { color: var(--muted); } .err { color: #fb7185; }

    @media (max-width: 560px) {
      .row { grid-template-columns: 38px 1fr 30px 50px; }
      .c-sec { display: none; }
    }
  `],
})
export class ClasificacionComponent implements OnInit {
  competiciones = signal<Competicion[]>([]);
  competicionId = signal('');
  filas = signal<FilaClasificacion[]>([]);
  rondas = signal<RondaEliminatoria[]>([]);
  modo = signal<'tabla' | 'bracket'>('tabla');
  cargando = signal(true);
  error = signal('');

  constructor(private falm: FalmService) {}

  inicial(n?: string) { return (n || '?').trim().charAt(0).toUpperCase(); }
  color(n?: string) {
    let h = 0; for (const ch of n || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return COLORES[h % COLORES.length];
  }
  icono(t: string) { return t === 'CHAMPIONS' ? '🌟' : t === 'CLAUSURA' ? '🔚' : '🏆'; }
  etiqueta(t: string) { return t === 'CHAMPIONS' ? 'Champions' : t === 'CLAUSURA' ? 'Clausura' : 'Liga'; }

  async ngOnInit() {
    try {
      const comps: Competicion[] = await this.falm.competiciones();
      const orden = { LIGA: 0, CHAMPIONS: 1, CLAUSURA: 2 } as Record<string, number>;
      comps.sort((a, b) => (orden[a.tipo] ?? 9) - (orden[b.tipo] ?? 9));
      this.competiciones.set(comps);
      const liga = comps.find((c) => c.tipo === 'LIGA') ?? comps[0];
      if (liga) { this.competicionId.set(liga.id); await this.cargar(liga); }
      else this.cargando.set(false);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error cargando la clasificación');
      this.cargando.set(false);
    }
  }

  async seleccionar(id: string) {
    if (id === this.competicionId()) return;
    const c = this.competiciones().find((x) => x.id === id);
    if (!c) return;
    this.competicionId.set(id);
    this.cargando.set(true); this.error.set(''); this.filas.set([]); this.rondas.set([]);
    try { await this.cargar(c); }
    catch (e: any) { this.error.set(e?.message ?? 'Error'); }
    finally { this.cargando.set(false); }
  }

  /**
   * Liga: snapshot oficial. Clausura: tabla calculada. Champions: cuadro eliminatorio
   * (es a doble partido, mostrarlo como liga sería engañoso).
   */
  private async cargar(c: Competicion) {
    if (c.tipo === 'CHAMPIONS') {
      this.modo.set('bracket');
      this.rondas.set(await this.falm.eliminatorias(c.id));
    } else {
      this.modo.set('tabla');
      this.filas.set(c.tipo === 'LIGA'
        ? await this.falm.clasificacion(c.id)
        : await this.falm.clasificacionCalculada(c.id));
    }
    this.cargando.set(false);
  }
}
