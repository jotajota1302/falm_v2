import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService, AdminTemporada, EstadoPretemporada, JornadaCalendario } from './admin.service';
import { ActivoLibre, FalmService } from '../../core/falm.service';
import { AdminDraftSorteoComponent, EquipoSorteo } from './draft-sorteo.component';
import { AdminCalendarioEditorComponent } from './calendario-editor.component';

const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/** Admin · Pretemporada: temporada+competiciones, jornadas+calendario y draft inicial. */
@Component({
  selector: 'app-admin-pretemporada',
  standalone: true,
  imports: [FormsModule, RouterLink, AdminDraftSorteoComponent, AdminCalendarioEditorComponent],
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

      @if (estado(); as e) {
        <div class="estado">
          @if (e.jornadas > 0) {
            <span class="chip chip-ok">{{ e.jornadas }} jornadas · LFP {{ e.lfp_desde }}-{{ e.lfp_hasta }}</span>
          } @else {
            <span class="chip">Sin jornadas</span>
          }
          @if (e.enfrentamientos > 0) {
            <span class="chip chip-ok">{{ e.enfrentamientos }} enfrentamientos</span>
          } @else {
            <span class="chip">Sin calendario</span>
          }
          @if (e.jugados > 0) { <span class="chip chip-warn">{{ e.jugados }} con resultado</span> }
          @if (e.con_alineacion > 0) { <span class="chip chip-warn">{{ e.con_alineacion }} con alineación</span> }
        </div>

        @if (e.bloqueado) {
          <p class="hint alerta">
            La liga ya está en marcha. Regenerar borraría los resultados, así que está
            bloqueado en la propia base de datos. Para retoques puntuales (cambiar un cruce,
            mover una jornada) usa la edición de abajo.
          </p>
        } @else if (e.enfrentamientos > 0 || e.jornadas > 0) {
          <p class="hint">
            Ya está generado. Regenerar <strong>borra el calendario actual y vuelve a sortear</strong>
            los cruces desde cero: solo tiene sentido si aún no habéis empezado.
          </p>
          <label class="conf">
            <input type="checkbox" [ngModel]="confirmar()" (ngModelChange)="confirmar.set($event)" />
            Entiendo que se borra el calendario actual
          </label>
        } @else {
          <p class="hint">Crea jornadas LFP + FALM, el mapeo configurable y el calendario round-robin.</p>
        }

        <div class="form">
          <label>LFP desde <input type="number" [(ngModel)]="lfpDesde" style="width:70px"
                                  [disabled]="e.bloqueado" /></label>
          <label>hasta <input type="number" [(ngModel)]="lfpHasta" style="width:70px"
                              [disabled]="e.bloqueado" /></label>
          <button class="btn" [class.peligro]="e.jornadas > 0"
                  [disabled]="e.bloqueado || (e.jornadas > 0 && !confirmar())"
                  (click)="generarJornadas()">
            {{ e.jornadas > 0 ? 'Regenerar jornadas + mapeo' : 'Generar jornadas + mapeo' }}
          </button>
          <button class="btn ghost" [class.peligro]="e.enfrentamientos > 0"
                  [disabled]="e.bloqueado || e.jornadas === 0 || (e.enfrentamientos > 0 && !confirmar())"
                  (click)="generarCalendario()">
            {{ e.enfrentamientos > 0 ? 'Regenerar calendario' : 'Generar calendario' }}
          </button>
        </div>

        @if (jornadas().length) {
          <h4 class="ph">Editar el calendario sin rehacerlo</h4>
          <p class="hint">
            Cambiar un cruce concreto o mover una jornada a otra jornada de LaLiga. Esto sí se
            puede con la liga en marcha, salvo en las jornadas ya jugadas.
          </p>
          <admin-calendario-editor
            [jornadas]="jornadas()"
            [equipos]="equipos()"
            (cruceEditado)="editarCruce($event)"
            (jornadaEditada)="editarJornada($event)" />
        }
      }
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
          <!-- Un solo camino para volver a empezar: vacía las elecciones (si las
               hay) y lleva al sorteo. Antes había dos botones que hacían cosas
               parecidas y no se entendía cuál tocaba. -->
          @if (draft().estado !== 'CONSOLIDADO') {
            <div class="dacc">
              @if (sorteoAbierto()) {
                <p class="hint">Pulsa los equipos en el orden que salga en el sorteo.</p>
                <admin-draft-sorteo
                  [equipos]="equipos()"
                  etiqueta="Guardar este orden"
                  (confirmado)="rehacerOrden($event)" />
                <button class="btn ghost" (click)="sorteoAbierto.set(false)">Cancelar</button>
              } @else if (reinicioAbierto()) {
                <div class="reinicio">
                  <p class="rtit"><b>Vas a borrar los {{ draft().picks_hechos }} picks del draft.</b></p>
                  <p class="hint">
                    Todos los equipos se quedan sin elecciones y, al terminar, se abre el
                    sorteo para repartir el orden otra vez. <b>Esto no se deshace</b>, aunque
                    se guarda una copia de seguridad automática antes de borrar.
                  </p>
                  <label class="rconf">
                    Escribe <b>BORRAR</b> para confirmar
                    <input type="text" [ngModel]="confirmaTexto()"
                           (ngModelChange)="confirmaTexto.set($event)" placeholder="BORRAR" />
                  </label>
                  <div class="racc">
                    <button class="btn ghost" (click)="reinicioAbierto.set(false); confirmaTexto.set('')">
                      Cancelar
                    </button>
                    <button class="btn peligro" [disabled]="confirmaTexto().trim().toUpperCase() !== 'BORRAR'"
                            (click)="reiniciarDraft()">
                      Borrar y sortear de nuevo
                    </button>
                  </div>
                </div>
              } @else {
                <!-- Siempre el mismo nombre: cambiarlo según el caso hacía que no
                     se encontrara el botón que se venía buscando. -->
                <button class="btn ghost peligro" (click)="empezarDeCero()">
                  Empezar el draft de cero
                </button>
                <p class="hint mini">
                  @if (draft().picks_hechos > 0) {
                    Borra las {{ draft().picks_hechos }} elecciones hechas y vuelve a repartir el orden
                    del sorteo. Pedirá confirmación.
                  } @else {
                    El draft está vacío: esto solo vuelve a repartir el orden del sorteo, que ahora
                    empieza por {{ primerEquipo() || '—' }}.
                  }
                </p>
              }
            </div>
          }
          @if (draft().turno; as t) {
            <div class="turno">
              <span class="tl">Turno</span>
              <b>Ronda {{ t.ronda }}</b> · elige <b>{{ t.equipo }}</b>
              <a class="mini" routerLink="/draft">Ir al tablero</a>
              <button class="mini" (click)="deshacer()">↩ Deshacer último</button>
            </div>

            <h4 class="ph">Fichar por {{ t.equipo }}</h4>
            <p class="hint">
              Para quien esté en la quedada sin móvil y cante su elección en voz alta.
              En el tablero cada uno ficha solo en su turno, también tú.
            </p>
            <input class="buscarj" type="search"
                   [placeholder]="'Buscar jugador para ' + t.equipo + '…'"
                   [ngModel]="buscaJ()" (ngModelChange)="buscaJ.set($event)" />
            @if (buscaJ().length > 1) {
              @if (candidatos().length === 0) {
                <p class="hint">Ningún jugador libre con ese nombre.</p>
              } @else {
                <div class="cands">
                  @for (c of candidatos(); track c.activo_id) {
                    <button class="cand" (click)="picarPara(c, t)">
                      <span class="pos" [class]="abr(c.posicion)">{{ abr(c.posicion) }}</span>
                      <span class="cn">{{ c.nombre }}</span>
                      <span class="cc faint">{{ c.club }}</span>
                    </button>
                  }
                </div>
              }
            }
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
    h3 { margin: 0 0 12px; font-size: var(--t-md); }
    h4 { margin: 14px 0 8px; font-size: var(--t-sm); color: var(--text2); }
    .hint { color: var(--text2); font-size: var(--t-sm); margin: 0 0 10px; }
    /* Empezar de cero: se enseña en rojo y pide escribir la palabra, porque
       borra todas las elecciones y no hay vuelta atrás. */
    .btn.peligro { background: var(--bad); border-color: var(--bad); color: #fff; }
    .btn.ghost.peligro { background: none; color: var(--bad); border-color: var(--bad); }
    .btn.peligro:disabled { opacity: .45; }
    .reinicio { border: 1px solid var(--bad); border-radius: var(--r-sm);
      padding: 13px 15px; margin: 10px 0; background: var(--surface2); }
    .dacc { margin: 16px 0 6px; padding-top: 14px; border-top: 1px solid var(--line); }
    .dacc .hint.mini { margin: 7px 0 0; font-size: var(--t-xs); }
    .rtit { margin: 0 0 6px; font-size: var(--t-sm); }
    .rtit b { color: var(--bad); }
    .rconf { display: flex; gap: 8px; align-items: center; font-size: var(--t-sm);
      color: var(--text2); margin-bottom: 11px; flex-wrap: wrap; }
    .rconf input { width: 130px; }
    .racc { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
    .form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
    .form input { background: var(--surface); border: 1px solid var(--line); border-radius: 9px; padding: 8px 10px; }
    .form label { font-size: var(--t-sm); color: var(--text2); display: flex; gap: 6px; align-items: center; }
    .buscarj { width: 100%; margin-bottom: 9px; }
    .cands { display: flex; flex-direction: column; gap: 5px; margin-bottom: 6px; }
    .cand { display: grid; grid-template-columns: 34px 1fr auto; gap: 9px; align-items: center;
      padding: 8px 10px; background: var(--surface2); border: 1px solid var(--line);
      border-radius: var(--r-xs); cursor: pointer; text-align: left; font-family: var(--fb);
      font-size: var(--t-sm); color: var(--text); }
    .cand:hover { border-color: var(--accent); }
    .cand .cn { font-weight: 700; }
    .cand .cc { font-size: var(--t-xs); text-transform: uppercase; letter-spacing: .06em; }
    .estado { display: flex; gap: 7px; flex-wrap: wrap; margin-bottom: 10px; }
    .hint.alerta { color: var(--bad); border-left: 2px solid var(--bad); padding-left: 9px; }
    .conf { display: flex; gap: 7px; align-items: center; margin-bottom: 11px;
      font-size: var(--t-sm); color: var(--text2); cursor: pointer; }
    .btn.peligro { background: var(--bad); border-color: var(--bad); color: #fff; }
    .btn.ghost.peligro { background: var(--surface); color: var(--bad); border-color: var(--bad); }
    .btn.ghost { background: var(--surface2); color: var(--text); border: 1px solid var(--line); }
    .lista { display: flex; flex-direction: column; gap: 6px; }
    .row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--surface2); border: 1px solid var(--line); border-radius: 9px; }
    .nm { font-weight: 700; } .anio { font-size: var(--t-sm); } .row .badge { margin-left: auto; }
    .badge { font-size: var(--t-xs); font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--surface2); color: var(--text2); }
    .badge.on, .badge[data-e=EN_CURSO] { background: var(--accent-soft); color: var(--accent); }
    .badge[data-e=COMPLETADO] { background: color-mix(in oklab, var(--por) 13%, var(--surface)); color: var(--por); }
    .mini { background: var(--surface2); border: 1px solid var(--line); color: var(--text); border-radius: 8px; padding: 5px 11px; cursor: pointer; font-weight: 700; font-size: var(--t-sm); }
    .aviso { background: color-mix(in oklab, var(--por) 8%, var(--surface)); border: 1px solid color-mix(in oklab, var(--por) 32%, var(--line)); color: var(--por); padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; }
    .err { color: var(--bad); }
    .dhead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .dnombre { font-weight: 700; }
    .prog { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .bar { flex: 1; height: 8px; background: var(--surface2); border-radius: 999px; overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--accent); border-radius: 999px; }
    .pcttxt { font-size: var(--t-sm); color: var(--text2); font-weight: 700; white-space: nowrap; }
    .turno { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: var(--accent-soft); border: 1px solid var(--accent-line); border-radius: 10px; font-size: var(--t-md); flex-wrap: wrap; }
    .turno .tl { font-size: var(--t-xs); text-transform: uppercase; letter-spacing: .05em; color: var(--text2); font-weight: 700; }
    .picks { display: flex; flex-direction: column; gap: 5px; }
    .pk { display: flex; align-items: center; gap: 9px; padding: 6px 9px; background: var(--surface2); border: 1px solid var(--line); border-radius: 8px; font-size: var(--t-sm); }
    .pos { flex: 0 0 auto; width: 32px; text-align: center; padding: 2px 0; border-radius: 5px; font-size: var(--t-xs); font-weight: 700; color: var(--accent-ink); }
    .pos.POR { background: var(--por); } .pos.DEF { background: var(--def); }
    .pos.MED { background: var(--med); } .pos.DEL { background: var(--del); }
    .turno a.mini { margin-left: auto; text-decoration: none; display: inline-block; }
    /* El panel se usa desde el móvil en la quedada del draft: nada de scroll
       lateral. La tira de turno se envuelve y los botones ocupan la fila. */
    @media (max-width: 620px) {
      .turno { font-size: var(--t-sm); }
      .turno a.mini, .turno button.mini { margin-left: 0; flex: 1 1 auto; text-align: center; }
    }
    .pj { font-weight: 700; } .o { width: 34px; }
  `],
})
export class AdminPretemporadaComponent implements OnInit {
  temporadas = signal<AdminTemporada[]>([]);
  draft = signal<any | null>(null);
  reinicioAbierto = signal(false);
  confirmaTexto = signal('');
  picks = signal<{ orden: number; ronda: number; equipo: string; jugador: string; posicion: string }[]>([]);
  equipos = signal<EquipoSorteo[]>([]);
  estado = signal<EstadoPretemporada | null>(null);
  jornadas = signal<JornadaCalendario[]>([]);
  confirmar = signal(false);
  catalogo = signal<ActivoLibre[]>([]);
  elegidos = signal<Set<string>>(new Set());
  buscaJ = signal('');
  sorteoAbierto = signal(false);
  cargando = signal(true);
  aviso = signal('');
  error = signal('');
  nombreTemp = '';
  anioTemp: number | null = null;
  lfpDesde = 5;
  lfpHasta = 36;

  constructor(private admin: AdminService, private falm: FalmService) {}
  abr(p: string) { return ABR[p] ?? p; }
  pct() { const d = this.draft(); return d && d.picks_totales ? Math.round(100 * d.picks_hechos / d.picks_totales) : 0; }

  async ngOnInit() { await this.cargar(); }

  private async cargar() {
    try {
      this.temporadas.set(await this.admin.temporadas());
      this.equipos.set((await this.admin.equipos()).map((e) => ({ id: e.id, nombre: e.nombre })));
      const act = this.temporadas().find((x) => x.activa);
      if (act) {
        const est = await this.admin.estadoPretemporada(act.id);
        this.estado.set(est);
        // El rango que se ofrece es el que ya hay, para no proponer un cambio sin querer.
        if (est.lfp_desde != null) this.lfpDesde = est.lfp_desde;
        if (est.lfp_hasta != null) this.lfpHasta = est.lfp_hasta;
        this.jornadas.set(await this.admin.calendarioLiga(act.id));
      } else {
        this.estado.set(null);
        this.jornadas.set([]);
      }
      const d = await this.admin.draftActivo();
      this.draft.set(d);
      if (d?.id) {
        this.picks.set(await this.admin.draftPicks(d.id));
        this.elegidos.set(new Set(await this.admin.draftPickIds(d.id)));
        if (!this.catalogo().length) this.catalogo.set(await this.falm.mercadoLibre());
      } else {
        this.picks.set([]);
        this.elegidos.set(new Set());
      }
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
    await this.accion(() => this.admin.ejecutar('generar_jornadas_liga',
      { p_temporada: t.id, p_lfp_desde: this.lfpDesde, p_lfp_hasta: this.lfpHasta, p_forzar: this.confirmar() }),
      'Jornadas y mapeo generados.');
  }
  async generarCalendario() {
    const t = this.temporadas().find((x) => x.activa);
    if (!t) { this.error.set('No hay temporada activa.'); return; }
    await this.accion(() => this.admin.ejecutar('generar_calendario_liga',
      { p_temporada: t.id, p_forzar: this.confirmar() }), 'Calendario generado.');
    this.confirmar.set(false);
  }
  async crearDraft() {
    const t = this.temporadas().find((x) => x.activa);
    if (!t) { this.error.set('No hay temporada activa.'); return; }
    await this.accion(() => this.admin.ejecutar('draft_crear', { p_temporada: t.id, p_nombre: 'Draft ' + t.nombre, p_rondas: 23 }),
      'Draft creado.');
  }
  /** Cambia los equipos de un cruce (o les da la vuelta). */
  async editarCruce([id, local, visitante]: [string, string, string]) {
    await this.accion(() => this.admin.editarCruce(id, local, visitante), 'Cruce actualizado.');
  }

  /** Mueve una jornada FALM a otra jornada de LaLiga. */
  async editarJornada([id, lfp]: [string, number]) {
    await this.accion(() => this.admin.editarJornada(id, lfp), 'Jornada remapeada.');
  }

  /** Ocho candidatos como mucho: esto se usa con alguien esperando al lado. */
  readonly candidatos = computed(() => {
    const t = this.buscaJ().trim().toLowerCase();
    if (t.length < 2) return [];
    const fuera = this.elegidos();
    return this.catalogo()
      .filter((a) => !fuera.has(a.activo_id) &&
        `${a.nombre} ${a.club}`.toLowerCase().includes(t))
      .slice(0, 8);
  });

  /** Mete el pick del equipo al que le toca. La función valida turno y cupos. */
  async picarPara(c: ActivoLibre, t: any) {
    const d = this.draft();
    if (!d?.id || !t?.equipo_falm_id) return;
    if (!confirm(`¿Fichar a ${c.nombre} para ${t.equipo}?`)) return;
    await this.accion(
      () => this.admin.ejecutar('draft_pick',
        { p_draft: d.id, p_activo: c.activo_id, p_equipo: t.equipo_falm_id }),
      `✅ ${c.nombre} fichado para ${t.equipo}.`
    );
    this.buscaJ.set('');
  }

  /** Crea el draft con el orden cantado en el sorteo físico. */
  async crearDraftConOrden(orden: string[]) {
    const t = this.temporadas().find((x) => x.activa);
    if (!t) { this.error.set('No hay temporada activa.'); return; }
    await this.accion(
      () => this.admin.ejecutar('draft_crear',
        { p_temporada: t.id, p_nombre: 'Draft ' + t.nombre, p_rondas: 23, p_orden: orden }),
      'Draft creado con el orden del sorteo.'
    );
  }

  /** Rehacer el orden de un draft ya creado. La función lo rechaza si ya hay picks. */
  async rehacerOrden(orden: string[]) {
    const d = this.draft();
    if (!d?.id) return;
    await this.accion(
      () => this.admin.ejecutar('draft_reordenar', { p_draft: d.id, p_orden: orden }),
      'Orden del draft actualizado.'
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
  /** Quién abre el draft con el orden actual: se dice en el botón de reinicio. */
  primerEquipo() { return this.draft()?.turno?.equipo ?? ''; }

  /** Un único camino: si hay elecciones, primero se confirma; si no, al sorteo. */
  empezarDeCero() {
    const d = this.draft();
    if (d?.picks_hechos > 0) { this.reinicioAbierto.set(true); this.confirmaTexto.set(''); }
    else this.sorteoAbierto.set(true);
  }

  async reiniciarDraft() {
    const d = this.draft();
    if (!d?.id || this.confirmaTexto().trim().toUpperCase() !== 'BORRAR') return;
    const n = d.picks_hechos;
    await this.accion(
      () => this.admin.ejecutar('draft_reiniciar', { p_draft: d.id, p_confirmar: true }),
      `Draft vaciado: ${n} picks borrados. Ya puedes rehacer el sorteo del orden.`
    );
    this.reinicioAbierto.set(false);
    this.confirmaTexto.set('');
    this.sorteoAbierto.set(true);   // vaciado: lo siguiente es repartir el orden
  }

  async deshacer() {
    const d = this.draft();
    if (!d?.id) return;
    if (!confirm('¿Deshacer el último pick?')) return;
    await this.accion(() => this.admin.draftDeshacer(d.id), 'Pick deshecho.');
  }
}
