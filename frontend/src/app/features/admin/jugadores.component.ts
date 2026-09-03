import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { AdminJugador, AdminService } from './admin.service';

const POS = ['PORTERO', 'DEFENSA', 'MEDIO', 'DELANTERO'];
const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/** Admin · Catálogo de jugadores: edición completa de la ficha. */
@Component({
  selector: 'app-admin-jugadores',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (aviso()) { <p class="aviso">{{ aviso() }}</p> }
    @if (error()) { <p class="err">{{ error() }}</p> }

    <input class="buscar" type="search" placeholder="Buscar jugador o club…"
           [ngModel]="filtro()" (ngModelChange)="filtro.set($event); limite.set(40)" />

    @if (cargando()) {
      <p class="muted">Cargando catálogo…</p>
    } @else {
      <p class="total faint">{{ visibles().length }} jugadores</p>
      <div class="tabla card">
        @for (j of visibles().slice(0, limite()); track j.activoId) {
          <div class="fila">
            <span class="pos" [class]="abr(j.posicion)">{{ abr(j.posicion) }}</span>
            <div class="info">
              <span class="nm">{{ j.nombre }}</span>
              <span class="cl">{{ j.club }}</span>
            </div>
            @if (editId() !== j.activoId) {
              @if (!j.primerEquipo) { <span class="chip">no fichable</span> }
              <button class="bn" (click)="editar(j)">✎</button>
            }
          </div>

          @if (editId() === j.activoId) {
            <div class="editor">
              <label>Nombre
                <input [ngModel]="edPila()" (ngModelChange)="edPila.set($event)" />
              </label>
              <label>Apellido
                <input [ngModel]="edApe()" (ngModelChange)="edApe.set($event)" />
              </label>
              <label>Posición
                <select [ngModel]="edPos()" (ngModelChange)="edPos.set($event)">
                  @for (p of pos; track p) { <option [value]="p">{{ p }}</option> }
                </select>
              </label>
              <label>Club
                <select [ngModel]="edClub()" (ngModelChange)="edClub.set($event)">
                  @for (c of clubes(); track c.id) { <option [value]="c.id">{{ c.nombre }}</option> }
                </select>
              </label>
              <label>Dorsal
                <input type="number" [ngModel]="edDor()" (ngModelChange)="edDor.set($event)" style="width:70px" />
              </label>
              <label class="check">
                <input type="checkbox" [ngModel]="edPrim()" (ngModelChange)="edPrim.set($event)" />
                Primer equipo (si no, no sale en mercado ni draft)
              </label>
              <div class="acc">
                <button class="btn" (click)="guardar(j)">Guardar</button>
                <button class="bn no" (click)="editId.set('')">✕</button>
              </div>
              <p class="nota faint">
                El scraper sobrescribe nombre, apellido, club y dorsal en la siguiente ingesta
                del catálogo. Posición y primer equipo son nuestros y se respetan.
              </p>
            </div>
          }
        }
      </div>
      @if (visibles().length > limite()) {
        <button class="mas" (click)="limite.set(limite() + 40)">Ver más ({{ visibles().length - limite() }})</button>
      }
    }
  `,
  styles: [`
    .aviso { background: color-mix(in oklab, var(--por) 8%, var(--surface)); border: 1px solid color-mix(in oklab, var(--por) 32%, var(--line)); color: var(--por); padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; }
    .err { color: var(--bad); }
    .buscar { width: 100%; margin-bottom: 10px; }
    .total { margin: 0 0 10px; font-size: var(--t-sm); }
    .tabla { overflow: hidden; }
    .fila { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-bottom: 1px solid var(--line); }
    .fila:last-child { border-bottom: none; }
    .pos { flex: 0 0 auto; width: 34px; padding: 3px 0; text-align: center; border-radius: 6px; font-size: var(--t-xs); font-weight: 700; color: var(--accent-ink); }
    .pos.POR { background: var(--por); } .pos.DEF { background: var(--def); }
    .pos.MED { background: var(--med); } .pos.DEL { background: var(--del); }
    .info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .nm { font-weight: 700; font-size: var(--t-md); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cl { color: var(--text2); font-size: var(--t-sm); }
    .bn { border: 1px solid var(--line); background: var(--surface2); color: var(--text2); border-radius: 8px;
      width: 30px; height: 30px; cursor: pointer; font-weight: 700; }
    .bn.ok { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
    .bn.no { color: var(--bad); }
    .ed-pos { width: 64px; } .ed-pre { width: 70px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; }
    .editor { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end;
      padding: 12px; border-bottom: 1px solid var(--line); background: var(--surface2); }
    .editor label { display: flex; flex-direction: column; gap: 4px; font-size: var(--t-xs);
      color: var(--text2); font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
    .editor input, .editor select { background: var(--surface); border: 1px solid var(--line);
      border-radius: 8px; padding: 6px 9px; font-size: var(--t-sm); }
    .editor label.check { flex-direction: row; align-items: center; gap: 7px;
      text-transform: none; letter-spacing: 0; font-weight: 600; }
    .editor .acc { display: flex; gap: 7px; align-items: center; }
    .editor .nota { flex: 1 1 100%; margin: 0; font-size: var(--t-xs); line-height: 1.4; }
    .mas { display: block; margin: 16px auto 0; background: var(--surface); border: 1px solid var(--line);
      color: var(--text); border-radius: 12px; padding: 10px 20px; cursor: pointer; font-weight: 700; }
    .muted { color: var(--text2); }
  `],
})
export class AdminJugadoresComponent implements OnInit {
  pos = POS;
  todos = signal<AdminJugador[]>([]);
  filtro = signal('');
  limite = signal(40);
  cargando = signal(true);
  aviso = signal('');
  error = signal('');
  editId = signal('');
  edPos = signal('');
  edPila = signal('');
  edApe = signal('');
  edClub = signal('');
  edDor = signal<number | null>(null);
  edPrim = signal(true);
  clubes = signal<{ id: string; nombre: string }[]>([]);

  visibles = computed(() => {
    const f = this.filtro().trim().toLowerCase();
    return this.todos().filter((j) => !f || j.nombre.toLowerCase().includes(f) || j.club.toLowerCase().includes(f));
  });

  constructor(private admin: AdminService) {}
  abr(p: string) { return ABR[p] ?? p; }

  async ngOnInit() {
    try {
      this.todos.set(await this.admin.jugadores());
      this.clubes.set(await this.admin.clubes());
    }
    catch (e: any) { this.error.set(e?.message ?? 'Error'); }
    finally { this.cargando.set(false); }
  }

  editar(j: AdminJugador) {
    this.editId.set(j.activoId);
    this.edPila.set(j.pila);
    this.edApe.set(j.apellido);
    this.edPos.set(j.posicion);
    this.edClub.set(j.clubId);
    this.edDor.set(j.dorsal);
    this.edPrim.set(j.primerEquipo);
    this.aviso.set('');
  }

  async guardar(j: AdminJugador) {
    if (environment.devEquipoNombre) {
      this.aviso.set(`Modo demo: se actualizaría ${j.nombre} → ${this.abr(this.edPos())} (requiere rol admin).`);
      this.editId.set('');
      return;
    }
    try {
      await this.admin.actualizarJugador({
        activoId: j.activoId,
        jugadorLfpId: j.jugadorLfpId,
        pila: this.edPila().trim(),
        apellido: this.edApe().trim(),
        posicion: this.edPos(),
        clubId: this.edClub(),
        dorsal: this.edDor() === null ? null : Number(this.edDor()),
        primerEquipo: this.edPrim(),
      });
      this.todos.set(await this.admin.jugadores());
      this.editId.set('');
      this.aviso.set('Jugador actualizado.');
    } catch (e: any) { this.error.set(e?.message ?? 'Error al guardar'); }
  }
}
