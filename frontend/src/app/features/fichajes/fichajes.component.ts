import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { ActivoLibre, Equipo, FalmService, JornadaFalm } from '../../core/falm.service';
import { PlayerCardComponent } from '../../shared/player-card.component';
import { FichaService } from '../../shared/ficha.service';

const POS = ['PORTERO', 'DEFENSA', 'MEDIO', 'DELANTERO'];

/** Petición de fichaje semanal: elegir hasta 2 objetivos por prioridad, en cromos. */
@Component({
  selector: 'app-fichajes',
  standalone: true,
  imports: [FormsModule, PlayerCardComponent],
  template: `
    <h1>🔁 Fichajes</h1>

    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else if (error()) {
      <p class="err">{{ error() }}</p>
    } @else {
      <div class="peticion card rise">
        <div class="slots">
          @for (s of [1, 2]; track s) {
            <div class="slot" [class.lleno]="sel(s)">
              <span class="pr">{{ s }}ª opción</span>
              @if (sel(s); as a) {
                <div class="mini">
                  @if (a.foto) { <img [src]="a.foto" alt="" (error)="$any($event.target).style.display='none'" /> }
                  <span class="mn">{{ a.nombre }}</span>
                  <button class="rm" (click)="quitar(s)">✕</button>
                </div>
              } @else {
                <span class="vacio">{{ s === 1 ? 'toca un jugador' : 'opcional' }}</span>
              }
            </div>
          }
        </div>
        <button class="enviar btn" [disabled]="!p1() || enviando()" (click)="enviar()">
          {{ enviando() ? '…' : 'Enviar petición' }}
        </button>
      </div>

      @if (aviso()) { <p class="aviso">{{ aviso() }}</p> }

      <input class="buscar" type="search" placeholder="Buscar jugador o club…"
             [ngModel]="texto()" (ngModelChange)="texto.set($event); limite.set(24)" />

      <div class="filtros">
        <button [class.on]="!posFiltro()" (click)="posFiltro.set('')">Todos</button>
        @for (p of pos; track p) {
          <button class="pos" [class]="abr(p)" [class.on]="posFiltro() === p" (click)="togglePos(p)">{{ abr(p) }}</button>
        }
      </div>

      @if (visibles().length === 0) {
        <p class="muted">No hay jugadores para ese filtro.</p>
      } @else {
        <p class="total faint num">{{ visibles().length }} jugadores libres</p>
        <div class="grid">
          @for (a of visibles().slice(0, limite()); track a.activo_id) {
            <falm-player-card class="pick" [class.sel]="prioridadDe(a)" (click)="toggle(a)"
              [nombre]="a.nombre" [club]="a.club" [escudo]="a.escudo ?? null"
              [foto]="a.foto ?? null" [posicion]="a.posicion" [precio]="a.precio_mercado">
              @if (prioridadDe(a); as pr) { <span class="badge">{{ pr }}ª</span> }
              @if (a.ext_id) { <button class="info-b" (click)="verFicha(a, $event)">ⓘ</button> }
            </falm-player-card>
          }
        </div>
        @if (visibles().length > limite()) {
          <button class="mas" (click)="limite.set(limite() + 24)">Ver más ({{ visibles().length - limite() }})</button>
        }
      }
    }
  `,
  styles: [`
    h1 { margin: 0 0 14px; }
    .peticion { display: flex; align-items: center; gap: 14px; padding: 14px; margin-bottom: 12px; flex-wrap: wrap; }
    .slots { display: flex; gap: 12px; flex: 1; min-width: 220px; }
    .slot { flex: 1; display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; border-radius: 12px;
      border: 1px dashed var(--border); min-width: 0; }
    .slot.lleno { border-style: solid; border-color: var(--primary); background: rgba(0,230,118,.06); }
    .slot .pr { font-size: .68rem; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
    .mini { display: flex; align-items: center; gap: 7px; min-width: 0; }
    .mini img { width: 26px; height: 26px; border-radius: 7px; object-fit: cover; flex: 0 0 auto; }
    .mn { font-weight: 700; font-size: .84rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rm { margin-left: auto; border: none; background: rgba(251,113,133,.16); color: var(--bad);
      border-radius: 6px; cursor: pointer; padding: 1px 7px; flex: 0 0 auto; }
    .vacio { color: var(--faint); font-size: .82rem; }
    .enviar { flex: 0 0 auto; }
    .enviar:disabled { opacity: .5; cursor: not-allowed; }
    .aviso { background: rgba(0,230,118,.08); border: 1px solid rgba(0,230,118,.22); color: var(--primary);
      padding: 10px 14px; border-radius: 10px; }
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
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
    .pick { position: relative; }
    .pick.sel { outline: 2px solid var(--primary); outline-offset: 1px; border-radius: 16px; }
    .badge { position: absolute; top: 8px; left: 8px; z-index: 2; background: var(--primary); color: var(--primary-ink);
      font-weight: 900; font-size: .68rem; padding: 2px 7px; border-radius: 999px; box-shadow: 0 2px 6px rgba(0,0,0,.4); }
    .info-b { position: absolute; bottom: 8px; right: 8px; z-index: 2; width: 24px; height: 24px; border-radius: 50%;
      border: 1px solid var(--border); background: var(--surface-2); color: var(--muted); cursor: pointer; font-size: .78rem; }
    .mas { display: block; margin: 18px auto 0; background: var(--surface); border: 1px solid var(--border);
      color: var(--ink); border-radius: 12px; padding: 11px 22px; cursor: pointer; font-weight: 700; }
    .muted { color: var(--muted); } .err { color: var(--bad); }
  `],
})
export class FichajesComponent implements OnInit {
  pos = POS;
  equipo = signal<Equipo | null>(null);
  jornada = signal<JornadaFalm | null>(null);
  mercado = signal<ActivoLibre[]>([]);
  p1 = signal<ActivoLibre | null>(null);
  p2 = signal<ActivoLibre | null>(null);
  texto = signal('');
  posFiltro = signal('');
  limite = signal(24);
  cargando = signal(true);
  enviando = signal(false);
  error = signal('');
  aviso = signal('');

