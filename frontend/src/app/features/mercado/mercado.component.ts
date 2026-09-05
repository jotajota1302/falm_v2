import { Component, HostListener, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ActivoLibre, ContextoActivo, FalmService, PuntosJugador } from '../../core/falm.service';
import { FichaService } from '../../shared/ficha.service';
import { carasDePorterias } from '../../shared/caras-libres';

const POS = ['PORTERO', 'DEFENSA', 'MEDIO', 'DELANTERO'];

/** Mercado de jugadores libres: tabla ordenable con buscador y filtro por posición. */
@Component({
  selector: 'app-mercado',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <header class="phead">
      <div>
        <h1>Mercado</h1>
        <p class="sub">Jugadores libres. Toca una fila para ver su ficha.</p>
      </div>
      <a class="btn" routerLink="/fichajes">Pedir fichaje</a>
    </header>

    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else if (error()) {
      <p class="err">{{ error() }}</p>
    } @else {
      <section class="tabla">
        <div class="barra">
          <span class="lb">Libres</span>
          <button [class.on]="!posFiltro()" (click)="posFiltro.set(''); limite.set(30)">Todos</button>
          @for (p of pos; track p) {
            <button class="pos-f" [class]="abr(p)" [class.on]="posFiltro() === p" (click)="togglePos(p)">{{ abr(p) }}</button>
          }
          <input class="buscar" type="search" placeholder="Buscar jugador o club…"
                 [ngModel]="texto()" (ngModelChange)="texto.set($event); limite.set(30)" />
        </div>

        <div class="fila cab">
          <span>Pos</span><span></span><span>Jugador</span><span>Club</span>
          <button class="ord der" [class.on]="orden() === 'pts'" (click)="ordenar('pts')">Pts</button>
        </div>

        @if (visibles().length === 0) {
          <p class="vacio muted">No hay jugadores para ese filtro.</p>
        } @else {
          @for (a of visibles().slice(0, limite()); track a.activo_id) {
            <button class="fila" (click)="abrir(a)">
              <span class="pos" [class]="abr(a.posicion)">{{ abr(a.posicion) }}</span>
              @if (foto(a)) {
                <img class="fo" [src]="foto(a)" alt="" loading="lazy" (error)="sinFoto(a)" />
              } @else if (a.escudo) {
                <img class="fo es" [src]="a.escudo" alt="" loading="lazy" />
              } @else { <span class="fo"></span> }
              <span class="nom">
                {{ a.nombre }}
                @if (parte(a.activo_id); as e) { <b class="parte" [class]="e.clase" [title]="e.title">{{ e.eti }}</b> }
              </span>
              <span class="club">
                @if (a.escudo) { <img [src]="a.escudo" alt="" loading="lazy" /> }
                {{ a.club }}
              </span>
              <span class="pts num" [class.cero]="!ptsDe(a)">{{ ptsDe(a) }}</span>
            </button>
          }
        }
      </section>

      <div class="pie">
        <span class="muted">{{ visibles().length }} libres · {{ mostrados() }} en pantalla</span>
        @if (visibles().length > limite()) {
          <button class="btn-sec" (click)="limite.set(limite() + 30)">Ver 30 más</button>
        }
      </div>
    }
  `,
  styles: [`
    .phead { display: flex; align-items: flex-end; justify-content: space-between;
      gap: 20px; flex-wrap: wrap; margin-bottom: 18px; }
    .phead .sub { margin: 5px 0 0; color: var(--text2); font-size: var(--t-sm); max-width: 62ch; }

    /* La caja y las filas salen de styles.css; aquí solo las columnas y lo propio. */
    .barra .lb { font-size: var(--t-xs); font-weight: 700; letter-spacing: .16em;
      text-transform: uppercase; color: var(--text2); margin-right: 2px; }
    .barra button { background: var(--surface); border: 1px solid var(--line); color: var(--text2);
      border-radius: var(--pill); padding: 6px 14px; cursor: pointer; font-weight: 600; font-size: var(--t-sm);
      font-family: var(--fb); }
    .barra button.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
    .barra button.pos-f.on.POR { background: var(--por); border-color: var(--por); }
    .barra button.pos-f.on.DEF { background: var(--def); border-color: var(--def); }
    .barra button.pos-f.on.MED { background: var(--med); border-color: var(--med); }
    .barra button.pos-f.on.DEL { background: var(--del); border-color: var(--del); }
    .barra .buscar { margin-left: auto; flex: 0 1 250px; padding: 7px 13px; font-size: var(--t-sm); border-radius: var(--pill); }

    .fila { grid-template-columns: 46px 26px 1.9fr 170px 60px; padding: 7px 18px; }
    .ord { background: none; border: none; padding: 0; cursor: pointer; font-family: var(--fb);
      font-size: var(--t-xs); font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
      color: var(--text2); }
    .ord.on { color: var(--accent); }
    .nom { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* Misma cara y mismo escudo que en Inicio: retrato redondo, y el escudo del
       club sobre un disco porque los casi blancos se perdían sobre el papel. */
    .fo { width: 26px; height: 26px; border-radius: 50%; object-fit: cover;
      object-position: top center; background: var(--surface2); }
    .fo.es { object-fit: contain; padding: 3px; border: 1px solid var(--line); }
    .club { display: flex; align-items: center; gap: 7px; color: var(--text2);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .club img { width: 18px; height: 18px; object-fit: contain; flex: 0 0 auto; }

    .pts { font-family: var(--fm); text-align: right; }
    /* Quien aún no ha puntuado lleva un cero, no un hueco: gris, pero un número
       como los demás, para que la columna se lea de arriba abajo. */
    .pts.cero { color: var(--text2); }
    .vacio { padding: 22px 18px; margin: 0; font-size: var(--t-sm); }

    .pie { display: flex; align-items: center; justify-content: space-between;
      gap: 12px; margin-top: 14px; flex-wrap: wrap; }
    .pie .muted { font-size: var(--t-sm); }

    @media (max-width: 760px) {
      /* Sin sitio para el club: se queda el escudo pegado al retrato. */
      .fila { grid-template-columns: 42px 26px 1fr 52px; padding: 7px 13px; }
      .fila > :nth-child(4) { display: none; }
      /* Fuera el rótulo "Libres": se comía los 49px que le faltaban a DEL para
         no caerse a una segunda línea, y el título de la pantalla ya lo dice. */
      .barra .lb { display: none; }
      .barra .buscar { margin-left: 0; flex: 1 1 100%; }
    }
  `],
})
export class MercadoComponent implements OnInit {
  pos = POS;
  todos = signal<ActivoLibre[]>([]);
  acum = signal<Record<number, PuntosJugador>>({});
  texto = signal('');
  posFiltro = signal('');
  orden = signal<'pts'>('pts');
  limite = signal(30);
  cargando = signal(true);
  error = signal('');
  estados = signal<Record<string, ContextoActivo>>({});
  private caras = signal<Record<string, string>>({});
  private rotas = signal<Set<string>>(new Set());


  /** Quién está tocado. Es un aviso: no cambia nada de lo que puedas hacer. */
  parte(activoId: string): { eti: string; clase: string; title: string } | null {
    const c = this.estados()[activoId];
    if (!c?.estado) return null;
    const eti = c.estado === 'SANCIONADO' ? 'Sancionado'
      : c.estado === 'DUDA' ? 'Duda' : 'Lesionado';
    return { eti, clase: c.estado.toLowerCase(),
             title: [c.detalle, c.vuelve].filter(Boolean).join(' · ') || eti };
  }

  visibles = computed(() => {
    const f = this.texto().trim().toLowerCase();
    const p = this.posFiltro();
    const o = this.orden();
    return this.todos()
      .filter((a) =>
        (!p || a.posicion === p) &&
        (!f || a.nombre.toLowerCase().includes(f) || a.club.toLowerCase().includes(f)))
      // Con los puntos empatados (pretemporada) manda el alfabético, que si no
      // la lista sale agrupada por posición sin querer.
      .sort((a, b) => (this.ptsDe(b) - this.ptsDe(a))
        || a.nombre.localeCompare(b.nombre, 'es'));
  });

  mostrados = computed(() => Math.min(this.limite(), this.visibles().length));

  /** Al llegar al final de la lista entran las siguientes 30, sin buscar el botón. */
  @HostListener('window:scroll')
  alDesplazar() {
    if (this.visibles().length <= this.limite()) return;
    const e = document.documentElement;
    if (e.scrollHeight - e.scrollTop - e.clientHeight < 700) this.limite.update((n) => n + 30);
  }

  constructor(private falm: FalmService, public ficha: FichaService) {}
  abr(p: string) { return ({ PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' } as Record<string, string>)[p] ?? p; }
  abrir(a: ActivoLibre) {
    if (a.ext_id) this.ficha.open({ id: a.ext_id, nombre: a.nombre, equipo: a.club, escudo: a.escudo ?? '', foto: a.foto ?? '', posicion: a.posicion });
  }
  togglePos(p: string) { this.posFiltro.set(this.posFiltro() === p ? '' : p); this.limite.set(30); }
  ordenar(o: 'pts') { this.orden.set(o); this.limite.set(30); }

  ptsDe(a: ActivoLibre) { return a.ext_id != null ? Number(this.acum()[a.ext_id]?.puntosTotales ?? 0) : 0; }

  /**
   * La cara del activo. Una portería no tiene retrato propio, así que lleva la
   * del portero de ese club: al ficharla fichas a quien pare ese día.
   */
  foto(a: ActivoLibre): string | null {
    if (this.rotas().has(a.activo_id)) return null;
    return a.foto ?? (a.club_id ? this.caras()[a.club_id] ?? null : null);
  }
  /** Si el archivo no carga, esa fila se queda con el escudo. */
  sinFoto(a: ActivoLibre) { const r = new Set(this.rotas()); r.add(a.activo_id); this.rotas.set(r); }

  async ngOnInit() {
    try {
      const [libres, acum] = await Promise.all([this.falm.mercadoLibre(), this.falm.puntuacionesAcumuladas()]);
      // Un extra: si falla, el mercado se ve igual.
      this.falm.estadosActivos().then((e) => this.estados.set(e)).catch(() => {});
      this.todos.set(libres);
      const m: Record<number, PuntosJugador> = {};
      for (const p of acum) m[p.jugador.id] = p;
      this.acum.set(m);
      this.caras.set(await carasDePorterias(this.falm, libres));
    } catch (e: any) { this.error.set(e?.message ?? 'Error cargando el mercado'); }
    finally { this.cargando.set(false); }
  }
}
