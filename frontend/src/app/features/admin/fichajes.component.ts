import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminPeticion, AdminService, JornadaAdmin, PropuestaFichajes } from './admin.service';
import { ActaFichajesComponent } from '../../shared/acta-fichajes.component';

const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/**
 * Admin · Fichajes: quién ha pedido qué, y rechazar lo que no toca.
 *
 * No existía. Lo único que había era "procesar los fichajes de la jornada",
 * que es concederlos: si un equipo pedía en una jornada sin mercado, no se
 * veía por ningún sitio y no había forma de anularlo. Pasó en la jornada 1.
 */
@Component({
  selector: 'app-admin-fichajes',
  standalone: true,
  imports: [FormsModule, ActaFichajesComponent],
  template: `
    @if (aviso()) { <p class="aviso">{{ aviso() }}</p> }
    @if (error()) { <p class="err">{{ error() }}</p> }

    @if (cargando()) {
      <p class="muted">Cargando peticiones…</p>
    } @else {
      <!-- El reparto de la semana lo valida el gestor: el cron del miercoles ya
           no lo aplica solo. "Ver" corre el reparto de verdad y lo deshace. -->
      <section class="tabla reparto">
        <div class="barra">
          <span class="lb">Reparto de la semana</span>
          <button class="bn" [disabled]="calculando()" (click)="verPropuesta()">
            {{ calculando() ? 'Calculando…' : propuesta() ? 'Recalcular' : 'Ver cómo quedaría' }}
          </button>
          @if (propuesta(); as pr) {
            <button class="bn si" [disabled]="pr.abierta || !pr.pendientes || aplicando()" (click)="aplicar()"
                    [title]="pr.abierta ? 'La semana sigue abierta hasta el martes a las 23:59' : 'Mete los fichajes en las plantillas'">
              {{ aplicando() ? 'Aplicando…' : 'Aplicar reparto' }}
            </button>
          }
        </div>
        @if (propuesta(); as pr) {
          <p class="muted pad mini">
            Semana del {{ dia(pr.ventana) }} · jornada {{ pr.jornada }} · {{ pr.pendientes }}
            {{ pr.pendientes === 1 ? 'petición pendiente' : 'peticiones pendientes' }}.
            {{ pr.abierta ? 'Aún pueden cambiar lo que piden hasta el martes a las 23:59: así quedaría ahora.'
                          : 'Semana cerrada: esto es lo que se aplicará.' }}
          </p>
          <!-- El acta entera, la misma que veran todos en Inicio: asi se revisa
               tambien como se han resuelto los disputados y con que criterio. -->
          <div class="pad">
            <falm-acta-fichajes [acta]="pr.acta" [cabecera]="false" />
            @if (!(pr.acta?.equipos ?? []).length) { <p class="muted">No hay nada que repartir.</p> }
          </div>
        }
      </section>

      <!-- El mercado, jornada a jornada. Cerrarlo aqui no es un aviso de
           pantalla: la base rebota la peticion aunque alguien se la salte. -->
      <section class="tabla mercado">
        <div class="barra">
          <span class="lb">Mercado abierto</span>
          <span class="muted mini">Toca una jornada para abrir o cerrar su mercado. Esto no filtra nada.</span>
        </div>
        <div class="jors">
          @for (j of jornadasLiga(); track j.id) {
            <button class="jm" [class.on]="j.admiteFichajes" [disabled]="moviendo() === j.id"
                    [title]="j.admiteFichajes ? 'Con mercado; toca para cerrarlo' : 'Sin mercado; toca para abrirlo'"
                    (click)="alternarMercado(j)">
              J{{ j.numero }}
              <i>{{ j.admiteFichajes ? 'abierto' : 'cerrado' }}</i>
            </button>
          }
        </div>
      </section>

      <section class="tabla">
        <div class="barra chips">
          <span class="lb">Peticiones</span>
          <button [class.on]="solo() === 'PENDIENTE'" (click)="solo.set('PENDIENTE')">
            Pendientes @if (pendientes().length) { <i class="cuenta num">{{ pendientes().length }}</i> }
          </button>
          <button [class.on]="solo() === ''" (click)="solo.set('')">Todas</button>
          <!-- Y por jornada: lo que se pregunta es "que se ficho en la 3". -->
          <span class="sep"></span>
          <button [class.on]="jorSel() === null" (click)="verJornada(null)">Toda la liga</button>
          @for (j of jornadasConPeticiones(); track j) {
            <button [class.on]="jorSel() === j" (click)="verJornada(j)">J{{ j }}</button>
          }
        </div>

        <!-- El acta de esa jornada: que pidio cada uno y que se ficho. En un
             paron pueden ser varias semanas, y cada una lleva la suya. -->
        @if (jorSel() !== null) {
          @if (cargandoActas()) {
            <p class="muted pad">Cargando el acta…</p>
          } @else if (actas().length) {
            @for (a of actas(); track a.ventana) {
              <div class="pad">
                <p class="lb2">Semana del {{ dia(a.ventana) }} · {{ a.fichajes }} fichajes</p>
                <falm-acta-fichajes [acta]="a" [cabecera]="false" />
              </div>
            }
          } @else {
            <p class="muted pad">La jornada {{ jorSel() }} todavía no tiene reparto aplicado.</p>
          }
        }

        @if (visibles().length === 0) {
          <p class="muted pad">
            {{ jorSel() ? 'No hay peticiones de la jornada ' + jorSel() + ' con ese filtro.' : (solo() === 'PENDIENTE' ? 'No hay ninguna petición pendiente.' : 'Todavía no ha pedido nadie.') }}
          </p>
        }

        @for (p of visibles(); track p.id) {
          <div class="pet" [class.pend]="p.estado === 'PENDIENTE'">
            <div class="quien">
              <strong>{{ p.equipo }}</strong>
              <span class="meta">J{{ p.jornada ?? '—' }} · {{ cuando(p.fecha) }}</span>
            </div>

            <div class="pide">
              @for (o of p.pide; track o.prioridad) {
                <span class="op">
                  <i class="pr num">{{ o.prioridad }}</i>
                  <span class="pos" [class]="abr(o.posicion)">{{ abr(o.posicion) }}</span>
                  {{ o.nombre }}
                </span>
              }
              @if (p.pide.length === 0) { <span class="meta">Sin jugadores (petición vacía)</span> }
            </div>

            <div class="der">
              <span class="est" [attr.data-e]="p.estado">{{ etiqueta(p) }}</span>
              @if (p.estado === 'PENDIENTE') {
                <button class="bn no" [disabled]="tocando() === p.id" (click)="rechazar(p)">
                  {{ tocando() === p.id ? '…' : 'Rechazar' }}
                </button>
              }
            </div>

            @if (p.observaciones) { <p class="obs">{{ p.observaciones }}</p> }
          </div>
        }
      </section>

      @if (pendientes().length > 0) {
        <div class="motivo card">
          <label>
            <span class="lb">Motivo al rechazar</span>
            <input [ngModel]="motivo()" (ngModelChange)="motivo.set($event)"
                   placeholder="Por qué se rechaza; el equipo lo lee en su pantalla" />
          </label>
          <p class="muted mini">Se guarda con la petición, así que conviene que se entienda solo.</p>
        </div>
      }
    }
  `,
  styles: [`
    .aviso { background: var(--accent-soft); border: 1px solid var(--accent-line); color: var(--accent);
      padding: 10px 14px; border-radius: var(--r-xs); margin-bottom: 12px; }
    .err { color: var(--bad); } .muted { color: var(--text2); }
    .pad { padding: 16px 18px; margin: 0; }
    .cuenta { font-style: normal; margin-left: 6px; }
    .barra .sep { width: 1px; height: 20px; background: var(--line); margin: 0 2px; }
    .lb2 { margin: 0 0 8px; font-size: var(--t-xs); font-weight: 700; letter-spacing: .1em;
      text-transform: uppercase; color: var(--text2); }

    .pet { display: grid; grid-template-columns: 190px 1fr auto; gap: 14px; align-items: center;
      padding: 13px 18px; border-bottom: 1px solid var(--line); }
    .pet:last-child { border-bottom: 0; }
    /* Lo que espera respuesta se ve antes que lo ya resuelto. */
    .pet.pend { background: var(--accent-soft); }
    .quien { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .quien strong { font-family: var(--fh); text-transform: uppercase; font-size: var(--t-md); }
    .meta { color: var(--text2); font-size: var(--t-sm); }

    .pide { display: flex; flex-wrap: wrap; gap: 8px; min-width: 0; }
    .op { display: inline-flex; align-items: center; gap: 7px; background: var(--surface);
      border: 1px solid var(--line); border-radius: var(--r-xs); padding: 5px 10px;
      font-size: var(--t-sm); font-weight: 600; }
    .pr { color: var(--text2); font-size: var(--t-xs); font-style: normal; }

    .der { display: flex; align-items: center; gap: 10px; }
    .est { font-size: var(--t-xs); font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
      color: var(--text2); white-space: nowrap; }
    .est[data-e=PENDIENTE] { color: var(--por); }
    .est[data-e=PROCESADA] { color: var(--good); }
    .est[data-e=RECHAZADA], .est[data-e=EXPIRADA] { color: var(--bad); }
    .bn { border: 1px solid var(--line); border-radius: var(--r-xs); padding: 8px 14px; cursor: pointer;
      font-family: var(--fb); font-weight: 700; font-size: var(--t-sm); background: var(--surface); color: var(--text); }
    .bn.no { color: var(--bad); }
    .bn:disabled { opacity: .5; cursor: default; }

    .obs { grid-column: 1 / -1; margin: 4px 0 0; color: var(--text2); font-size: var(--t-sm); }

    .mercado { margin-bottom: 14px; }
    .reparto { margin-bottom: 14px; }
    .reparto .barra { gap: 8px; flex-wrap: wrap; }
    .bn.si { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
    .rep { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap;
      padding: 10px 18px; border-top: 1px solid var(--line); font-size: var(--t-sm); }
    .rep strong { font-family: var(--fh); text-transform: uppercase; min-width: 150px; }
    .rep.sin { color: var(--text2); }
    .jors { display: flex; flex-wrap: wrap; gap: 8px; padding: 14px 18px; }
    .jm { display: flex; flex-direction: column; align-items: center; gap: 2px;
      min-width: 74px; padding: 8px 10px; cursor: pointer;
      background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-xs);
      font-family: var(--fb); font-weight: 700; font-size: var(--t-sm); color: var(--text2); }
    .jm i { font-style: normal; font-size: var(--t-xs); font-weight: 600; letter-spacing: .06em;
      text-transform: uppercase; }
    /* Abierto es lo normal; el que llama la atencion es el cerrado. */
    .jm.on { color: var(--text); }
    .jm:not(.on) { border-color: color-mix(in oklab, var(--bad) 40%, var(--line));
      background: color-mix(in oklab, var(--bad) 7%, var(--surface)); color: var(--bad); }
    .jm:disabled { opacity: .5; cursor: default; }

    .motivo { margin-top: 14px; padding: 14px 16px; }
    .motivo label { display: flex; flex-direction: column; gap: 6px; }
    .motivo input { width: 100%; }
    .mini { font-size: var(--t-sm); margin: 8px 0 0; }

    @media (max-width: 900px) {
      .pet { grid-template-columns: 1fr; gap: 9px; }
      .der { justify-content: space-between; }
    }
  `],
})
export class AdminFichajesComponent implements OnInit {
  peticiones = signal<AdminPeticion[]>([]);
  jornadas = signal<JornadaAdmin[]>([]);
  moviendo = signal('');
  solo = signal<'PENDIENTE' | ''>('PENDIENTE');
  motivo = signal('En esta jornada no había mercado de fichajes.');
  cargando = signal(true);
  tocando = signal('');
  error = signal('');
  aviso = signal('');