  visibles = computed(() => {
    const f = this.texto().trim().toLowerCase();
    const p = this.posFiltro();
    return this.mercado().filter((a) =>
      (!p || a.posicion === p) &&
      (!f || a.nombre.toLowerCase().includes(f) || a.club.toLowerCase().includes(f))
    );
  });

  constructor(private falm: FalmService, public ficha: FichaService) {}

  abr(p: string) { return ({ PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' } as Record<string, string>)[p] ?? p; }
  sel(s: number) { return s === 1 ? this.p1() : this.p2(); }
  prioridadDe(a: ActivoLibre): number | null {
    if (this.p1()?.activo_id === a.activo_id) return 1;
    if (this.p2()?.activo_id === a.activo_id) return 2;
    return null;
  }
  togglePos(p: string) { this.posFiltro.set(this.posFiltro() === p ? '' : p); this.limite.set(24); }

  /** Toca un cromo: si ya está elegido lo quita; si no, ocupa la 1ª prioridad libre. */
  toggle(a: ActivoLibre) {
    const pr = this.prioridadDe(a);
    if (pr === 1) { this.p1.set(null); return; }
    if (pr === 2) { this.p2.set(null); return; }
    if (!this.p1()) this.p1.set(a);
    else if (!this.p2()) this.p2.set(a);
    else this.p1.set(a); // ambas llenas: reemplaza la 1ª
  }
  quitar(s: number) { (s === 1 ? this.p1 : this.p2).set(null); }

  verFicha(a: ActivoLibre, ev: Event) {
    ev.stopPropagation();
    if (a.ext_id) this.ficha.open({ id: a.ext_id, nombre: a.nombre, equipo: a.club, escudo: a.escudo ?? '', foto: a.foto ?? '', posicion: a.posicion });
  }

  async ngOnInit() {
    try {
      const [eq, jor, merc] = await Promise.all([
        this.falm.miEquipo(), this.falm.jornadaActualLiga(), this.falm.mercadoLibre(),
      ]);
      this.equipo.set(eq); this.jornada.set(jor); this.mercado.set(merc);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error cargando fichajes');
    } finally {
      this.cargando.set(false);
    }
  }

  async enviar() {
    this.aviso.set(''); this.error.set('');
    if (environment.devEquipoNombre) {
      this.aviso.set('Modo demo: la petición no se envía hasta que actives tu cuenta (login). El formulario es totalmente funcional.');
      return;
    }
    const eq = this.equipo(); const jor = this.jornada();
    if (!eq || !jor || !this.p1()) return;
    const opciones = [{ activo_id: this.p1()!.activo_id, prioridad: 1 }];
    if (this.p2()) opciones.push({ activo_id: this.p2()!.activo_id, prioridad: 2 });
    this.enviando.set(true);
    try {
      await this.falm.crearPeticion(eq.id, jor.id, opciones);
      this.aviso.set('✅ Petición enviada.');
      this.p1.set(null); this.p2.set(null);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al enviar');
    } finally {
      this.enviando.set(false);
    }
  }
}
