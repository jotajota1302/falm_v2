import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { ActivoLibre, Equipo, FalmService, JornadaFalm } from '../../core/falm.service';

/** Petición de fichaje semanal: elegir hasta 2 objetivos por prioridad. */
@Component({
  selector: 'app-fichajes',
  standalone: true,
  imports: [FormsModule],
  template: `
    <h1>🔁 Fichajes</h1>

    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else if (error()) {
      <p class="err">{{ error() }}</p>
    } @else {
      <div class="peticion card">
        <div class="slot">
          <span class="pr">1ª opción</span>
          @if (p1()) { <span class="sel">{{ p1()!.nombre }} <button (click)="quitar(1)">✕</button></span> }
          @else { <span class="vacio">elige abajo</span> }
        </div>
        <div class="slot">
          <span class="pr">2ª opción</span>
          @if (p2()) { <span class="sel">{{ p2()!.nombre }} <button (click)="quitar(2)">✕</button></span> }
          @else { <span class="vacio">opcional</span> }
        </div>
        <button class="enviar" [disabled]="!p1() || enviando()" (click)="enviar()">
          {{ enviando() ? '…' : 'Enviar petición' }}
        </button>
      </div>

      @if (aviso()) { <p class="aviso">{{ aviso() }}</p> }

      <input class="buscar" type="search" placeholder="Buscar jugador o club…" [(ngModel)]="filtro" />
      <div class="grid">
        @for (a of visibles(); track a.activo_id) {
          <div class="card jug">
            <div class="info">
              <span class="nom">{{ a.nombre }}</span>
              <span class="club">{{ a.club }} · {{ a.precio_mercado }}</span>
            </div>
            <div class="acc">
              <button [class.on]="p1()?.activo_id === a.activo_id" (click)="asignar(a, 1)">P1</button>
              <button [class.on]="p2()?.activo_id === a.activo_id" (click)="asignar(a, 2)">P2</button>
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    h1 { margin: 0 0 14px; }
    .peticion { display: flex; align-items: center; gap: 14px; padding: 14px 16px; margin-bottom: 12px; flex-wrap: wrap; }
    .slot { display: flex; flex-direction: column; gap: 2px; min-width: 130px; }
    .slot .pr { font-size: .72rem; color: var(--muted); text-transform: uppercase; }
    .sel { font-weight: 600; display: flex; align-items: center; gap: 6px; }
    .sel button { border: none; background: rgba(251,113,133,.16); color: #fb7185; border-radius: 6px; cursor: pointer; padding: 0 6px; }
    .vacio { color: var(--faint); }
    .enviar { margin-left: auto; padding: 9px 18px; border: none; border-radius: 10px; background: var(--primary);
      color: #fff; font-weight: 700; cursor: pointer; }
    .enviar:disabled { opacity: .5; cursor: not-allowed; }
    .aviso { background: rgba(0,230,118,.08); border: 1px solid rgba(0,230,118,.22); color: var(--primary); padding: 10px 14px; border-radius: 10px; }
    .buscar { width: 100%; padding: 11px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm);
      font-size: 1rem; margin: 8px 0 14px; background: var(--surface); }
    .grid { display: flex; flex-direction: column; gap: 8px; }
    .jug { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; }
    .info { display: flex; flex-direction: column; }
    .nom { font-weight: 600; } .club { color: var(--muted); font-size: .82rem; }
    .acc { display: flex; gap: 6px; }
    .acc button { width: 38px; padding: 7px 0; border: 1px solid var(--border); background: var(--surface);
      border-radius: 8px; cursor: pointer; font-weight: 700; font-size: .8rem; }
    .acc button.on { background: var(--primary); color: #fff; border-color: var(--primary); }
    .muted { color: var(--muted); } .err { color: var(--bad); }
  `],
})
export class FichajesComponent implements OnInit {
  equipo = signal<Equipo | null>(null);
  jornada = signal<JornadaFalm | null>(null);
  mercado = signal<ActivoLibre[]>([]);
  p1 = signal<ActivoLibre | null>(null);
  p2 = signal<ActivoLibre | null>(null);
  filtro = '';
  cargando = signal(true);
  enviando = signal(false);
  error = signal('');
  aviso = signal('');

  visibles = computed(() => {
    const f = this.filtro.trim().toLowerCase();
    const l = this.mercado();
    return f ? l.filter((a) => a.nombre.toLowerCase().includes(f) || a.club.toLowerCase().includes(f)) : l;
  });

  constructor(private falm: FalmService) {}

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

  asignar(a: ActivoLibre, prioridad: 1 | 2) {
    if (prioridad === 1) { if (this.p2()?.activo_id === a.activo_id) this.p2.set(null); this.p1.set(a); }
    else { if (this.p1()?.activo_id === a.activo_id) this.p1.set(null); this.p2.set(a); }
  }
  quitar(prioridad: 1 | 2) { (prioridad === 1 ? this.p1 : this.p2).set(null); }

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