  /** Solo la liga: la copa y la clausura no tienen mercado propio. */
  jornadasLiga = computed(() => this.jornadas().filter((j) => j.competicion === 'LIGA'));
  pendientes = computed(() => this.peticiones().filter((p) => p.estado === 'PENDIENTE'));
  /** La jornada elegida en el filtro; null es "toda la liga". */
  jorSel = signal<number | null>(null);
  /** Las semanas ya repartidas y el acta de la jornada elegida. */
  ventanas = signal<{ ventana: string; jornada: number | null; fichajes: number }[]>([]);
  actas = signal<any[]>([]);
  cargandoActas = signal(false);

  /** Elegir jornada: filtra la lista y trae el acta de sus semanas. */
  async verJornada(j: number | null) {
    this.jorSel.set(j);
    this.actas.set([]);
    if (j === null) return;
    const vs = this.ventanas().filter((v) => v.jornada === j);
    if (!vs.length) return;
    this.cargandoActas.set(true);
    try {
      this.actas.set(await Promise.all(vs.map((v) => this.admin.actaFichajes(v.ventana))));
    } catch { this.actas.set([]); }
    finally { this.cargandoActas.set(false); }
  }
  /** Las jornadas de las que hay algo pedido, de la mas nueva a la mas vieja. */
  jornadasConPeticiones = computed(() =>
    [...new Set(this.peticiones().map((p) => p.jornada).filter((j): j is number => j != null))]
      .sort((a, b) => b - a));
  visibles = computed(() => {
    const base = this.solo() ? this.pendientes() : this.peticiones();
    const j = this.jorSel();
    return j == null ? base : base.filter((p) => p.jornada === j);
  });

