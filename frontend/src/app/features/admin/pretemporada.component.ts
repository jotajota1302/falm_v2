import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService, AdminTemporada } from './admin.service';
import { AdminDraftSorteoComponent, EquipoSorteo } from './draft-sorteo.component';

const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/** Admin · Pretemporada: temporada+competiciones, jornadas+calendario y draft inicial. */
@Component({
  selector: 'app-admin-pretemporada',
  standalone: true,
  imports: [FormsModule, RouterLink, AdminDraftSorteoComponent],
  template: `
    @if (aviso()) { <p class="aviso">{{ aviso() }}</p> }
    @if (error()) { <p class="err">{{ error() }}</p> }

    <!-- 1. Temporada y competiciones -->
    <section class="card">
      <h3>1 · Temporada y competiciones</h3>
      <div class="form">
        <input placeholder="Nombre (ej. 2026-27)" [(ngModel)]="nombreTemp" />
        <input type="number" placeholder="Año" [(ngModel)]="anioTemp" style="width:90px" />
        <button class="btn" (click)="crearTemporada()">Crear temporada</button>
      </div>
      <div class="lista">
        @for (t of temporadas(); track t.id) {
          <div class="row">
            <span class="nm">{{ t.nombre }}</span>
            <span class="anio faint">{{ t.anio }}</span>
            @if (t.activa) { <span class="badge on">ACTIVA</span> }
            @else { <button class="mini" (click)="activar(t)">Activar</button> }
          </div>
        }
      </div>
    </section>

    <!-- 2. Jornadas y calendario -->
    <section class="card">
      <h3>2 · Jornadas y calendario (Liga)</h3>
      <p class="hint">Crea jornadas LFP + FALM, el mapeo configurable y el calendario round-robin.</p>
      <div class="form">
        <label>LFP desde <input type="number" [(ngModel)]="lfpDesde" style="width:70px" /></label>
        <label>hasta <input type="number" [(ngModel)]="lfpHasta" style="width:70px" /></label>
        <button class="btn" (click)="generarJornadas()">Generar jornadas + mapeo</button>
        <button class="btn ghost" (click)="generarCalendario()">Generar calendario</button>
      </div>
    </section>

    <!-- 3. Draft inicial -->
    <section class="card">
      <h3>3 · Draft inicial (snake)</h3>
      @if (cargando()) {
        <p class="hint">Cargando…</p>
      } @else if (!draft()) {
        <p class="hint">No hay draft activo en la temporada. 23 rondas, orden en serpiente.</p>
        <admin-draft-sorteo
          [equipos]="equipos()"
          etiqueta="Crear draft con este orden"
          (confirmado)="crearDraftConOrden($event)" />
        <button class="btn ghost" (click)="crearDraft()">O crear con orden aleatorio</button>
      } @else {
        <div class="draft">
          <div class="dhead">
            <span class="dnombre">{{ draft().nombre }}</span>
            <span class="badge" [attr.data-e]="draft().estado">{{ draft().estado }}</span>
          </div>
          <div class="prog">
            <div class="bar"><span [style.width.%]="pct()"></span></div>
            <span class="pcttxt">{{ draft().picks_hechos }} / {{ draft().picks_totales }} picks</span>
          </div>
          @if (draft().picks_hechos === 0) {
            @if (sorteoAbierto()) {
              <admin-draft-sorteo
                [equipos]="equipos()"
                etiqueta="Guardar este orden"
                (confirmado)="rehacerOrden($event)" />
              <button class="btn ghost" (click)="sorteoAbierto.set(false)">Cancelar</button>
            } @else {
              <button class="btn ghost" (click)="sorteoAbierto.set(true)">
                🎲 Rehacer el orden del sorteo
              </button>
            }
          }
          @if (draft().turno; as t) {
            <div class="turno">
              <span class="tl">Turno</span>
              <b>Ronda {{ t.ronda }}</b> · elige <b>{{ t.equipo }}</b>
              <a class="mini" routerLink="/draft">Ir al tablero</a>
              <button class="mini" (click)="deshacer()">↩ Deshacer último</button>
            </div>
          } @else if (draft().estado === 'COMPLETADO') {
            <button class="btn" (click)="consolidar()">Consolidar → crear plantillas</button>
          }
          <h4 class="ph">Últimas elecciones</h4>
          <div class="picks">
            @for (p of picks(); track p.orden) {
              <div class="pk">
                <span class="o faint">#{{ p.orden }}</span>
                <span class="pos" [class]="abr(p.posicion)">{{ abr(p.posicion) }}</span>
                <span class="pj">{{ p.jugador }}</span>
                <span class="pe faint">→ {{ p.equipo }}</span>
              </div>
            }
          </div>
        </div>
      }
    </section>
  `,
  styles: [`
    section.card { padding: 16px; margin-bottom: 14px; }
    h3 { margin: 0 0 12px; font-size: 15px; }
    h4 { margin: 14px 0 8px; font-size: 13.5px; color: var(--text2); }
    .hint { color: var(--text2); font-size: 13.5px; margin: 0 0 10px; }
    .form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
    .form input { background: var(--surface); border: 1px solid var(--line); border-radius: 9px; padding: 8px 10px; }
    .form label { font-size: 13px; color: var(--text2); display: flex; gap: 6px; align-items: center; }
    .btn.ghost { background: var(--surface2); color: var(--text); border: 1px solid var(--line); }
    .lista { display: flex; flex-direction: column; gap: 6px; }
    .row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--surface2); border: 1px solid var(--line); border-radius: 9px; }
    .nm { font-weight: 700; } .anio { font-size: 13px; } .row .badge { margin-left: auto; }
    .badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--surface2); color: var(--text2); }
    .badge.on, .badge[data-e=EN_CURSO] { background: var(--accent-soft); color: var(--accent); }
    .badge[data-e=COMPLETADO] { background: color-mix(in oklab, var(--por) 13%, var(--surface)); color: var(--por); }
    .mini { background: var(--surface2); border: 1px solid var(--line); color: var(--text); border-radius: 8px; padding: 5px 11px; cursor: pointer; font-weight: 700; font-size: 12px; }
    .aviso { background: color-mix(in oklab, var(--por) 8%, var(--surface)); border: 1px solid color-mix(in oklab, var(--por) 32%, var(--line)); color: var(--por); padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; }
    .err { color: var(--bad); }
    .dhead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .dnombre { font-weight: 700; }
    .prog { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .bar { flex: 1; height: 8px; background: var(--surface2); border-radius: 999px; overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--accent); border-radius: 999px; }
    .pcttxt { font-size: 12px; color: var(--text2); font-weight: 700; white-space: nowrap; }
    .turno { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: var(--accent-soft); border: 1px solid var(--accent-line); border-radius: 10px; font-size: 14px; }
    .turno .tl { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--text2); font-weight: 700; }
    .picks { display: flex; flex-direction: column; gap: 5px; }
    .pk { display: flex; align-items: center; gap: 9px; padding: 6px 9px; background: var(--surface2); border: 1px solid var(--line); border-radius: 8px; font-size: 13px; }
    .pos { flex: 0 0 auto; width: 32px; text-align: center; padding: 2px 0; border-radius: 5px; font-size: 10px; font-weight: 700; color: var(--accent-ink); }
    .pos.POR { background: var(--por); } .pos.DEF { background: var(--def); }
    .pos.MED { background: var(--med); } .pos.DEL { background: var(--del); }
    .turno a.mini { margin-left: auto; text-decoration: none; display: inline-block; }
    .pj { font-weight: 700; } .o { width: 34px; }
  `],
})
export class AdminPretemporadaComponent implements OnInit {
  temporadas = signal<AdminTemporada[]>([]);
  draft = signal<any | null>(null);
  picks = signal<{ orden: number; ronda: number; equipo: string; jugador: string; posicion: string }[]>([]);
  equipos = signal<EquipoSorteo[]>([]);
  sorteoAbierto = signal(false);
  cargando = signal(true);
  aviso = signal('');
  error = signal('');
  nombreTemp = '';
  anioTemp: number | null = null;
  lfpDesde = 5;
  lfpHasta = 36;

