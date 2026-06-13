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
    <h1>🤝 Intercambios</h1>

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
                <span class="est" [attr.data-e]="o.estado">{{ o.estado }}</span>
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
    h1 { margin: 0 0 14px; }
    .tabs { display: flex; gap: 8px; margin-bottom: 14px; }
    .tabs button { background: var(--surface); border: 1px solid var(--border); color: var(--muted);
      border-radius: 11px; padding: 9px 16px; cursor: pointer; font-weight: 800; font-size: .85rem; }
    .tabs button.on { background: rgba(0,230,118,.1); color: var(--primary); border-color: var(--primary); }
    .dot { background: var(--bad); color: #fff; border-radius: 999px; padding: 0 7px; font-size: .7rem; margin-left: 5px; }
    .aviso { background: rgba(0,230,118,.08); border: 1px solid rgba(0,230,118,.22); color: var(--primary); padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; }
    .err { color: var(--bad); }
    .muted { color: var(--muted); }
    .lista { display: flex; flex-direction: column; gap: 12px; }
    .oferta { padding: 14px; }
    .ohead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .dir { color: var(--muted); font-size: .85rem; } .dir b { color: var(--ink); }
    .est { font-size: .68rem; font-weight: 800; padding: 3px 9px; border-radius: 999px; text-transform: uppercase; letter-spacing: .03em; }
    .est[data-e=PENDIENTE] { background: rgba(255,194,75,.15); color: var(--gold); }
    .est[data-e=ACEPTADA] { background: rgba(0,230,118,.15); color: var(--primary); }
    .est[data-e=RECHAZADA], .est[data-e=CANCELADA], .est[data-e=EXPIRADA] { background: rgba(251,113,133,.14); color: var(--bad); }
    .cambio { display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: start; }
    .col { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .cl { font-size: .68rem; text-transform: uppercase; letter-spacing: .04em; color: var(--faint); font-weight: 700; }
    .swap { align-self: center; font-size: 1.3rem; color: var(--muted); }
    .mini { display: flex; align-items: center; gap: 7px; background: var(--surface-2); border: 1px solid var(--border);
      border-radius: 9px; padding: 5px 8px; font-size: .82rem; font-weight: 600; }
    .mini img { width: 22px; height: 22px; border-radius: 6px; object-fit: cover; }
    .mini i { width: 22px; height: 22px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;
      font-size: .6rem; font-weight: 800; font-style: normal; color: #07120d; background: var(--muted); }
    .mini[data-pos=POR] i { background: var(--pos-POR); } .mini[data-pos=DEF] i { background: var(--pos-DEF); }
    .mini[data-pos=MED] i { background: var(--pos-MED); } .mini[data-pos=DEL] i { background: var(--pos-DEL); }
    .coment { margin: 12px 0 0; color: var(--muted); font-style: italic; font-size: .85rem; }
    .acc { display: flex; gap: 8px; margin-top: 12px; }
    .bn { border: none; border-radius: 9px; padding: 8px 16px; cursor: pointer; font-weight: 800; font-size: .82rem; }
    .bn.ok { background: var(--primary); color: var(--primary-ink); }
    .bn.no, .bn.cancel { background: var(--surface-2); color: var(--bad); border: 1px solid var(--border); }

    .nueva { display: flex; flex-direction: column; gap: 14px; }
    .campo { display: flex; flex-direction: column; gap: 5px; }
    .campo span { font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; color: var(--faint); font-weight: 700; }
    .campo select { font-weight: 700; }
    .dos { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .lado { padding: 12px; max-height: 420px; overflow-y: auto; }
    .lt { margin: 0 0 10px; font-size: .95rem; } .lt small { color: var(--primary); font-weight: 900; }
    .fila { width: 100%; display: flex; align-items: center; gap: 9px; padding: 8px 9px; margin-bottom: 5px;
      background: var(--surface-2); border: 1px solid var(--border); border-radius: 9px; cursor: pointer; }
    .fila.sel { border-color: var(--primary); background: rgba(0,230,118,.08); }
    .pos { flex: 0 0 auto; width: 34px; padding: 3px 0; text-align: center; border-radius: 6px; font-size: .66rem; font-weight: 800; color: #07120d; }
    .pos.POR { background: var(--pos-POR); } .pos.DEF { background: var(--pos-DEF); }
    .pos.MED { background: var(--pos-MED); } .pos.DEL { background: var(--pos-DEL); }
    .nm { flex: 1; text-align: left; font-weight: 600; font-size: .82rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tick { color: var(--primary); font-weight: 900; }
    .coment-in { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: 11px; padding: 10px 12px; resize: vertical; }
    .enviar { align-self: flex-start; } .enviar:disabled { opacity: .5; cursor: not-allowed; }
    @media (max-width: 560px) { .dos { grid-template-columns: 1fr; } }
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
      this.aviso.set('✅ Oferta enviada.');
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
