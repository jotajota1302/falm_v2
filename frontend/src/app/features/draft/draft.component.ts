import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivoLibre } from '../../core/falm.service';
import { DraftService, MIN_PORTERIAS } from './draft.service';

const POS = ['PORTERO', 'DEFENSA', 'MEDIO', 'DELANTERO'];
const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/**
 * Tablero del draft en vivo. El catálogo se carga entero una vez y se filtra en
 * cliente, para que buscar no dependa de la red justo cuando te toca elegir.
 */
@Component({
  selector: 'app-draft',
  standalone: true,
  imports: [FormsModule],
  providers: [DraftService],
  template: `
    @if (d.cargando()) {
      <p class="muted">Cargando draft…</p>
    } @else if (d.error()) {
      <p class="err">{{ d.error() }}</p>
    } @else if (!d.draft()) {
      <p class="muted">No hay ningún draft activo.</p>
    } @else {
      @if (!d.conectado()) {
        <div class="aviso">Reconectando… los fichajes pueden tardar unos segundos en aparecer.</div>
      }

      <div class="turno" [class.mio]="d.esMiTurno()">
        @if (d.esMiTurno()) {
          <strong>TE TOCA</strong>
        } @else {
          <span>Turno de <strong>{{ nombreEquipo(d.turno()?.equipo_falm_id) }}</strong></span>
          @if (d.picksHastaMiTurno() > 0) {
            <span class="faint">· te toca en {{ d.picksHastaMiTurno() }}</span>
          }
        }
        <span class="faint num">
          Pick {{ d.draft()!.picks_hechos + 1 }}/{{ d.draft()!.picks_totales }}
          · Ronda {{ d.turno()?.ronda ?? '—' }}
        </span>
        <span class="cupo num">
          {{ d.misPicks().length }}/{{ d.draft()!.total_rondas }}
          · porterías {{ d.misPorterias() }}/{{ minPorterias }}
        </span>
      </div>

      @if (d.debeElegirPorteria()) {
        <div class="aviso">
          Te quedan {{ d.misTurnosRestantes() }} turnos y te faltan
          {{ minPorterias - d.misPorterias() }} porterías: solo puedes elegir portería.
        </div>
      }
      @if (msg()) { <div class="aviso err" (click)="msg.set('')">{{ msg() }}</div> }

      <div class="cols">
        <section class="cat">
          <input class="buscar" type="search" placeholder="Buscar jugador o club…"
                 [ngModel]="texto()" (ngModelChange)="texto.set($event); limite.set(50)" />
          <div class="filtros">
            <button [class.on]="!posFiltro()" (click)="posFiltro.set('')">Todos</button>
            @for (p of pos; track p) {
              <button [class.on]="posFiltro() === p" (click)="togglePos(p)">{{ abr(p) }}</button>
            }
            <button [class.on]="soloLibres()" (click)="soloLibres.set(!soloLibres())">Solo libres</button>
            <button [class.on]="soloCola()" (click)="soloCola.set(!soloCola())">★ Mi cola</button>
          </div>

          <p class="faint num">{{ visibles().length }} jugadores</p>
          <ul class="lista">
            @for (a of visibles().slice(0, limite()); track a.activo_id) {
              <li [class.tomado]="!!tomado(a)">
                <button class="estrella" (click)="alternarCola(a)"
                        [attr.aria-label]="enCola(a) ? 'Quitar de mi cola' : 'Añadir a mi cola'">
                  {{ enCola(a) ? '★' : '☆' }}
                </button>
                <span class="nom">{{ a.nombre }}</span>
                <span class="pos">{{ abr(a.posicion) }}</span>
                <span class="club faint">{{ a.club }}</span>
                @if (tomado(a)) {
                  <span class="por faint">{{ nombreEquipo(tomado(a)) }}</span>
                } @else {
                  <button class="btn" [disabled]="!puedeFichar(a)" (click)="fichar(a)">Fichar</button>
                }
              </li>
            }
          </ul>
          @if (visibles().length > limite()) {
            <button class="mas" (click)="limite.set(limite() + 50)">
              Ver más ({{ visibles().length - limite() }})
            </button>
          }
        </section>

        <aside class="lat">
          <h3>Mi cola ({{ colaVisible().length }})</h3>
          @if (colaVisible().length === 0) {
            <p class="muted">Marca jugadores con ★ para tenerlos aquí.</p>
          } @else {
            <p class="faint num">{{ colaFichados() }} de tus {{ d.cola().length }} ya fichados</p>
            <ol class="cola">
              @for (a of colaVisible(); track a.activo_id) {
                <li [class.tomado]="!!tomado(a)">
                  <span class="nom">{{ a.nombre }}</span>
                  <span class="pos">{{ abr(a.posicion) }}</span>
                  <button (click)="d.moverCola(a.activo_id, -1)" aria-label="Subir">↑</button>
                  <button (click)="d.moverCola(a.activo_id, 1)" aria-label="Bajar">↓</button>
                </li>
              }
            </ol>
          }

          <h3>Orden del draft</h3>
          <ol class="orden">
            @for (o of proximosTurnos(); track o.orden_global) {
              <li [class.ahora]="o.orden_global === d.turno()?.orden_global"
                  [class.yo]="o.equipo_falm_id === d.miEquipoId()">
                {{ nombreEquipo(o.equipo_falm_id) }}
              </li>
            }
          </ol>
        </aside>
      </div>
    }
  `,
  styles: [`
    .turno { position: sticky; top: 0; z-index: 5; display: flex; gap: 10px; align-items: center;
             flex-wrap: wrap; padding: 10px 12px; background: var(--surface-2);
             border: 1px solid var(--border); border-radius: 10px; margin-bottom: 12px; }
    .turno.mio { border-color: #2ecc71; box-shadow: 0 0 0 1px #2ecc71 inset; }
    .turno strong { font-size: 1.1rem; }
    .cupo { margin-left: auto; }
    .aviso { padding: 8px 12px; border-radius: 8px; background: var(--surface-2);
             border: 1px solid var(--border); margin-bottom: 10px; }
    .aviso.err { border-color: #e74c3c; cursor: pointer; }
    .cols { display: grid; grid-template-columns: 1fr 300px; gap: 16px; align-items: start; }
    .buscar { width: 100%; margin-bottom: 8px; }
    .filtros { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
    .filtros button.on { background: var(--acc, #a855f7); color: #fff; }
    .lista { list-style: none; padding: 0; margin: 0; }
    .lista li { display: flex; gap: 10px; align-items: center; padding: 8px 6px;
                border-bottom: 1px solid var(--border); }
    .lista li.tomado { opacity: .45; text-decoration: line-through; }
    .lista .nom { flex: 1; }
    .estrella { background: none; border: 0; cursor: pointer; font-size: 1.1rem; padding: 0 4px; }
    .cola, .orden { list-style: none; padding: 0; margin: 0 0 16px; }
    .cola li, .orden li { display: flex; gap: 6px; align-items: center; padding: 5px 4px;
                          border-bottom: 1px solid var(--border); }
    .cola li.tomado { opacity: .45; text-decoration: line-through; }
    .cola .nom { flex: 1; }
    .orden li.ahora { font-weight: 700; border-left: 3px solid #2ecc71; padding-left: 6px; }
    .orden li.yo { color: var(--acc, #a855f7); }
    .mas { margin-top: 10px; }
    h3 { margin: 0 0 6px; font-size: .95rem; }
    @media (max-width: 860px) { .cols { grid-template-columns: 1fr; } }
  `],
})
export class DraftComponent implements OnInit, OnDestroy {
  pos = POS;
  minPorterias = MIN_PORTERIAS;
  texto = signal('');
  posFiltro = signal('');
  soloLibres = signal(true);
  soloCola = signal(false);
  limite = signal(50);
  msg = signal('');

