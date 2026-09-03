import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, CronAdmin, JornadaAdmin } from './admin.service';

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
    @media (max-width: 700px) {
      .row { grid-template-columns: 1fr 1fr; }
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
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se pudo cargar el estado.');
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
