import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminPeticion, AdminService } from './admin.service';

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
  imports: [FormsModule],
  template: `
    @if (aviso()) { <p class="aviso">{{ aviso() }}</p> }
    @if (error()) { <p class="err">{{ error() }}</p> }

    @if (cargando()) {
      <p class="muted">Cargando peticiones…</p>
    } @else {
      <section class="tabla">
        <div class="barra chips">
          <span class="lb">Peticiones</span>
          <button [class.on]="solo() === 'PENDIENTE'" (click)="solo.set('PENDIENTE')">
            Pendientes @if (pendientes().length) { <i class="cuenta num">{{ pendientes().length }}</i> }
          </button>
          <button [class.on]="solo() === ''" (click)="solo.set('')">Todas</button>
        </div>

        @if (visibles().length === 0) {
          <p class="muted pad">
            {{ solo() === 'PENDIENTE' ? 'No hay ninguna petición pendiente.' : 'Todavía no ha pedido nadie.' }}
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
  solo = signal<'PENDIENTE' | ''>('PENDIENTE');
  motivo = signal('En esta jornada no había mercado de fichajes.');
  cargando = signal(true);
  tocando = signal('');
  error = signal('');
  aviso = signal('');

  pendientes = computed(() => this.peticiones().filter((p) => p.estado === 'PENDIENTE'));
  visibles = computed(() =>
    this.solo() ? this.pendientes() : this.peticiones());

  constructor(private admin: AdminService) {}

  async ngOnInit() { await this.cargar(); }

  private async cargar() {
    this.cargando.set(true);
    try {
      this.peticiones.set(await this.admin.peticiones());
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
