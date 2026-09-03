import { Component, OnInit, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AdminEquipo, AdminService } from './admin.service';

const COLORES = ['#00e676', '#38bdf8', '#fb7185', '#a3e635', '#ffc24b', '#c084fc', '#f97316', '#2dd4bf', '#f472b6', '#60a5fa'];

/** Admin · Equipos FALM y asignación de usuario. */
@Component({
  selector: 'app-admin-equipos',
  standalone: true,
  template: `
    @if (aviso()) { <p class="aviso">{{ aviso() }}</p> }
    @if (error()) { <p class="err">{{ error() }}</p> }

    @if (cargando()) {
      <p class="muted">Cargando equipos…</p>
    } @else {
      <div class="grid">
        @for (e of equipos(); track e.id) {
          <div class="eq card">
            <span class="av" [style.background]="color(e.nombre)">{{ ini(e.nombre) }}</span>
            <div class="info">
              <strong>{{ e.nombre }}</strong>
              <span class="meta">{{ e.jugadores }} jugadores · {{ e.presupuesto }}M libre</span>
              <span class="own" [class.sin]="!e.usuarioId">{{ e.usuarioId ? 'Dueño asignado' : 'Sin dueño' }}</span>
            </div>
            <div class="der">
              <span class="ben num">{{ e.beneficio }}<small>€</small></span>
              <button class="bn" (click)="asignar(e)">Asignar dueño</button>
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .aviso { background: color-mix(in oklab, var(--por) 8%, var(--surface)); border: 1px solid color-mix(in oklab, var(--por) 32%, var(--line)); color: var(--por); padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; }
    .err { color: var(--bad); } .muted { color: var(--text2); }
    .grid { display: flex; flex-direction: column; gap: 10px; }
    .eq { display: flex; align-items: center; gap: 14px; padding: 14px 16px; }
    .av { flex: 0 0 auto; width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center;
      justify-content: center; font-weight: 700; color: var(--accent-ink); }
    .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .info strong { font-size: 15px; }
    .meta { color: var(--text2); font-size: 12.5px; }
    .own { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--accent); }
    .own.sin { color: var(--text2); }
    .der { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    .ben { font-weight: 700; color: var(--por); } .ben small { font-size: 11px; }
    .bn { border: 1px solid var(--line); background: var(--surface2); color: var(--text); border-radius: 8px;
      padding: 6px 12px; cursor: pointer; font-weight: 700; font-size: 12px; }
  `],
})
export class AdminEquiposComponent implements OnInit {
  equipos = signal<AdminEquipo[]>([]);
  cargando = signal(true);
  aviso = signal('');
  error = signal('');

  constructor(private admin: AdminService) {}
  ini(n: string) { return (n || '?').charAt(0).toUpperCase(); }
  color(n: string) { let h = 0; for (const c of n || '') h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORES[h % COLORES.length]; }

  async ngOnInit() {
    try { this.equipos.set(await this.admin.equipos()); }
    catch (e: any) { this.error.set(e?.message ?? 'Error'); }
    finally { this.cargando.set(false); }
  }

  asignar(e: AdminEquipo) {
    if (environment.devEquipoNombre) {
      this.aviso.set(`Modo demo: se asignaría un usuario dueño a ${e.nombre} (disponible con login real + invitación).`);
      return;
    }
    this.aviso.set('La asignación de dueño se habilita con el sistema de invitaciones/login real.');
  }
}
