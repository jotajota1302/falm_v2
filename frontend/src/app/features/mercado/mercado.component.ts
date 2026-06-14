import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ActivoLibre, FalmService, PuntosJugador } from '../../core/falm.service';
import { FutCardComponent } from '../../shared/fut-card.component';
import { FichaService } from '../../shared/ficha.service';

const POS = ['PORTERO', 'DEFENSA', 'MEDIO', 'DELANTERO'];

/** Mercado de fichables libres, en cromos, con buscador y filtro por posición. */
@Component({
  selector: 'app-mercado',
  standalone: true,
  imports: [FormsModule, RouterLink, FutCardComponent],
  template: `
    <div class="cab">
      <h1>🛒 Mercado</h1>
      <div class="cab-acc">
        <a class="btn ghost" routerLink="/intercambios">🤝 Intercambios</a>
        <a class="btn" routerLink="/fichajes">Pedir fichaje</a>
      </div>
    </div>

    <input class="buscar" type="search" placeholder="Buscar jugador o club…"
           [ngModel]="texto()" (ngModelChange)="texto.set($event); limite.set(24)" />

    <div class="filtros">
      <button [class.on]="!posFiltro()" (click)="posFiltro.set('')">Todos</button>
      @for (p of pos; track p) {
        <button class="pos" [class]="abr(p)" [class.on]="posFiltro() === p" (click)="togglePos(p)">{{ abr(p) }}</button>
      }
    </div>

    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else if (error()) {
      <p class="err">{{ error() }}</p>
    } @else if (visibles().length === 0) {
      <p class="muted">No hay jugadores para ese filtro.</p>
    } @else {
      <p class="total faint num">{{ visibles().length }} jugadores libres</p>
      <div class="grid">
        @for (a of visibles().slice(0, limite()); track a.activo_id) {
          <falm-fut-card
            (click)="abrir(a)"
            [nombre]="a.nombre" [escudo]="a.escudo ?? null"
            [foto]="a.foto ?? null" [posicion]="a.posicion" [media]="mediaDe(a)" [stats]="statsDe(a)" />
        }
      </div>
      @if (visibles().length > limite()) {
        <button class="mas" (click)="limite.set(limite() + 24)">Ver más ({{ visibles().length - limite() }})</button>
      }
    }
  `,
  styles: [`
    .cab { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
    .cab-acc { display: flex; gap: 8px; }
    .btn.ghost { background: var(--surface-2); color: var(--ink); border: 1px solid var(--border); }
    h1 { margin: 0; }
    .buscar { width: 100%; margin-bottom: 12px; }
    .filtros { display: flex; gap: 7px; margin-bottom: 16px; flex-wrap: wrap; }
    .filtros button { background: var(--surface); border: 1px solid var(--border); color: var(--muted);
      border-radius: 999px; padding: 6px 13px; cursor: pointer; font-weight: 700; font-size: .8rem; }
    .filtros button.on { color: var(--ink); border-color: var(--border-strong); background: var(--surface-2); }
    .filtros button.pos.on.POR { box-shadow: inset 0 0 0 1px var(--pos-POR); color: var(--pos-POR); }
    .filtros button.pos.on.DEF { box-shadow: inset 0 0 0 1px var(--pos-DEF); color: var(--pos-DEF); }
    .filtros button.pos.on.MED { box-shadow: inset 0 0 0 1px var(--pos-MED); color: var(--pos-MED); }
    .filtros button.pos.on.DEL { box-shadow: inset 0 0 0 1px var(--pos-DEL); color: var(--pos-DEL); }
    .total { margin: 0 0 12px; font-size: .8rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(106px, 1fr)); gap: 10px; }
    .mas { display: block; margin: 18px auto 0; background: var(--surface); border: 1px solid var(--border);
      color: var(--ink); border-radius: 12px; padding: 11px 22px; cursor: pointer; font-weight: 700; }
    .muted { color: var(--muted); } .err { color: #fb7185; }
  `],
})
export class MercadoComponent implements OnInit {
  pos = POS;
  todos = signal<ActivoLibre[]>([]);
  acum = signal<Record<number, PuntosJugador>>({});
  texto = signal('');
  posFiltro = signal('');
  limite = signal(24);
  cargando = signal(true);
  error = signal('');

  visibles = computed(() => {
    const f = this.texto().trim().toLowerCase();
    const p = this.posFiltro();
    return this.todos().filter((a) =>
      (!p || a.posicion === p) &&
      (!f || a.nombre.toLowerCase().includes(f) || a.club.toLowerCase().includes(f))
    );
  });

  constructor(private falm: FalmService, public ficha: FichaService) {}
  abr(p: string) { return ({ PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' } as Record<string, string>)[p] ?? p; }
  abrir(a: ActivoLibre) {
    if (a.ext_id) this.ficha.open({ id: a.ext_id, nombre: a.nombre, equipo: a.club, escudo: a.escudo ?? '', foto: a.foto ?? '', posicion: a.posicion });
  }
  togglePos(p: string) { this.posFiltro.set(this.posFiltro() === p ? '' : p); this.limite.set(24); }

  mediaDe(a: ActivoLibre) { return a.ext_id != null ? Number(this.acum()[a.ext_id]?.puntosTotales ?? 0) : 0; }
  statsDe(a: ActivoLibre): { ico: string; n: number | string }[] {
    const s = a.ext_id != null ? this.acum()[a.ext_id] : null;
    const out: { ico: string; n: number | string }[] = [{ ico: '💰', n: a.precio_mercado + 'M' }];
    if (s) {
      if (s.goles) out.push({ ico: '⚽', n: s.goles });
      else if (s.asistencias) out.push({ ico: '🅰', n: s.asistencias });
    }
    return out.slice(0, 2);
  }

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