  constructor(private admin: AdminService) {}
  abr(p: string) { return ABR[p] ?? p; }
  pct() { const d = this.draft(); return d && d.picks_totales ? Math.round(100 * d.picks_hechos / d.picks_totales) : 0; }

  async ngOnInit() { await this.cargar(); }

  private async cargar() {
    try {
      this.temporadas.set(await this.admin.temporadas());
      this.equipos.set((await this.admin.equipos()).map((e) => ({ id: e.id, nombre: e.nombre })));
      const d = await this.admin.draftActivo();
      this.draft.set(d);
      if (d?.id) this.picks.set(await this.admin.draftPicks(d.id)); else this.picks.set([]);
    } catch (e: any) { this.error.set(e?.message ?? 'Error'); }
    finally { this.cargando.set(false); }
  }

  private async accion(fn: () => Promise<any>, ok: string) {
    this.aviso.set(''); this.error.set('');
    try { await fn(); await this.cargar(); this.aviso.set(ok); }
    catch (e: any) { this.error.set(e?.message ?? 'Error'); }
  }

  async crearTemporada() {
    if (!this.nombreTemp || !this.anioTemp) { this.error.set('Pon nombre y año.'); return; }
    await this.accion(() => this.admin.ejecutar('crear_temporada', { p_nombre: this.nombreTemp, p_anio: this.anioTemp }),
      'Temporada creada con sus 3 competiciones.');
    this.nombreTemp = ''; this.anioTemp = null;
  }
  async activar(t: AdminTemporada) {
    await this.accion(() => this.admin.ejecutar('activar_temporada', { p_temporada: t.id }), `${t.nombre} activada.`);
  }
  async generarJornadas() {
    const t = this.temporadas().find((x) => x.activa);
    if (!t) { this.error.set('No hay temporada activa.'); return; }
    await this.accion(() => this.admin.ejecutar('generar_jornadas_liga', { p_temporada: t.id, p_lfp_desde: this.lfpDesde, p_lfp_hasta: this.lfpHasta }),
      'Jornadas y mapeo generados.');
  }
  async generarCalendario() {
    const t = this.temporadas().find((x) => x.activa);
    if (!t) { this.error.set('No hay temporada activa.'); return; }
    await this.accion(() => this.admin.ejecutar('generar_calendario_liga', { p_temporada: t.id }), 'Calendario generado.');
  }
  async crearDraft() {
    const t = this.temporadas().find((x) => x.activa);
    if (!t) { this.error.set('No hay temporada activa.'); return; }
    await this.accion(() => this.admin.ejecutar('draft_crear', { p_temporada: t.id, p_nombre: 'Draft ' + t.nombre, p_rondas: 23 }),
      'Draft creado.');
  }
  /** Crea el draft con el orden cantado en el sorteo físico. */
  async crearDraftConOrden(orden: string[]) {
    const t = this.temporadas().find((x) => x.activa);
    if (!t) { this.error.set('No hay temporada activa.'); return; }
    await this.accion(
      () => this.admin.ejecutar('draft_crear',
        { p_temporada: t.id, p_nombre: 'Draft ' + t.nombre, p_rondas: 23, p_orden: orden }),
      '✅ Draft creado con el orden del sorteo.'
    );
  }

  /** Rehacer el orden de un draft ya creado. La función lo rechaza si ya hay picks. */
  async rehacerOrden(orden: string[]) {
    const d = this.draft();
    if (!d?.id) return;
    await this.accion(
      () => this.admin.ejecutar('draft_reordenar', { p_draft: d.id, p_orden: orden }),
      '✅ Orden del draft actualizado.'
    );
    this.sorteoAbierto.set(false);
  }

  consolidar() {
    const d = this.draft();
    if (!d?.id) return;
    this.accion(() => this.admin.ejecutar('draft_consolidar', { p_draft: d.id }), 'Draft consolidado: plantillas creadas.');
  }
  /**
   * Deshacer el último pick. En la quedada presencial alguien dicta mal un
   * nombre y hay que poder arreglarlo sin tocar la base a mano.
   */
  async deshacer() {
    const d = this.draft();
    if (!d?.id) return;
    if (!confirm('¿Deshacer el último pick?')) return;
    await this.accion(() => this.admin.draftDeshacer(d.id), 'Pick deshecho.');
  }
}
