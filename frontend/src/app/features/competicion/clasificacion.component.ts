import { Component, OnInit, computed, signal } from '@angular/core';
import { Competicion, FalmService, FilaClasificacion, RondaEliminatoria } from '../../core/falm.service';
import { colorEquipo } from '../../shared/equipo-colores';
import { SubnavComponent, SubnavItem } from '../../shared/subnav.component';

/** Clasificación de la competición elegida, con premios integrados en la tabla. */
@Component({
  selector: 'app-clasificacion',
  standalone: true,
  imports: [SubnavComponent],
  template: `
    <header class="phead">
      <h1>Clasificación</h1>
      <p class="sub">{{ subtitulo() }}</p>
    </header>

    <falm-subnav [items]="secciones" />

    @if (competiciones().length > 1) {
      <div class="comps">
        @for (c of competiciones(); track c.id) {
          <button [class.on]="c.id === competicionId()" (click)="seleccionar(c.id)">{{ etiqueta(c.tipo) }}</button>
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
          <section class="ronda">
            <h2>{{ r.ronda }}</h2>
            @for (k of r.llaves; track k.a + k.b) {
              <div class="llave">
                <div class="eq" [class.gana]="k.ganador === k.a">
                  <span class="marca" [style.background]="color(k.a)"></span>
                  <span class="nm">{{ k.a }}</span>
                  <span class="ag num">{{ k.aggA }}</span>
                </div>
                <div class="eq" [class.gana]="k.ganador === k.b">
                  <span class="marca" [style.background]="color(k.b)"></span>
                  <span class="nm">{{ k.b }}</span>
                  <span class="ag num">{{ k.aggB }}</span>
                </div>
                <div class="legs">
                  @for (l of k.legs; track $index) {
                    <span class="leg">{{ l.local }} <b class="num">{{ l.pl }}–{{ l.pv }}</b> {{ l.visitante }}</span>
                  }
                </div>
              </div>
            }
          </section>
        }
      </div>
    } @else if (filas().length === 0) {
      <p class="muted">Aún no hay clasificación.</p>
    } @else {
      <div class="tabla">
        <div class="fila cab">
          <span>#</span><span>Equipo</span>
          <span class="der" title="Partidos jugados">PJ</span>
          <span class="der" title="Victorias">V</span>
          <span class="der" title="Empates">E</span>
          <span class="der" title="Derrotas">D</span>
          <span class="der">Puntos</span>
          <span class="der" title="Puntos fantasy a favor">A favor</span>
          <span class="der">Beneficio</span>
        </div>
        @for (f of filas(); track f.equipo_falm_id; let i = $index) {
          <div class="fila" [class.podio]="i < 3">
            <span class="puesto">
              <span class="marca" [style.background]="color(f.equipo_nombre)"></span>
              <span class="num">{{ f.posicion || i + 1 }}</span>
            </span>
            <span class="nm">{{ f.equipo_nombre }}</span>
            <span class="der num sec">{{ f.partidos_jugados }}</span>
            <span class="der num sec">{{ f.victorias }}</span>
            <span class="der num sec">{{ f.empates }}</span>
            <span class="der num sec">{{ f.derrotas }}</span>
            <span class="der num pts">{{ f.puntos_clasificacion }}</span>
            <span class="der num sec">{{ f.puntos_favor }}</span>
            <span class="der num ben" [class.neg]="beneficio(f.equipo_nombre) < 0">
              {{ beneficio(f.equipo_nombre) > 0 ? '+' : '' }}{{ beneficio(f.equipo_nombre) }}<small>€</small>
            </span>
          </div>
        }
      </div>
      <p class="nota">La marca de color identifica a cada equipo en el resto de la app. El beneficio suma premios de jornada y de competición.</p>
    }
  `,
  styles: [`
    .phead { margin-bottom: 18px; }
    .phead .sub { margin: 5px 0 0; color: var(--text2); font-size: var(--t-sm); }

    .comps { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
    .comps button { background: var(--surface); border: 1px solid var(--line); color: var(--text2);
      border-radius: var(--pill); padding: 7px 16px; cursor: pointer; font-family: var(--fb);
      font-weight: 600; font-size: var(--t-sm); }
    .comps button.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }

    /* La caja y las filas salen de styles.css; aquí, las columnas y lo propio. */
    .fila { grid-template-columns: 52px 1.9fr 42px 40px 40px 40px 66px 74px 92px; }
    /* Los tres primeros cobran el premio: el papel se tiñe, sin medallas. */
    .fila.podio { background: var(--accent-soft); }
    .puesto { display: flex; align-items: center; gap: 8px; }
    .marca { width: 3px; height: 20px; border-radius: 2px; flex: 0 0 auto; }
    .nm { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sec { color: var(--text2); }
    .pts { font-weight: 700; }
    .ben { font-weight: 700; color: var(--good); }
    .ben.neg { color: var(--bad); }
    .ben small { font-size: var(--t-xs); opacity: .75; margin-left: 1px; }
    .nota { margin: 12px 2px 0; font-size: var(--t-xs); color: var(--text2); }

    .bracket { display: flex; flex-direction: column; gap: 20px; }
    .ronda { display: flex; flex-direction: column; gap: 10px; }
    .ronda h2 { color: var(--accent); }
    .llave { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); padding: 13px 15px; }
    .eq { display: flex; align-items: center; gap: 10px; padding: 5px 0; color: var(--text2); }
    .eq .nm { flex: 1; font-size: var(--t-md); }
    .eq .ag { font-size: var(--t-lg); font-weight: 700; }
    .eq.gana { color: var(--text); }
    .eq.gana .ag { color: var(--accent); }
    .legs { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 9px; padding-top: 9px; border-top: 1px solid var(--line); }
    .leg { font-size: var(--t-xs); color: var(--text2); }
    .muted { color: var(--text2); } .err { color: var(--bad); }

    @media (max-width: 860px) {
      /* En el móvil solo caben los datos que deciden la liga. */
      .fila { grid-template-columns: 44px 1fr 56px 84px; }
      .fila > :nth-child(3), .fila > :nth-child(4), .fila > :nth-child(5),
      .fila > :nth-child(6), .fila > :nth-child(8) { display: none; }
    }
  `],
})
export class ClasificacionComponent implements OnInit {
  secciones: SubnavItem[] = [
    { path: '/clasificacion', label: 'Clasificación' },
    { path: '/premios', label: 'Premios' },
  ];
  competiciones = signal<Competicion[]>([]);
  competicionId = signal('');
  filas = signal<FilaClasificacion[]>([]);
  rondas = signal<RondaEliminatoria[]>([]);
  ranking = signal<{ nombre: string; beneficio: number }[]>([]);
  modo = signal<'tabla' | 'bracket'>('tabla');
  cargando = signal(true);
  error = signal('');

