import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ActivoLibre, FalmService, PuntosJugador } from '../../core/falm.service';
import { FichaService } from '../../shared/ficha.service';

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
        <p class="sub">Jugadores sin dueño. Toca una fila para ver la ficha; las peticiones se envían desde Fichajes.</p>
      </div>
      <div class="acc">
        <a class="btn-sec" routerLink="/intercambios">Intercambios</a>
        <a class="btn" routerLink="/fichajes">Pedir fichaje</a>
      </div>
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
          <span>Pos</span><span>Jugador</span><span>Club</span>
          <button class="ord der" [class.on]="orden() === 'pts'" (click)="ordenar('pts')">Pts</button>
          <button class="ord der" [class.on]="orden() === 'precio'" (click)="ordenar('precio')">Precio</button>
        </div>

        @if (visibles().length === 0) {
          <p class="vacio muted">No hay jugadores para ese filtro.</p>
        } @else {
          @for (a of visibles().slice(0, limite()); track a.activo_id) {
            <button class="fila" (click)="abrir(a)">
              <span class="pos" [class]="abr(a.posicion)">{{ abr(a.posicion) }}</span>
              <span class="nom">{{ a.nombre }}</span>
              <span class="club">
                @if (a.escudo) { <img [src]="a.escudo" alt="" loading="lazy" /> }
                {{ a.club }}
              </span>
              <span class="der num">{{ ptsDe(a) }}</span>
              <span class="der num precio">{{ a.precio_mercado }}</span>
            </button>
          }
        }
      </section>

      <div class="pie">
        <span class="muted num">{{ visibles().length }} libres · {{ mostrados() }} en pantalla</span>
        @if (visibles().length > limite()) {
          <button class="btn-sec" (click)="limite.set(limite() + 30)">Ver 30 más</button>
        }
      </div>
    }
  `,
  styles: [`
    .phead { display: flex; align-items: flex-end; justify-content: space-between;
      gap: 20px; flex-wrap: wrap; margin-bottom: 18px; }
    .phead .sub { margin: 5px 0 0; color: var(--text2); font-size: 13.5px; max-width: 62ch; }
    .acc { display: flex; gap: 8px; }

    .tabla { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; overflow: hidden; }

    /* Filtros y buscador viven en la cabecera de la tabla, no sueltos sobre el papel. */
    .barra { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      padding: 13px 18px; border-bottom: 1px solid var(--line); }
    .barra .lb { font-size: 9px; font-weight: 700; letter-spacing: .16em;
      text-transform: uppercase; color: var(--text2); margin-right: 2px; }
    .barra button { background: var(--surface); border: 1px solid var(--line); color: var(--text2);
      border-radius: var(--pill); padding: 6px 14px; cursor: pointer; font-weight: 600; font-size: 12px;
      font-family: var(--fb); }
    .barra button.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
    .barra button.pos-f.on.POR { background: var(--por); border-color: var(--por); }
    .barra button.pos-f.on.DEF { background: var(--def); border-color: var(--def); }
    .barra button.pos-f.on.MED { background: var(--med); border-color: var(--med); }
    .barra button.pos-f.on.DEL { background: var(--del); border-color: var(--del); }
    .barra .buscar { margin-left: auto; flex: 0 1 250px; padding: 7px 13px; font-size: 13px; border-radius: var(--pill); }

    .fila { width: 100%; display: grid; align-items: center; gap: 10px;
      grid-template-columns: 46px 1.7fr 150px 74px 82px;
      padding: 10px 18px; border: none; border-bottom: 1px solid var(--line);
      background: transparent; text-align: left; font-size: 13px; color: var(--text);
      font-family: var(--fb); cursor: pointer; }
    .fila:last-child { border-bottom: none; }
    .fila:not(.cab):hover { background: var(--surface2); }
    .fila.cab { cursor: default; padding: 11px 18px; }
    .fila.cab > span, .ord { font-size: 9px; font-weight: 700; letter-spacing: .16em;
      text-transform: uppercase; color: var(--text2); }
    .ord { background: none; border: none; padding: 0; cursor: pointer; font-family: var(--fb); }
    .ord.on { color: var(--accent); }
    .der { text-align: right; }
    .nom { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .club { display: flex; align-items: center; gap: 6px; color: var(--text2); font-size: 11.5px;
      letter-spacing: .06em; text-transform: uppercase;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .club img { width: 16px; height: 16px; object-fit: contain; flex: 0 0 auto; }
    .precio { color: var(--accent); font-weight: 700; }
    .vacio { padding: 22px 18px; margin: 0; font-size: 13px; }

    .pie { display: flex; align-items: center; justify-content: space-between;
      gap: 12px; margin-top: 14px; flex-wrap: wrap; }
    .pie .muted { font-size: 12px; }

    @media (max-width: 760px) {
      .fila { grid-template-columns: 40px 1fr 58px 66px; }
      .fila > :nth-child(3) { display: none; }
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
  orden = signal<'pts' | 'precio'>('precio');
  limite = signal(30);
  cargando = signal(true);
  error = signal('');

  visibles = computed(() => {
    const f = this.texto().trim().toLowerCase();
    const p = this.posFiltro();
    const o = this.orden();
    return this.todos()
      .filter((a) =>
        (!p || a.posicion === p) &&
        (!f || a.nombre.toLowerCase().includes(f) || a.club.toLowerCase().includes(f)))
      .sort((a, b) => o === 'pts'
        ? this.ptsDe(b) - this.ptsDe(a)
        : Number(b.precio_mercado ?? 0) - Number(a.precio_mercado ?? 0));
  });

  mostrados = computed(() => Math.min(this.limite(), this.visibles().length));

  constructor(private falm: FalmService, public ficha: FichaService) {}
  abr(p: string) { return ({ PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' } as Record<string, string>)[p] ?? p; }
  abrir(a: ActivoLibre) {
    if (a.ext_id) this.ficha.open({ id: a.ext_id, nombre: a.nombre, equipo: a.club, escudo: a.escudo ?? '', foto: a.foto ?? '', posicion: a.posicion });
  }
  togglePos(p: string) { this.posFiltro.set(this.posFiltro() === p ? '' : p); this.limite.set(30); }
  ordenar(o: 'pts' | 'precio') { this.orden.set(o); this.limite.set(30); }

  ptsDe(a: ActivoLibre) { return a.ext_id != null ? Number(this.acum()[a.ext_id]?.puntosTotales ?? 0) : 0; }

  async ngOnInit() {
    try {
      const [libres, acum] = await Promise.all([this.falm.mercadoLibre(), this.falm.puntuacionesAcumuladas()]);
      this.todos.set(libres);
      const m: Record<number, PuntosJugador> = {};
      for (const p of acum) m[p.jugador.id] = p;
      this.acum.set(m);
    } catch (e: any) { this.error.set(e?.message ?? 'Error cargando el mercado'); }
    finally { this.cargando.set(false); }
  }
}