  propuesta = signal<PropuestaFichajes | null>(null);
  calculando = signal(false);
  aplicando = signal(false);

  dia(f: string) {
    return new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
  }
  async verPropuesta() {
    this.aviso.set(''); this.error.set('');
    this.calculando.set(true);
    try { this.propuesta.set(await this.admin.propuestaFichajes()); }
    catch (e: any) { this.error.set(e?.message ?? 'No se pudo calcular el reparto'); }
    finally { this.calculando.set(false); }
  }

  async aplicar() {
    this.aviso.set(''); this.error.set('');
    this.aplicando.set(true);
    try {
      const r = await this.admin.aplicarFichajes();
      this.propuesta.set(null);
      await this.cargar();
      this.aviso.set(`Reparto aplicado: ${r.fichados} de ${r.peticiones} peticiones con fichaje.`);
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se pudo aplicar el reparto');
    } finally {
      this.aplicando.set(false);
    }
  }

  constructor(private admin: AdminService) {}

  async ngOnInit() { await this.cargar(); }

  private async cargar() {
    this.cargando.set(true);
    try {
      const [ps, js] = await Promise.all([this.admin.peticiones(), this.admin.jornadasFalm()]);
      this.peticiones.set(ps); this.jornadas.set(js);
      this.admin.ventanasFichajes().then((vs) => this.ventanas.set(vs)).catch(() => {});
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error cargando las peticiones');
    } finally {
      this.cargando.set(false);
    }
  }