  /** Cuenta de qué competición y hasta qué jornada se está mirando. */
  subtitulo = computed(() => {
    const c = this.competiciones().find((x) => x.id === this.competicionId());
    const pj = Math.max(0, ...this.filas().map((f) => f.partidos_jugados || 0));
    const eti = c ? this.etiqueta(c.tipo) : 'Liga';
    if (this.modo() === 'bracket') return `${eti} · eliminatorias a doble partido.`;
    return pj ? `${eti} · tras ${pj} ${pj === 1 ? 'jornada' : 'jornadas'}.` : `${eti} · aún sin jornadas jugadas.`;
  });

  constructor(private falm: FalmService) {}

  color(n?: string) { return colorEquipo(n); }
  etiqueta(t: string) { return t === 'CHAMPIONS' ? 'Champions' : t === 'CLAUSURA' ? 'Clausura' : 'Liga'; }
  beneficio(nombre?: string) { return this.ranking().find((r) => r.nombre === nombre)?.beneficio ?? 0; }

  async ngOnInit() {
    try {
      const todas: Competicion[] = await this.falm.competiciones();
      const orden = { LIGA: 0, CHAMPIONS: 1, CLAUSURA: 2 } as Record<string, number>;
      todas.sort((a, b) => (orden[a.tipo] ?? 9) - (orden[b.tipo] ?? 9));
      // Champions y Clausura existen desde el primer día pero aún no tienen
      // calendario: hasta que lo tengan, no se enseñan y aquí solo hay Liga.
      const calendarios = await Promise.all(todas.map((c) => this.falm.jornadas(c.id).catch(() => [])));
      const comps = todas.filter((c, i) => calendarios[i].length > 0);
      const vistas = comps.length ? comps : todas.slice(0, 1);
      this.competiciones.set(vistas);
      const liga = vistas.find((c) => c.tipo === 'LIGA') ?? vistas[0];
      if (liga) { this.competicionId.set(liga.id); await this.cargar(liga); }
      else this.cargando.set(false);
      this.falm.rankingBeneficios().then((r) => this.ranking.set(r)).catch(() => {});
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
