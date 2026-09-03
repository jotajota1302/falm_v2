import { Component, OnDestroy, OnInit, computed, effect, signal } from '@angular/core';
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
    } @else if (!d.miEquipoId()) {
      <p class="muted">
        Tu usuario no tiene ningún equipo asignado en esta temporada.
        Habla con el administrador de la liga.
      </p>
    } @else if (terminado()) {
      <h2>Draft terminado</h2>
      <p class="faint num">
        Tu plantilla: {{ d.misPicks().length }} jugadores · {{ d.misPorterias() }} porterías
      </p>
      <ol class="cola">
        @for (a of misFichados(); track a.activo_id) {
          <li>
            <span class="nom">{{ a.nombre }}</span>
            <span class="pos">{{ abr(a.posicion) }}</span>
            <span class="club faint">{{ a.club }}</span>
          </li>
        }
      </ol>
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
      @if (d.soyGestor() && !d.esMiTurno()) {
        <div class="aviso">
          Modo administrador: al fichar lo harás en nombre de
          <strong>{{ nombreEquipo(d.turno()?.equipo_falm_id) }}</strong>.
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
          <label class="prepick">
            <input type="checkbox" [ngModel]="prePick()" (ngModelChange)="prePick.set($event)" />
            Pre-pick: fichar solo al llegar mi turno
          </label>
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
    /* La barra de turno se queda pegada arriba: es el dato que se mira sin parar. */
    .turno { position: sticky; top: 0; z-index: 5; display: flex; gap: 12px; align-items: center;
             flex-wrap: wrap; padding: 12px 14px; background: var(--surface);
             border: 1px solid var(--line); border-radius: var(--r-sm); margin-bottom: 12px; }
    .turno.mio { border-color: var(--accent); background: var(--accent-soft); }
    .turno strong { font-family: var(--fh); font-size: var(--t-lg); font-weight: 600; text-transform: uppercase; }
    .turno .faint, .cupo { font-size: var(--t-sm); color: var(--text2); }
    .cupo { margin-left: auto; }

    .aviso { padding: 11px 14px; border-radius: var(--r-sm); background: var(--surface);
             border: 1px solid var(--accent-line); color: var(--text); margin-bottom: 10px; font-size: var(--t-sm); }
    .aviso.err { border-color: var(--bad); color: var(--bad); cursor: pointer; }

    .cols { display: grid; grid-template-columns: 1fr 300px; gap: 16px; align-items: start; }
    .cat, .lat { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); padding: 15px; }
    .buscar { width: 100%; margin-bottom: 10px; }
    .filtros { display: flex; gap: 7px; flex-wrap: wrap; margin-bottom: 12px; }
    .filtros button { background: var(--surface); border: 1px solid var(--line); color: var(--text2);
      border-radius: var(--pill); padding: 6px 14px; cursor: pointer;
      font-family: var(--fb); font-weight: 600; font-size: var(--t-sm); }
    .filtros button.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }

    .lista { list-style: none; padding: 0; margin: 0; }
    .lista li { display: flex; gap: 10px; align-items: center; padding: 9px 4px;
                border-bottom: 1px solid var(--line); font-size: var(--t-sm); }
    .lista li:last-child { border-bottom: none; }
    .lista li.tomado { color: var(--text2); }
    .lista .nom { flex: 1; font-weight: 700; min-width: 0;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lista li.tomado .nom { font-weight: 600; text-decoration: line-through; }
    .lista .pos { flex: 0 0 auto; }
    .lista .club { flex: 0 0 auto; font-size: var(--t-xs); letter-spacing: .06em; text-transform: uppercase; }
    .lista .por { flex: 0 0 auto; font-size: var(--t-xs); }
    .estrella { background: none; border: 0; cursor: pointer; font-size: var(--t-md); padding: 0 2px; color: var(--por); }
    .lista .btn { padding: 7px 14px; font-size: var(--t-sm); }

    .cola, .orden { list-style: none; padding: 0; margin: 0 0 16px; }
    .cola li, .orden li { display: flex; gap: 7px; align-items: center; padding: 7px 4px;
                          border-bottom: 1px solid var(--line); font-size: var(--t-sm); }
    .cola li:last-child, .orden li:last-child { border-bottom: none; }
    .cola li.tomado { color: var(--text2); text-decoration: line-through; }
    .cola .nom { flex: 1; font-weight: 600; min-width: 0;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cola button { background: var(--surface); border: 1px solid var(--line); color: var(--text2);
      width: 24px; height: 24px; border-radius: 6px; cursor: pointer; flex: 0 0 auto; }
    .orden li.ahora { font-weight: 700; box-shadow: inset 2px 0 0 var(--accent); padding-left: 8px; }
    .orden li.yo { color: var(--accent); }
    .prepick { display: flex; gap: 7px; align-items: center; margin-bottom: 10px;
               font-size: var(--t-sm); color: var(--text2); }
    .mas { margin-top: 12px; background: var(--surface); border: 1px solid var(--line);
      color: var(--text); border-radius: 11px; padding: 10px 18px; cursor: pointer;
      font-family: var(--fb); font-weight: 600; font-size: var(--t-sm); }
    h3 { margin: 0 0 9px; }
    .faint { color: var(--text2); } .muted { color: var(--text2); }

    @media (max-width: 860px) {
      .cols { grid-template-columns: 1fr; }
      .lista .club, .lista .por { display: none; }
    }
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
  prePick = signal(false);

  private eraMiTurno = false;
  private tituloBase = document.title;
  private parpadeo: ReturnType<typeof setInterval> | null = null;

  constructor(public d: DraftService) {
    // En una quedada estás hablando con la gente: el aviso es lo que evita el
    // "¿me toca a mí?" cada dos minutos.
    effect(() => {
      const mio = this.d.esMiTurno();
      if (mio && !this.eraMiTurno) {
        this.avisar();
        this.intentarPrePick();
      }
      if (!mio && this.eraMiTurno) this.pararAviso();
      this.eraMiTurno = mio;
    });
  }

  async ngOnInit() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    await this.d.cargar();
    this.d.suscribir();
    document.addEventListener('visibilitychange', this.alVolver);
  }

  ngOnDestroy() {
    document.removeEventListener('visibilitychange', this.alVolver);
    this.pararAviso();
    this.d.desuscribir();
  }

  private avisar() {
    try {
      const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gan = ctx.createGain();
      osc.connect(gan);
      gan.connect(ctx.destination);
      osc.frequency.value = 880;
      gan.gain.value = 0.15;
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // Sin audio (permisos del navegador, móvil en silencio): no pasa nada.
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('FALM — te toca', { body: 'Es tu turno en el draft.' });
    }

    let on = false;
    this.parpadeo = setInterval(() => {
      document.title = (on = !on) ? '¡TE TOCA! · FALM' : this.tituloBase;
    }, 1000);
  }

  private pararAviso() {
    if (this.parpadeo) {
      clearInterval(this.parpadeo);
      this.parpadeo = null;
    }
    document.title = this.tituloBase;
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

  /**
   * Un gestor ficha por el equipo al que le toca: en la quedada presencial hay
   * quien dicta su elección en voz alta. El cupo de porterías solo se comprueba
   * en cliente para mi propio equipo; para el resto lo valida el servidor.
   */
  puedeFichar(a: ActivoLibre) {
    if (this.tomado(a) || !this.d.turno()) return false;
    if (this.d.esMiTurno()) return !this.d.debeElegirPorteria() || a.tipo === 'DEFENSA';
    return this.d.soyGestor();
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

  readonly misFichados = computed(() => {
    const cat = new Map(this.d.catalogo().map((a) => [a.activo_id, a]));
    return this.d.misPicks()
      .map((p) => cat.get(p.activo_id))
      .filter((a): a is ActivoLibre => !!a);
  });

  readonly terminado = computed(() => {
    const e = this.d.draft()?.estado;
    return e === 'COMPLETADO' || e === 'CONSOLIDADO';
  });

  /** Primer elemento de la cola que sigue libre y vale según el cupo de porterías. */
  candidatoPrePick(): ActivoLibre | null {
    const cat = new Map(this.d.catalogo().map((a) => [a.activo_id, a]));
    const tom = this.d.tomadoPor();
    const soloPorteria = this.d.debeElegirPorteria();
    for (const c of this.d.cola()) {
      const a = cat.get(c.activo_id);
      if (!a || tom.has(a.activo_id)) continue;
      if (soloPorteria && a.tipo !== 'DEFENSA') continue;
      return a;
    }
    return null;
  }

  /** Con pre-pick activo, ficha solo al llegar mi turno. Sin candidato, no hace nada. */
  private async intentarPrePick() {
    if (!this.prePick()) return;
    const a = this.candidatoPrePick();
    if (!a) {
      this.msg.set('Pre-pick activo, pero ningún jugador de tu cola sirve. Elige a mano.');
      return;
    }
    try {
      await this.d.fichar(a.activo_id);
      this.msg.set(`Pre-pick: fichado ${a.nombre}.`);
    } catch (e: any) {
      this.msg.set(e?.message ?? 'El pre-pick no pudo completarse.');
    }
  }

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
    const mio = this.d.esMiTurno();
    const equipoTurno = this.d.turno()?.equipo_falm_id ?? null;
    const para = mio ? '' : ` para ${this.nombreEquipo(equipoTurno)}`;
    if (!confirm(`¿Fichar a ${a.nombre}${para}?`)) return;
    this.msg.set('');
    try {
      await this.d.fichar(a.activo_id, mio ? undefined : equipoTurno ?? undefined);
    } catch (e: any) {
      this.msg.set(e?.message ?? 'No se pudo fichar.');
    }
  }
}