  constructor(public d: DraftService) {}

  async ngOnInit() {
    await this.d.cargar();
    this.d.suscribir();
    document.addEventListener('visibilitychange', this.alVolver);
  }

  ngOnDestroy() {
    document.removeEventListener('visibilitychange', this.alVolver);
    this.d.desuscribir();
  }

  /** Al volver a la pestaña puede haber picks que no llegaron: reconciliar. */
  private alVolver = () => {
    if (!document.hidden) this.d.refrescarPicks();
  };

  abr(p: string) { return ABR[p] ?? p; }
  togglePos(p: string) { this.posFiltro.set(this.posFiltro() === p ? '' : p); this.limite.set(50); }
  nombreEquipo(id?: string | null) { return id ? this.d.equipoPorId().get(id) ?? '—' : '—'; }
  tomado(a: ActivoLibre) { return this.d.tomadoPor().get(a.activo_id) ?? null; }
  enCola(a: ActivoLibre) { return this.d.cola().some((c) => c.activo_id === a.activo_id); }

  puedeFichar(a: ActivoLibre) {
    if (!this.d.esMiTurno() || this.tomado(a)) return false;
    return !this.d.debeElegirPorteria() || a.tipo === 'DEFENSA';
  }

  readonly visibles = computed(() => {
    const t = this.texto().trim().toLowerCase();
    const p = this.posFiltro();
    const soloL = this.soloLibres();
    const soloC = this.soloCola();
    const cola = new Set(this.d.cola().map((c) => c.activo_id));
    const tom = this.d.tomadoPor();
    return this.d.catalogo().filter((a) => {
      if (p && a.posicion !== p) return false;
      if (soloL && tom.has(a.activo_id)) return false;
      if (soloC && !cola.has(a.activo_id)) return false;
      if (t && !`${a.nombre} ${a.club}`.toLowerCase().includes(t)) return false;
      return true;
    });
  });

  readonly colaVisible = computed(() => {
    const cat = new Map(this.d.catalogo().map((a) => [a.activo_id, a]));
    return this.d.cola()
      .map((c) => cat.get(c.activo_id))
      .filter((a): a is ActivoLibre => !!a);
  });

  readonly colaFichados = computed(() => {
    const tom = this.d.tomadoPor();
    return this.d.cola().filter((c) => tom.has(c.activo_id)).length;
  });

  /** Los 12 próximos turnos, para el panel lateral. */
  readonly proximosTurnos = computed(() => this.d.orden().filter((o) => !o.completado).slice(0, 12));

  async alternarCola(a: ActivoLibre) {
    try {
      if (this.enCola(a)) await this.d.quitarCola(a.activo_id);
      else await this.d.agregarCola(a.activo_id);
    } catch (e: any) {
      this.msg.set(e?.message ?? 'No se pudo actualizar la cola.');
    }
  }

  async fichar(a: ActivoLibre) {
    if (!confirm(`¿Fichar a ${a.nombre}?`)) return;
    this.msg.set('');
    try {
      await this.d.fichar(a.activo_id);
    } catch (e: any) {
      this.msg.set(e?.message ?? 'No se pudo fichar.');
    }
  }
}
