import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, CronAdmin, JornadaAdmin, JornadaLfpEstado, Respaldo } from './admin.service';

interface Op {
  id: string;
  titulo: string;
  rpc: string;
  desc: string;
  /** Si necesita jornada, el botón se apaga hasta que elijas una. */
  porJornada: boolean;
}

/**
 * Admin · Operaciones.
 *
 * Todo esto lo hacen ya los cron cada hora; estos botones son el "ejecútalo
 * ahora" para cuando el cron falla o hay prisa. Antes llamaban a las funciones
 * sin argumentos y fallaban siempre, porque procesar_fichajes,
 * heredar_alineaciones y calcular_premios_jornada exigen la jornada.
 */
@Component({
  selector: 'app-admin-operaciones',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="card">
      <h3>Tareas automáticas</h3>
      <p class="hint">
        Corren solas en Supabase. Si aquí sale todo en verde, no hace falta que toques nada abajo.
      </p>
      @if (crons().length === 0) {
        <p class="hint">Sin información de las tareas programadas.</p>
      } @else {
        <div class="lista">
          @for (c of crons(); track c.id) {
            <div class="row">
              <span class="nm">{{ c.nombre }}</span>
              <span class="cron num">{{ c.horario }}</span>
              <span class="faint">{{ fecha(c.ultima) }}</span>
              <span class="chip" [class.chip-ok]="c.estado === 'succeeded'"
                    [class.chip-warn]="c.estado && c.estado !== 'succeeded'">
                {{ c.activo ? (c.estado ?? 'sin ejecutar') : 'parada' }}
              </span>
            </div>
          }
        </div>
      }
    </section>

    <section class="card">
      <h3>Puntuaciones de LaLiga</h3>
      <p class="hint">
        El sistema lo hace solo: cada pocas horas mira si hay alguna jornada terminada
        (último partido más 3 horas) y sin puntuar. Esto es el <b>hazlo ahora</b>, para
        cuando falle o para releer una jornada si la prensa cambia una valoración.
        Las jornadas 1 a 4 quedan fuera de la liga y no las procesa nunca.
      </p>

      <div class="form">
        <label>Jornada
          <select [ngModel]="jornadaLfp()" (ngModelChange)="jornadaLfp.set($event)">
            <option value="">— elige jornada —</option>
            @for (j of jornadasLfp(); track j.numero) {
              <option [value]="j.numero" [disabled]="j.con_marcador === 0">
                J{{ j.numero }}{{ j.en_liga_falm ? '' : ' (fuera de la liga)' }} ·
                {{ j.con_marcador === 0 ? 'sin jugar' :
                   (j.puntuaciones > 0 ? j.puntuaciones + ' puntuaciones' : 'sin leer') }}
              </option>
            }
          </select>
        </label>
        <label class="chk">
          <input type="checkbox" [ngModel]="sobrescribir()" (ngModelChange)="sobrescribir.set($event)" />
          Volver a leer si ya tiene puntuaciones
        </label>
        <button class="btn" [disabled]="leyendo() || !jornadaLfp()" (click)="leerPuntuaciones()">
          {{ leyendo() ? 'Leyendo…' : 'Leer puntuaciones' }}
        </button>
      </div>

      <div class="form auto">
        <label>Comprobar solo
          <select [ngModel]="cadaHoras()" (ngModelChange)="cadaHoras.set($event)">
            <option [value]="1">cada hora</option>
            <option [value]="2">cada 2 horas</option>
            <option [value]="4">cada 4 horas</option>
            <option [value]="8">cada 8 horas</option>
            <option [value]="24">una vez al día</option>
          </select>
        </label>
        <label class="chk">
          <input type="checkbox" [ngModel]="cronActivo()" (ngModelChange)="cronActivo.set($event)" />
          Activado
        </label>
        <button class="btn-sec" [disabled]="guardandoCron()" (click)="guardarCron()">
          {{ guardandoCron() ? 'Guardando…' : 'Guardar' }}
        </button>
        <span class="faint">
          Si lo apagas, las puntuaciones solo entran con el botón de arriba.
        </span>
      </div>

      @if (avisoPt()) { <p class="aviso">{{ avisoPt() }}</p> }
      @if (errorPt()) { <p class="err">{{ errorPt() }}</p> }

      @if (sinCasar().length) {
        <p class="hint">
          No se han podido identificar estos {{ sinCasar().length }}. Suele ser gente que ya
          no está en la liga o del filial; si alguno es titular, avisa y se revisa el catálogo.
        </p>
        <div class="lista">
          @for (n of sinCasar(); track n.slug || n.jugador) {
            <div class="row nc">
              <span class="nm">{{ n.jugador }}</span>
              <span class="faint">{{ n.equipo }}</span>
            </div>
          }
        </div>
      }
    </section>

    <section class="card">
      <h3>Copias de seguridad</h3>
      <p class="hint">
        Copia las {{ tablasFalm }} tablas de la liga a un schema aparte de la base. Tarda un
        segundo y ocupa menos de 1 MB: hazla <b>antes del draft y antes de cualquier cosa
        que dé miedo</b>. Hay una automática cada día a las 04:15 y se guardan las 7 últimas.
      </p>

      <div class="form">
        <label>Motivo
          <input type="text" placeholder="antes-del-draft" maxlength="30"
                 [ngModel]="etiqueta()" (ngModelChange)="etiqueta.set($event)" />
        </label>
        <button class="btn" [disabled]="respaldando()" (click)="crearRespaldo()">
          {{ respaldando() ? 'Copiando…' : 'Crear copia ahora' }}
        </button>
      </div>

      @if (avisoBk()) { <p class="aviso">{{ avisoBk() }}</p> }
      @if (errorBk()) { <p class="err">{{ errorBk() }}</p> }

      @if (respaldos().length === 0) {
        <p class="hint">Todavía no hay ninguna copia.</p>
      } @else {
        <div class="lista">
          @for (r of respaldos(); track r.schema) {
            <div class="row bk">
              <span class="nm">{{ etiquetaDe(r.schema) }}</span>
              <span class="faint">{{ fechaDe(r.schema) }}</span>
              <span class="faint num">{{ r.tablas }} tablas · {{ r.tamano }}</span>
              <button class="btn-sec" [disabled]="borrando() === r.schema"
                      (click)="borrar(r)">Borrar</button>
            </div>
          }
        </div>
        <p class="hint recuperar">
          Para <b>recuperar</b> una copia no hay botón a propósito: se hace desde el editor SQL
          de Supabase, que obliga a pensarlo dos veces. Está explicado en
          <code>tools/sql/respaldos.sql</code>.
        </p>
      }
    </section>

    <section class="card">
      <h3>Ejecutar a mano</h3>
      <p class="hint">
        Elige la jornada sobre la que quieres actuar. Las que ya se procesaron salen marcadas.
      </p>

      <div class="form">
        <label>Jornada
          <select [ngModel]="jornadaSel()" (ngModelChange)="jornadaSel.set($event)">
            <option value="">— elige jornada —</option>
            @for (j of jornadas(); track j.id) {
              <option [value]="j.id">
                {{ j.competicion }} · J{{ j.numero }}{{ j.fichajesProcesados ? ' ✓ fichajes' : '' }}{{ j.alineacionesHeredadas ? ' ✓ once' : '' }}
              </option>
            }
          </select>
        </label>
      </div>

      @if (aviso()) { <p class="aviso">{{ aviso() }}</p> }
      @if (error()) { <p class="err">{{ error() }}</p> }

      <div class="ops">
        @for (op of ops; track op.id) {
          <div class="op">
            <div class="tx">
              <span class="nm">{{ op.titulo }}</span>
              <span class="ds faint">{{ op.desc }}</span>
            </div>
            <button class="btn" [disabled]="corriendo() === op.id || (op.porJornada && !jornadaSel())"
                    (click)="lanzar(op)">
              {{ corriendo() === op.id ? '…' : 'Ejecutar' }}
            </button>
          </div>
        }
      </div>
    </section>
  `,
  styles: [`
    section.card { padding: 16px; margin-bottom: 14px; }
    h3 { margin: 0 0 10px; }
    .hint { color: var(--text2); font-size: var(--t-sm); margin: 0 0 12px; }
    .form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
    .form label { font-size: var(--t-sm); color: var(--text2); display: flex; gap: 6px; align-items: center; }
    .lista { display: flex; flex-direction: column; gap: 6px; }
    .row { display: grid; grid-template-columns: 1fr 90px 150px 110px; gap: 10px; align-items: center;
      padding: 8px 11px; background: var(--surface2); border: 1px solid var(--line);
      border-radius: var(--r-xs); font-size: var(--t-sm); }
    .row .cron { color: var(--text2); font-size: var(--t-xs); }
    .nm { font-weight: 700; }
    .faint { color: var(--text2); font-size: var(--t-xs); }
    .ops { display: flex; flex-direction: column; gap: 8px; }
    .op { display: flex; gap: 12px; align-items: center; justify-content: space-between;
      padding: 10px 12px; background: var(--surface2); border: 1px solid var(--line);
      border-radius: var(--r-xs); }
    .tx { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .ds { font-size: var(--t-xs); }
    .aviso { padding: 9px 13px; border-radius: var(--r-sm); background: var(--surface);
      border: 1px solid var(--accent-line); font-size: var(--t-sm); margin: 0 0 10px; }
    .row.bk { grid-template-columns: 1fr 130px 170px 84px; }
    .row.nc { grid-template-columns: 1fr 1fr; }
    .form .chk { display: flex; gap: 7px; align-items: center; cursor: pointer; }
    .form.auto { padding: 10px 12px; background: var(--surface2); border: 1px solid var(--line);
      border-radius: var(--r-xs); }
    .form input { padding: 7px 10px; border: 1px solid var(--line); border-radius: var(--r-xs);
      background: var(--surface); color: var(--text); font-family: var(--fb);
      font-size: var(--t-sm); min-width: 180px; }
    .recuperar { margin: 12px 0 0; }
    .recuperar code { font-family: var(--fm); font-size: var(--t-xs); }
    @media (max-width: 700px) {
      .row { grid-template-columns: 1fr 1fr; }
      .row.bk { grid-template-columns: 1fr 84px; }
      .row.bk > :nth-child(2), .row.bk > :nth-child(3) { display: none; }
      .op { flex-direction: column; align-items: stretch; }
    }
  `],
})
export class AdminOperacionesComponent implements OnInit {
  jornadas = signal<JornadaAdmin[]>([]);
  crons = signal<CronAdmin[]>([]);
  jornadaSel = signal('');
  corriendo = signal('');
  aviso = signal('');
  error = signal('');

  // Puntuaciones de LaLiga
  jornadasLfp = signal<JornadaLfpEstado[]>([]);
  jornadaLfp = signal<string>('');
  sobrescribir = signal(false);
  leyendo = signal(false);
  avisoPt = signal('');
  errorPt = signal('');
  sinCasar = signal<{ equipo: string; jugador: string; slug: string | null }[]>([]);
  cadaHoras = signal(2);
  cronActivo = signal(true);
  guardandoCron = signal(false);

  // Copias de seguridad
  readonly tablasFalm = 29;
  respaldos = signal<Respaldo[]>([]);
  etiqueta = signal('');
  respaldando = signal(false);
  borrando = signal('');
  avisoBk = signal('');
  errorBk = signal('');

  ops: Op[] = [
    { id: 'fichajes', titulo: 'Procesar fichajes', rpc: 'procesar_fichajes', porJornada: true,
      desc: 'Resuelve las peticiones de esa jornada con los 3 desempates en 2 fases.' },
    { id: 'heredar', titulo: 'Heredar alineaciones', rpc: 'heredar_alineaciones', porJornada: true,
      desc: 'Copia la última alineación a los equipos que no han subido once.' },
    { id: 'premios', titulo: 'Calcular premios de la jornada', rpc: 'calcular_premios_jornada', porJornada: true,
      desc: 'Reparte los premios de esa jornada (normal 10/5, doble 20/15/5).' },
    { id: 'expirar', titulo: 'Expirar ofertas', rpc: 'expirar_ofertas', porJornada: false,
      desc: 'Marca EXPIRADA las ofertas de intercambio vencidas. El cron ya lo hace cada hora.' },
  ];

  constructor(private admin: AdminService) {}

  async ngOnInit() {
    try {
      this.jornadas.set(await this.admin.jornadasFalm());
      this.crons.set(await this.admin.estadoCrons());
      this.sincronizarCron();
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se pudo cargar el estado.');
    }
    await this.cargarRespaldos();
    await this.cargarJornadasLfp();
  }

  /** Lee del propio cron cada cuánto está puesto, para no enseñar un valor inventado. */
  private sincronizarCron() {
    const c = this.crons().find((x) => x.nombre === 'falm-procesar-jornada');
    if (!c) return;
    this.cronActivo.set(c.activo);
    const m = c.horario.match(/^\d+ \*\/(\d+)/);
    this.cadaHoras.set(m ? Number(m[1]) : 1);
  }

  async guardarCron() {
    this.avisoPt.set(''); this.errorPt.set('');
    this.guardandoCron.set(true);
    try {
      await this.admin.configurarCronPuntuaciones(Number(this.cadaHoras()), this.cronActivo());
      this.crons.set(await this.admin.estadoCrons());
      this.sincronizarCron();
      this.avisoPt.set(this.cronActivo()
        ? `Comprobará si hay jornada que puntuar cada ${this.cadaHoras()} h.`
        : 'Comprobación automática apagada: las puntuaciones solo entran a mano.');
    } catch (e: any) {
      this.errorPt.set(e?.message ?? 'No se pudo cambiar la tarea programada.');
    } finally {
      this.guardandoCron.set(false);
    }
  }

  private async cargarJornadasLfp() {
    try {
      this.jornadasLfp.set(await this.admin.estadoJornadasLfp());
    } catch (e: any) {
      this.errorPt.set(e?.message ?? 'No se pudo leer el estado de las jornadas.');
    }
  }

  async leerPuntuaciones() {
    const j = Number(this.jornadaLfp());
    if (!j || this.leyendo()) return;
    this.avisoPt.set(''); this.errorPt.set(''); this.sinCasar.set([]);
    this.leyendo.set(true);
    try {
      const r = await this.admin.leerPuntuaciones(j, this.sobrescribir());
      this.sinCasar.set(r.no_casados ?? []);
      this.avisoPt.set(
        `Jornada ${r.jornada_numero}: ${r.ingestados} puntuaciones de ${r.casados} jugadores` +
        (r.no_casados?.length ? `, ${r.no_casados.length} sin identificar.` : '.')
      );
      await this.cargarJornadasLfp();
    } catch (e: any) {
      this.errorPt.set(e?.message ?? 'No se pudieron leer las puntuaciones.');
    } finally {
      this.leyendo.set(false);
    }
  }

  private async cargarRespaldos() {
    try {
      this.respaldos.set(await this.admin.respaldos());
    } catch (e: any) {
      this.errorBk.set(e?.message ?? 'No se pudieron leer las copias.');
    }
  }

  /** bk_falm_20260903_224735_antes_del_draft -> "antes del draft" */
  etiquetaDe(schema: string) {
    const resto = schema.replace(/^bk_falm_\d{8}_\d{6}_?/, '').replace(/_/g, ' ');
    return resto || 'sin motivo';
  }

  /** La fecha va dentro del nombre del schema, que es lo que ordena la lista. */
  fechaDe(schema: string) {
    const m = schema.match(/^bk_falm_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/);
    return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : '';
  }

  async crearRespaldo() {
    this.avisoBk.set(''); this.errorBk.set('');
    this.respaldando.set(true);
    try {
      const r = await this.admin.crearRespaldo(this.etiqueta().trim() || 'manual');
      this.avisoBk.set(`Copia hecha: ${r.tablas} tablas y ${r.filas} filas (${r.tamano}).`);
      this.etiqueta.set('');
      await this.cargarRespaldos();
    } catch (e: any) {
      this.errorBk.set(e?.message ?? 'No se pudo crear la copia.');
    } finally {
      this.respaldando.set(false);
    }
  }

  async borrar(r: Respaldo) {
    this.avisoBk.set(''); this.errorBk.set('');
    this.borrando.set(r.schema);
    try {
      await this.admin.borrarRespaldo(r.schema);
      await this.cargarRespaldos();
    } catch (e: any) {
      this.errorBk.set(e?.message ?? 'No se pudo borrar la copia.');
    } finally {
      this.borrando.set('');
    }
  }

  fecha(f: string | null) {
    if (!f) return 'nunca';
    return new Date(f).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  async lanzar(op: Op) {
    this.aviso.set(''); this.error.set('');
    this.corriendo.set(op.id);
    try {
      const params = op.porJornada ? { p_jornada: this.jornadaSel() } : {};
      const r = await this.admin.ejecutar(op.rpc, params);
      this.aviso.set(`${op.titulo}: ${typeof r === 'number' ? r + ' afectados' : 'completado'}.`);
      this.jornadas.set(await this.admin.jornadasFalm());
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al ejecutar');
    } finally {
      this.corriendo.set('');
    }
  }
}
