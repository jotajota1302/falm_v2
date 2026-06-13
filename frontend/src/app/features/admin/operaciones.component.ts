import { Component, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AdminService } from './admin.service';

interface Op { id: string; icono: string; titulo: string; desc: string; rpc: string; cron?: string; }

/** Admin · Panel de operaciones (lanza las funciones SQL de la liga). */
@Component({
  selector: 'app-admin-operaciones',
  standalone: true,
  template: `
    <p class="intro muted">Estas operaciones ejecutan la lógica SQL del backend. Algunas ya corren solas por cron;
      aquí se pueden lanzar manualmente (requiere rol admin / service_role).</p>

    @if (resultado()) { <p class="res">{{ resultado() }}</p> }
    @if (error()) { <p class="err">{{ error() }}</p> }

    <div class="grid">
      @for (op of ops; track op.id) {
        <div class="op card">
          <span class="ic">{{ op.icono }}</span>
          <div class="txt">
            <strong>{{ op.titulo }}</strong>
            <p>{{ op.desc }}</p>
            @if (op.cron) { <span class="cron">⏱ {{ op.cron }}</span> }
          </div>
          <button class="btn" [disabled]="corriendo() === op.id" (click)="lanzar(op)">
            {{ corriendo() === op.id ? '…' : 'Lanzar' }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .intro { font-size: .85rem; margin: 0 0 14px; }
    .res { background: rgba(0,230,118,.08); border: 1px solid rgba(0,230,118,.22); color: var(--primary); padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; }
    .err { color: var(--bad); }
    .grid { display: flex; flex-direction: column; gap: 10px; }
    .op { display: flex; align-items: center; gap: 14px; padding: 14px 16px; }
    .op .ic { font-size: 1.6rem; }
    .op .txt { flex: 1; min-width: 0; }
    .op .txt strong { display: block; }
    .op .txt p { margin: 2px 0 0; color: var(--muted); font-size: .82rem; }
    .op .cron { display: inline-block; margin-top: 6px; font-size: .68rem; color: var(--gold); font-weight: 700; }
  `],
})
export class AdminOperacionesComponent {
  corriendo = signal('');
  resultado = signal('');
  error = signal('');

  ops: Op[] = [
    { id: 'fichajes', icono: '🔁', titulo: 'Procesar fichajes', rpc: 'procesar_fichajes',
      desc: 'Resuelve las peticiones de la jornada objetivo con los 3 desempates en 2 fases.', cron: 'martes 22:59' },
    { id: 'heredar', icono: '📋', titulo: 'Heredar alineaciones', rpc: 'heredar_alineaciones',
      desc: 'Copia la última alineación a los equipos que no han subido once.', cron: 'martes 23:05' },
    { id: 'premios', icono: '💰', titulo: 'Calcular premios de jornada', rpc: 'calcular_premios_jornada',
      desc: 'Reparte premios de la jornada con la regla de empates (normal 10/5, doble 20/15/5).' },
    { id: 'expirar', icono: '⌛', titulo: 'Expirar ofertas', rpc: 'expirar_ofertas',
      desc: 'Marca EXPIRADA las ofertas de intercambio pendientes con fecha pasada.', cron: 'cada hora' },
  ];

  constructor(private admin: AdminService) {}

  async lanzar(op: Op) {
    this.resultado.set(''); this.error.set('');
    if (environment.devEquipoNombre) {
      this.resultado.set(`Modo demo: se ejecutaría falm.${op.rpc}() (requiere rol admin / service_role).`);
      return;
    }
    this.corriendo.set(op.id);
    try {
      const r = await this.admin.ejecutar(op.rpc);
      this.resultado.set(`✅ ${op.titulo}: ${typeof r === 'number' ? r + ' afectados' : 'completado'}.`);
    } catch (e: any) { this.error.set(e?.message ?? 'Error al ejecutar'); }
    finally { this.corriendo.set(''); }
  }
}
