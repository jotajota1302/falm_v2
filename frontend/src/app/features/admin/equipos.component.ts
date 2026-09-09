import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { AdminEquipo, AdminService } from './admin.service';
import { colorEquipo } from '../../shared/equipo-colores';

/** Admin · Equipos FALM y asignación de usuario. */
@Component({
  selector: 'app-admin-equipos',
  standalone: true,
  imports: [FormsModule],
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
              <span class="meta">{{ e.jugadores }} jugadores</span>
              <span class="own" [class.sin]="!e.usuarioId">{{ e.usuarioId ? 'Dueño asignado' : 'Sin dueño' }}</span>
            </div>
            <div class="der">
              @if (editId() === e.id) {
                <input [ngModel]="edNombre()" (ngModelChange)="edNombre.set($event)"
                       placeholder="Nombre" style="width:150px" />
                <button class="bn ok" (click)="guardar(e)">✓</button>
                <button class="bn no" (click)="editId.set('')">✕</button>
              } @else if (claveId() === e.id) {
                <input type="text" [ngModel]="clave()" (ngModelChange)="clave.set($event)"
                       placeholder="Contraseña temporal" style="width:190px" />
                <button class="bn ok" [disabled]="clave().length < 8" (click)="ponerClave(e)">✓</button>
                <button class="bn no" (click)="claveId.set('')">✕</button>
              } @else {
                <span class="ben num">{{ e.beneficio }}<small>€</small></span>
                <button class="bn" (click)="editar(e)">✎</button>
                <button class="bn" title="Ponerle una contraseña temporal"
                        (click)="pedirClave(e)">🔑</button>
              }
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .aviso { background: color-mix(in oklab, var(--por) 8%, var(--surface)); border: 1px solid color-mix(in oklab, var(--por) 32%, var(--line)); color: var(--por); padding: 10px 14px; border-radius: var(--r-xs); margin-bottom: 12px; }
    .err { color: var(--bad); } .muted { color: var(--text2); }
    .der input { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-xs);
      padding: 6px 9px; font-size: var(--t-sm); }
    .bn.ok { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
    .bn.no { color: var(--bad); }
    .grid { display: flex; flex-direction: column; gap: 10px; }
    .eq { display: flex; align-items: center; gap: 14px; padding: 14px 16px; }
    .av { flex: 0 0 auto; width: 42px; height: 42px; border-radius: var(--r-sm); display: flex; align-items: center;
      justify-content: center; font-weight: 700; color: var(--accent-ink); }
    .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .info strong { font-size: var(--t-md); }
    .meta { color: var(--text2); font-size: var(--t-sm); }
    .own { font-size: var(--t-xs); font-weight: 700; text-transform: uppercase; color: var(--accent); }
    .own.sin { color: var(--text2); }
    .der { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    .ben { font-weight: 700; color: var(--por); } .ben small { font-size: var(--t-xs); }
    .bn { border: 1px solid var(--line); background: var(--surface2); color: var(--text); border-radius: var(--r-xs);
      padding: 6px 12px; cursor: pointer; font-weight: 700; font-size: var(--t-sm); }
  `],
})
export class AdminEquiposComponent implements OnInit {
  equipos = signal<AdminEquipo[]>([]);
  editId = signal('');
  edNombre = signal('');
  /** Equipo al que se le está poniendo una contraseña temporal, y cuál. */
  claveId = signal('');
  clave = signal('');
  cargando = signal(true);
  aviso = signal('');
  error = signal('');

  constructor(private admin: AdminService) {}
  ini(n: string) { return (n || '?').charAt(0).toUpperCase(); }
  color(n: string) { return colorEquipo(n); }

  async ngOnInit() {
    try { this.equipos.set(await this.admin.equipos()); }
    catch (e: any) { this.error.set(e?.message ?? 'Error'); }
    finally { this.cargando.set(false); }
  }

  /**
   * Contraseña temporal para quien ha perdido la suya. Se sugiere una al azar
   * para no acabar poniéndoles a todos la misma; se puede cambiar antes de dar
   * al visto. No se guarda en claro en ningún sitio: hay que copiarla ahora.
   */
  pedirClave(e: AdminEquipo) {
    this.aviso.set(''); this.error.set(''); this.editId.set('');
    this.claveId.set(e.id);
    this.clave.set('falm-' + Math.random().toString(36).slice(2, 8));
  }

  async ponerClave(e: AdminEquipo) {
    const nueva = this.clave();
    this.error.set('');
    try {
      await this.admin.contrasenaTemporal(e.id, nueva);
      this.claveId.set(''); this.clave.set('');
      this.aviso.set(`${e.nombre} entra ya con «${nueva}». Dásela ahora: no queda guardada.`);
    } catch (err: any) { this.error.set(err?.message ?? 'No se ha podido cambiar'); }
  }

  editar(e: AdminEquipo) {
    this.claveId.set('');
    this.editId.set(e.id);
    this.edNombre.set(e.nombre);
    this.aviso.set('');
  }

  async guardar(e: AdminEquipo) {
    const nombre = this.edNombre().trim();
    if (!nombre) { this.error.set('El nombre no puede quedar vacío.'); return; }
    this.error.set('');
    try {
      await this.admin.actualizarEquipo(e.id, nombre);
      this.equipos.set(await this.admin.equipos());
      this.editId.set('');
      this.aviso.set('Equipo actualizado.');
    } catch (err: any) { this.error.set(err?.message ?? 'Error al guardar'); }
  }

  asignar(e: AdminEquipo) {
    if (environment.devEquipoNombre) {
      this.aviso.set(`Modo demo: se asignaría un usuario dueño a ${e.nombre} (disponible con login real + invitación).`);
      return;
    }
    this.aviso.set('La asignación de dueño se habilita con el sistema de invitaciones/login real.');
  }
}