  abr(p: string) { return ABR[p] ?? p; }

  cuando(f: string) {
    return new Date(f).toLocaleString('es-ES',
      { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  /** Lo resuelto dice en qué quedó, no solo su estado. */
  etiqueta(p: AdminPeticion) {
    if (p.estado === 'PROCESADA') return p.fichado ? 'Fichado' : 'Sin fichaje';
    return p.estado;
  }

  async alternarMercado(j: JornadaAdmin) {
    this.aviso.set(''); this.error.set('');
    this.moviendo.set(j.id);
    try {
      await this.admin.abrirMercado(j.id, !j.admiteFichajes);
      await this.cargar();
      this.aviso.set(`Jornada ${j.numero}: mercado ${j.admiteFichajes ? 'cerrado' : 'abierto'}.`);
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se pudo cambiar el mercado');
    } finally {
      this.moviendo.set('');
    }
  }

  async rechazar(p: AdminPeticion) {
    this.aviso.set(''); this.error.set('');
    this.tocando.set(p.id);
    try {
      await this.admin.rechazarPeticion(p.id, this.motivo().trim() || 'Rechazada por el gestor');
      await this.cargar();
      this.aviso.set(`Petición de ${p.equipo} rechazada.`);
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se pudo rechazar');
    } finally {
      this.tocando.set('');
    }
  }
}
