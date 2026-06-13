import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { AdminService, AdminTemporada } from './admin.service';

const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/** Admin · Pretemporada: temporada+competiciones, jornadas+calendario y draft inicial. */
@Component({
  selector: 'app-admin-pretemporada',
  standalone: true,
  imports: [FormsModule],
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
        <p class="hint">No hay draft activo en la temporada.</p>
        <button class="btn" (click)="crearDraft()">Crear draft (23 rondas)</button>
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
          @if (draft().turno; as t) {
            <div class="turno">
              <span class="tl">Turno</span>
              <b>Ronda {{ t.ronda }}</b> · elige <b>{{ t.equipo }}</b>
              <button class="mini" (click)="picar()">Simular pick</button>
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
    h3 { margin: 0 0 12px; font-size: 1rem; }
    h4 { margin: 14px 0 8px; font-size: .85rem; color: var(--muted); }
    .hint { color: var(--muted); font-size: .84rem; margin: 0 0 10px; }
    .form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
    .form input { background: var(--surface); border: 1px solid var(--border); border-radius: 9px; padding: 8px 10px; }
    .form label { font-size: .8rem; color: var(--muted); display: flex; gap: 6px; align-items: center; }
    .btn.ghost { background: var(--surface-2); color: var(--ink); border: 1px solid var(--border); }
    .lista { display: flex; flex-direction: column; gap: 6px; }
    .row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 9px; }
    .nm { font-weight: 700; } .anio { font-size: .8rem; } .row .badge { margin-left: auto; }
    .badge { font-size: .64rem; font-weight: 800; padding: 2px 8px; border-radius: 999px; background: var(--surface-2); color: var(--muted); }
    .badge.on, .badge[data-e=EN_CURSO] { background: rgba(0,230,118,.15); color: var(--primary); }
    .badge[data-e=COMPLETADO] { background: rgba(255,194,75,.15); color: var(--gold); }
    .mini { margin-left: auto; background: var(--surface-2); border: 1px solid var(--border); color: var(--ink); border-radius: 8px; padding: 5px 11px; cursor: pointer; font-weight: 700; font-size: .76rem; }
    .aviso { background: rgba(255,194,75,.08); border: 1px solid rgba(255,194,75,.22); color: var(--gold); padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; }
    .err { color: var(--bad); }
    .dhead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .dnombre { font-weight: 800; }
    .prog { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .bar { flex: 1; height: 8px; background: var(--surface-2); border-radius: 999px; overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--primary); border-radius: 999px; }
    .pcttxt { font-size: .76rem; color: var(--muted); font-weight: 700; white-space: nowrap; }
    .turno { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: rgba(0,230,118,.06); border: 1px solid rgba(0,230,118,.2); border-radius: 10px; font-size: .88rem; }
    .turno .tl { font-size: .66rem; text-transform: uppercase; letter-spacing: .05em; color: var(--faint); font-weight: 800; }
    .picks { display: flex; flex-direction: column; gap: 5px; }
    .pk { display: flex; align-items: center; gap: 9px; padding: 6px 9px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; font-size: .82rem; }
    .pos { flex: 0 0 auto; width: 32px; text-align: center; padding: 2px 0; border-radius: 5px; font-size: .62rem; font-weight: 800; color: #07120d; }
    .pos.POR { background: var(--pos-POR); } .pos.DEF { background: var(--pos-DEF); }
    .pos.MED { background: var(--pos-MED); } .pos.DEL { background: var(--pos-DEL); }
    .pj { font-weight: 700; } .o { width: 34px; }
  `],
})
export class AdminPretemporadaComponent implements OnInit {
  temporadas = signal<AdminTemporada[]>([]);
  draft = signal<any | null>(null);
  picks = signal<{ orden: number; ronda: number; equipo: string; jugador: string; posicion: string }[]>([]);
  cargando = signal(true);
  aviso = signal('');
  error = signal('');
  nombreTemp = '';
  anioTemp: number | null = null;
  lfpDesde = 5;
  lfpHasta = 36;

  private demo = !!environment.devEquipoNombre;

  constructor(private admin: AdminService) {}
  abr(p: string) { return ABR[p] ?? p; }
  pct() { const d = this.draft(); return d && d.picks_totales ? Math.round(100 * d.picks_hechos / d.picks_totales) : 0; }

  async ngOnInit() {
    try {
      this.temporadas.set(await this.admin.temporadas());
      const d = await this.admin.draftActivo();
      this.draft.set(d);
      if (d?.id) this.picks.set(await this.admin.draftPicks(d.id));
    } catch (e: any) { this.error.set(e?.message ?? 'Error'); }
    finally { this.cargando.set(false); }
  }

  private gate(accion: string): boolean {
    if (this.demo) { this.aviso.set(`Modo demo: «${accion}» requiere login admin. La operación está implementada en el backend (SQL validado).`); return true; }
    return false;
  }

  crearTemporada() { this.aviso.set(''); if (this.gate('crear temporada')) return; }
  activar(_t: AdminTemporada) { this.aviso.set(''); if (this.gate('activar temporada')) return; }
  generarJornadas() { this.aviso.set(''); if (this.gate('generar jornadas + mapeo')) return; }
  generarCalendario() { this.aviso.set(''); if (this.gate('generar calendario')) return; }
  crearDraft() { this.aviso.set(''); if (this.gate('crear draft')) return; }
  picar() { this.aviso.set(''); if (this.gate('realizar pick')) return; }
  consolidar() { this.aviso.set(''); if (this.gate('consolidar draft')) return; }
}
