import { Component, OnInit, WritableSignal, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { ActivoMini, Equipo, FalmService, ItemPlantilla, OfertaIntercambio } from '../../core/falm.service';

const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/** Intercambios: bandeja de ofertas (recibidas/enviadas) + compositor de nueva oferta. */
@Component({
  selector: 'app-intercambios',
  standalone: true,
  imports: [FormsModule],
  template: `
    <header class="phead">
      <div>
        <h1>Intercambios</h1>
        <p class="sub">Cambia jugadores con otro equipo. La oferta se cierra cuando el otro la acepta.</p>
      </div>
    </header>

    <div class="tabs">
      <button [class.on]="tab() === 'bandeja'" (click)="tab.set('bandeja')">Bandeja
        @if (pendientes() > 0) { <span class="dot">{{ pendientes() }}</span> }
      </button>
      <button [class.on]="tab() === 'nueva'" (click)="tab.set('nueva')">Nueva oferta</button>
    </div>

    @if (aviso()) { <p class="aviso">{{ aviso() }}</p> }
    @if (error()) { <p class="err">{{ error() }}</p> }

    @if (tab() === 'bandeja') {
      @if (cargando()) {
        <p class="muted">Cargando…</p>
      } @else if (ofertas().length === 0) {
        <p class="muted">No tienes ofertas todavía. Crea una en «Nueva oferta».</p>
      } @else {
        <div class="lista">
          @for (o of ofertas(); track o.id) {
            <div class="oferta card rise">
              <div class="ohead">
                <span class="dir">{{ o.soyOferente ? 'Enviada a' : 'Recibida de' }}
                  <b>{{ o.soyOferente ? o.receptor : o.oferente }}</b></span>
                <span class="est" [attr.data-e]="o.estado">{{ estado(o.estado) }}</span>
              </div>
              <div class="cambio">
                <div class="col">
                  <span class="cl">{{ o.soyOferente ? 'Ofreces' : 'Te ofrecen' }}</span>
                  @for (a of o.ofrecidos; track a.nombre) {
                    <span class="mini" [attr.data-pos]="abr(a.posicion)">
                      @if (a.foto) { <img [src]="a.foto" alt="" /> } @else { <i>{{ abr(a.posicion) }}</i> }
                      {{ a.nombre }}
                    </span>
                  }
                </div>
                <span class="swap">⇄</span>
                <div class="col">
                  <span class="cl">{{ o.soyOferente ? 'Pides' : 'Te piden' }}</span>
                  @for (a of o.solicitados; track a.nombre) {
                    <span class="mini" [attr.data-pos]="abr(a.posicion)">
                      @if (a.foto) { <img [src]="a.foto" alt="" /> } @else { <i>{{ abr(a.posicion) }}</i> }
                      {{ a.nombre }}
                    </span>
                  }
                </div>
              </div>
              @if (o.comentario) { <p class="coment">“{{ o.comentario }}”</p> }
              @if (o.estado === 'PENDIENTE') {
                <div class="acc">
                  @if (o.soyOferente) {
                    <button class="bn cancel" (click)="responder(o, 'CANCELADA')">Cancelar</button>
                  } @else {
                    <button class="bn ok" (click)="responder(o, 'ACEPTADA')">Aceptar</button>
                    <button class="bn no" (click)="responder(o, 'RECHAZADA')">Rechazar</button>
                  }
                </div>
              }
            </div>
          }
        </div>
      }
    }

    @if (tab() === 'nueva') {
      <div class="nueva">
        <label class="campo">
          <span>Equipo rival</span>
          <select [ngModel]="rivalId()" (ngModelChange)="seleccionarRival($event)">
            <option value="">— elige un equipo —</option>
            @for (e of rivales(); track e.id) { <option [value]="e.id">{{ e.nombre }}</option> }
          </select>
        </label>

        @if (rivalId()) {
          <div class="dos">
            <div class="lado card">
              <h3 class="lt">Ofreces <small>{{ ofrecidos().length }}</small></h3>
              @for (j of miPlantilla(); track j.activo_id) {
                <button class="fila" [class.sel]="ofrecidos().includes(j.activo_id)" (click)="toggle(ofrecidosSet, j.activo_id)">
                  <span class="pos" [class]="abr(j.posicion)">{{ abr(j.posicion) }}</span>
                  <span class="nm">{{ j.nombre }}</span>
                  <span class="tick">{{ ofrecidos().includes(j.activo_id) ? '✓' : '' }}</span>
                </button>
              }
            </div>
            <div class="lado card">
              <h3 class="lt">Pides <small>{{ solicitados().length }}</small></h3>
              @if (cargandoRival()) { <p class="muted">Cargando plantilla…</p> }
              @for (j of plantillaRival(); track j.activo_id) {
                <button class="fila" [class.sel]="solicitados().includes(j.activo_id)" (click)="toggle(solicitadosSet, j.activo_id)">
                  <span class="pos" [class]="abr(j.posicion)">{{ abr(j.posicion) }}</span>
                  <span class="nm">{{ j.nombre }}</span>
                  <span class="tick">{{ solicitados().includes(j.activo_id) ? '✓' : '' }}</span>
                </button>
              }
            </div>
          </div>

          <textarea class="coment-in" rows="2" placeholder="Comentario (opcional)…" [(ngModel)]="comentario"></textarea>
          <button class="enviar btn" [disabled]="!puedeEnviar() || enviando()" (click)="enviar()">
            {{ enviando() ? '…' : 'Enviar oferta' }}
          </button>
        }
      </div>
    }
  `,
  styles: [`
    .tabs { display: flex; gap: 8px; margin-bottom: 14px; }
    .tabs button { background: var(--surface); border: 1px solid var(--line); color: var(--text2);
      border-radius: var(--pill); padding: 8px 18px; cursor: pointer;
      font-family: var(--fb); font-weight: 600; font-size: 12.5px; }
    .tabs button.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
    .dot { background: var(--bad); color: #fff; border-radius: var(--pill); padding: 0 7px;
      font-family: var(--fm); font-size: 10px; margin-left: 6px; }

    .aviso { background: var(--accent-soft); border: 1px solid var(--accent-line); color: var(--accent);
      padding: 11px 14px; border-radius: var(--r-sm); margin-bottom: 12px; font-size: 13px; }
    .err { color: var(--bad); } .muted { color: var(--text2); }

    .lista { display: flex; flex-direction: column; gap: 12px; }
    .oferta { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); padding: 15px 16px; }
    .ohead { display: flex; align-items: center; justify-content: space-between; gap: 10px;
      padding-bottom: 11px; border-bottom: 1px solid var(--line); margin-bottom: 13px; }
    .dir { color: var(--text2); font-size: 12.5px; } .dir b { color: var(--text); }
    .est { font-size: 9px; font-weight: 700; padding: 3px 10px; border-radius: var(--pill);
      text-transform: uppercase; letter-spacing: .14em; border: 1px solid var(--line); color: var(--text2); }
    .est[data-e=PENDIENTE] { color: var(--por); border-color: color-mix(in oklab, var(--por) 34%, var(--line)); }
    .est[data-e=ACEPTADA] { color: var(--good); border-color: color-mix(in oklab, var(--good) 34%, var(--line)); }
    .est[data-e=RECHAZADA], .est[data-e=CANCELADA], .est[data-e=EXPIRADA] { color: var(--bad); border-color: color-mix(in oklab, var(--bad) 30%, var(--line)); }

    .cambio { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: start; }
    .col { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .cl { font-size: 9px; text-transform: uppercase; letter-spacing: .16em; color: var(--text2); font-weight: 700; }
    .swap { align-self: center; font-size: 17px; color: var(--text2); }
    .mini { display: flex; align-items: center; gap: 8px; background: var(--surface2); border: 1px solid var(--line);
      border-radius: 9px; padding: 6px 9px; font-size: 12.5px; font-weight: 600; min-width: 0; }
    .mini img { width: 22px; height: 22px; border-radius: 6px; object-fit: cover; flex: 0 0 auto; }
    .mini i { width: 26px; padding: 3px 0; border-radius: 5px; text-align: center; flex: 0 0 auto;
      font-size: 8px; font-weight: 700; letter-spacing: .06em; font-style: normal;
      color: #fff; background: var(--text2); }
    .mini[data-pos=POR] i { background: var(--por); } .mini[data-pos=DEF] i { background: var(--def); }
    .mini[data-pos=MED] i { background: var(--med); } .mini[data-pos=DEL] i { background: var(--del); }
    .coment { margin: 13px 0 0; color: var(--text2); font-size: 12.5px; }
    .acc { display: flex; gap: 8px; margin-top: 14px; }
    .bn { border: 1px solid var(--line); border-radius: 10px; padding: 9px 18px; cursor: pointer;
      font-family: var(--fb); font-weight: 700; font-size: 12.5px; background: var(--surface); color: var(--text); }
    .bn.ok { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
    .bn.no, .bn.cancel { color: var(--bad); }

    .nueva { display: flex; flex-direction: column; gap: 14px; }
    .campo { display: flex; flex-direction: column; gap: 6px; }
    .campo span { font-size: 9px; text-transform: uppercase; letter-spacing: .16em; color: var(--text2); font-weight: 700; }
    .dos { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .lado { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r);
      padding: 14px; max-height: 420px; overflow-y: auto; }
    .lt { margin: 0 0 11px; } .lt small { font-family: var(--fm); color: var(--accent); margin-left: 4px; }
    .fila { width: 100%; display: flex; align-items: center; gap: 9px; padding: 9px 10px; margin-bottom: 5px;
      background: var(--surface); border: 1px solid var(--line); border-radius: 9px; cursor: pointer; }
    .fila:hover { background: var(--surface2); }
    .fila.sel { border-color: var(--accent); background: var(--accent-soft); }
    .nm { flex: 1; text-align: left; font-weight: 600; font-size: 12.5px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tick { color: var(--accent); font-weight: 700; }
    .coment-in { width: 100%; font-family: var(--fb); font-size: 14px; background: var(--surface);
      border: 1px solid var(--line); border-radius: var(--r-sm); padding: 11px 14px; resize: vertical; color: var(--text); }
    .enviar { align-self: flex-start; } .enviar:disabled { opacity: .45; cursor: not-allowed; }

    @media (max-width: 620px) {
      .dos { grid-template-columns: 1fr; }
      .cambio { grid-template-columns: 1fr; }
      .swap { justify-self: center; transform: rotate(90deg); }
    }
  `],
})
export class IntercambiosComponent implements OnInit {
  tab = signal<'bandeja' | 'nueva'>('bandeja');
  equipo = signal<Equipo | null>(null);
  ofertas = signal<OfertaIntercambio[]>([]);
  rivales = signal<{ id: string; nombre: string }[]>([]);
  miPlantilla = signal<ItemPlantilla[]>([]);
  plantillaRival = signal<ItemPlantilla[]>([]);
  rivalId = signal('');
  ofrecidosSet = signal<Set<string>>(new Set());
  solicitadosSet = signal<Set<string>>(new Set());
  comentario = '';
  cargando = signal(true);
  cargandoRival = signal(false);
  enviando = signal(false);
  aviso = signal('');
  error = signal('');

  ofrecidos = computed(() => [...this.ofrecidosSet()]);
  solicitados = computed(() => [...this.solicitadosSet()]);
  pendientes = computed(() => this.ofertas().filter((o) => o.estado === 'PENDIENTE' && !o.soyOferente).length);
  puedeEnviar = computed(() => !!this.rivalId() && this.ofrecidos().length > 0 && this.solicitados().length > 0);

  /** El estado en la bandeja se lee en castellano, no como constante de la base. */
  estado(e: string) {
    return ({ PENDIENTE: 'Pendiente', ACEPTADA: 'Aceptada', RECHAZADA: 'Rechazada',
              CANCELADA: 'Cancelada', EXPIRADA: 'Expirada' } as Record<string, string>)[e] ?? e;
  }

  constructor(private falm: FalmService) {}
  abr(p?: string) { return ABR[p ?? ''] ?? 'MED'; }

  async ngOnInit() {
    try {
      const eq = await this.falm.miEquipo();
      this.equipo.set(eq);
      if (!eq) { this.cargando.set(false); return; }
      const [ofs, rivs, mp] = await Promise.all([
        this.falm.ofertas(eq.id), this.falm.equiposFalm(eq.id), this.falm.miPlantilla(eq.id),
      ]);
      this.ofertas.set(ofs); this.rivales.set(rivs); this.miPlantilla.set(mp);
    } catch (e: any) { this.error.set(e?.message ?? 'Error'); }
    finally { this.cargando.set(false); }
  }

  async seleccionarRival(id: string) {
    this.rivalId.set(id);
    this.solicitadosSet.set(new Set());
    this.plantillaRival.set([]);
    if (!id) return;
    this.cargandoRival.set(true);
    try { this.plantillaRival.set(await this.falm.miPlantilla(id)); }
    catch (e: any) { this.error.set(e?.message ?? 'Error'); }
    finally { this.cargandoRival.set(false); }
  }

  toggle(set: WritableSignal<Set<string>>, id: string) {
    const s = new Set(set());
    if (s.has(id)) s.delete(id); else s.add(id);
    set.set(s);
  }

  async enviar() {
    this.aviso.set(''); this.error.set('');
    if (environment.devEquipoNombre) {
      this.aviso.set('Modo demo: la oferta no se envía hasta activar tu cuenta (login). El compositor es totalmente funcional.');
      return;
    }
    const eq = this.equipo();
    if (!eq || !this.puedeEnviar()) return;
    this.enviando.set(true);
    try {
      await this.falm.crearOferta(eq.id, this.rivalId(), this.ofrecidos(), this.solicitados(), this.comentario.trim());
      this.aviso.set('Oferta enviada.');
      this.ofrecidosSet.set(new Set()); this.solicitadosSet.set(new Set()); this.comentario = '';
      this.ofertas.set(await this.falm.ofertas(eq.id));
      this.tab.set('bandeja');
    } catch (e: any) { this.error.set(e?.message ?? 'Error al enviar'); }
    finally { this.enviando.set(false); }
  }

  async responder(o: OfertaIntercambio, estado: 'ACEPTADA' | 'RECHAZADA' | 'CANCELADA') {
    this.aviso.set(''); this.error.set('');
    if (environment.devEquipoNombre) {
      this.aviso.set('Modo demo: responder a ofertas requiere activar tu cuenta (login).');
      return;
    }
    const eq = this.equipo();
    try {
      await this.falm.responderOferta(o.id, estado);
      if (eq) this.ofertas.set(await this.falm.ofertas(eq.id));
    } catch (e: any) { this.error.set(e?.message ?? 'Error'); }
  }
}
