import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminPuntuacion, AdminService } from './admin.service';

const ABR: Record<string, string> = { Portero: 'POR', PORTERO: 'POR', Defensa: 'DEF', DEFENSA: 'DEF',
  Mediocampista: 'MED', MEDIO: 'MED', Delantero: 'DEL', DELANTERO: 'DEL' };

/** Los campos del desglose, con su nombre en la base. */
interface Campo { clave: string; etiqueta: string; prop: keyof AdminPuntuacion; soloPortero?: boolean; }

const CAMPOS: Campo[] = [
  { clave: 'minutos',          etiqueta: 'Minutos',          prop: 'minutos' },
  { clave: 'estrellas',        etiqueta: 'Estrellas',        prop: 'estrellas' },
  { clave: 'goles',            etiqueta: 'Goles',            prop: 'goles' },
  { clave: 'goles_penalti',    etiqueta: 'Goles de penalti', prop: 'golesPenalti' },
  { clave: 'penalti_fallado',  etiqueta: 'Penaltis fallados', prop: 'penaltiFallado' },
  { clave: 'tarjetas_rojas',   etiqueta: 'Tarjetas rojas',   prop: 'tarjetasRojas' },
  { clave: 'goles_en_propia',  etiqueta: 'Goles en propia',  prop: 'golesEnPropia' },
  { clave: 'penalti_parado',   etiqueta: 'Penaltis parados', prop: 'penaltiParado', soloPortero: true },
  { clave: 'goles_en_contra',  etiqueta: 'Goles encajados',  prop: 'golesEnContra', soloPortero: true },
];

/**
 * Admin · Puntuaciones por jornada.
 *
 * Se ve de qué se componen los puntos de cada jugador y se corrige concepto a
 * concepto. El total no se escribe a mano: lo recalcula el mismo baremo que usa
 * la ingesta automática, así el número y su explicación no pueden separarse.
 */
@Component({
  selector: 'app-admin-puntuaciones',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (aviso()) { <p class="aviso">{{ aviso() }}</p> }
    @if (error()) { <p class="err">{{ error() }}</p> }

    <div class="barra">
      <label>Jornada LFP
        <select [ngModel]="lfp()" (ngModelChange)="seleccionar($event)">
          @for (j of jornadas(); track j.numero) {
            <option [value]="j.numero">J{{ j.numero }} — {{ j.descripcion }}</option>
          }
        </select>
      </label>
      <input class="buscar" type="search" placeholder="Buscar jugador o club…"
             [ngModel]="filtro()" (ngModelChange)="filtro.set($event)" />
    </div>

    @if (cargando()) {
      <p class="muted">Cargando puntuaciones…</p>
    } @else if (visibles().length === 0) {
      <p class="muted">Sin datos para esta jornada.</p>
    } @else {
      <div class="tabla card">
        @for (p of visibles(); track p.id) {
          <div class="fila" [class.abierta]="abierto() === p.id" (click)="alternar(p)">
            <span class="pos" [class]="abr(p.posicion)">{{ abr(p.posicion) }}</span>
            <div class="info">
              <span class="nm">{{ p.nombre }}</span>
              <span class="cl">{{ p.equipo }}{{ p.minutos ? ' · ' + p.minutos + '′' : '' }}</span>
            </div>
            @if (p.tipo === 'MANUAL') { <span class="chip">manual</span> }
            <span class="pts num">{{ p.puntos }}</span>
            <span class="chevron">{{ abierto() === p.id ? '▾' : '▸' }}</span>
          </div>

          @if (abierto() === p.id) {
            <div class="detalle">
              <div class="expl">
                @for (l of p.explicacion; track l.concepto) {
                  <div class="lin">
                    <span class="cn">{{ l.concepto }}</span>
                    <span class="dt faint">{{ l.detalle }}</span>
                    <b class="vl num" [class.neg]="l.puntos < 0">{{ l.puntos > 0 ? '+' : '' }}{{ l.puntos }}</b>
                  </div>
                }
                <div class="lin tot">
                  <span class="cn">Total</span><span class="dt"></span>
                  <b class="vl num">{{ p.puntos }}</b>
                </div>
              </div>

              <div class="edit">
                <div class="campo">
                  <label>Resultado</label>
                  <select [ngModel]="ed()['resultado']" (ngModelChange)="cambiar('resultado', $event)">
                    <option value="VICTORIA">Victoria</option>
                    <option value="EMPATE">Empate</option>
                    <option value="DERROTA">Derrota</option>
                  </select>
                </div>
                @for (c of camposDe(p); track c.clave) {
                  <div class="campo">
                    <label>{{ c.etiqueta }}</label>
                    <input type="number" step="1"
                           [ngModel]="ed()[c.clave]" (ngModelChange)="cambiar(c.clave, $event)" />
                  </div>
                }
                <label class="campo chk">
                  <input type="checkbox" [ngModel]="ed()['imbatido']"
                         (ngModelChange)="cambiar('imbatido', $event)" />
                  Portería a cero
                </label>

                <div class="acciones">
                  <span class="faint mini">
                    Las estrellas admiten −1 (el guion de la prensa). El total se recalcula solo.
                  </span>
                  <button class="btn-sec" (click)="abierto.set(-1)">Cancelar</button>
                  <button class="btn" [disabled]="guardando()" (click)="guardar(p)">
                    {{ guardando() ? 'Guardando…' : 'Guardar' }}
                  </button>
                </div>
              </div>
            </div>
          }
        }
      </div>
    }
  `,
  styles: [`
    .aviso { background: color-mix(in oklab, var(--por) 8%, var(--surface)); border: 1px solid color-mix(in oklab, var(--por) 32%, var(--line)); color: var(--por); padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; }
    .err { color: var(--bad); }
    .barra { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
    .barra label { font-size: var(--t-sm); color: var(--text2); font-weight: 700; display: flex; gap: 6px; align-items: center; }
    .buscar { flex: 1; min-width: 140px; }
    .tabla { overflow: hidden; }
    .fila { display: flex; align-items: center; gap: 10px; padding: 9px 12px;
      border-bottom: 1px solid var(--line); cursor: pointer; }
    .fila:hover { background: var(--surface2); }
    .fila.abierta { background: var(--surface2); }
    .pos { flex: 0 0 auto; width: 34px; padding: 3px 0; text-align: center; border-radius: 6px; font-size: var(--t-xs); font-weight: 700; color: var(--accent-ink); }
    .pos.POR { background: var(--por); } .pos.DEF { background: var(--def); }
    .pos.MED { background: var(--med); } .pos.DEL { background: var(--del); }
    .info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .nm { font-weight: 700; font-size: var(--t-md); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cl { color: var(--text2); font-size: var(--t-sm); }
    .pts { font-weight: 700; color: var(--accent); min-width: 34px; text-align: right; }
    .chevron { color: var(--text2); width: 14px; }
    .muted { color: var(--text2); }

    .detalle { padding: 12px 14px 14px; border-bottom: 1px solid var(--line);
      background: var(--surface); display: grid; grid-template-columns: 1fr 1.4fr; gap: 18px; }
    .expl { align-self: start; border: 1px solid var(--line); border-radius: var(--r-xs); overflow: hidden; }
    .lin { display: grid; grid-template-columns: 1.3fr 1fr 46px; gap: 8px; align-items: center;
      padding: 7px 11px; font-size: var(--t-sm); border-bottom: 1px solid var(--line); }
    .lin:last-child { border-bottom: 0; }
    .lin .dt { font-size: var(--t-xs); }
    .lin .vl { text-align: right; }
    .lin .vl.neg { color: var(--bad); }
    .lin.tot { background: var(--surface2); font-weight: 700; }
    .lin.tot .vl { color: var(--accent); }

    .edit { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; align-content: start; }
    .campo { display: flex; flex-direction: column; gap: 3px; }
    .campo label { font-size: var(--t-xs); color: var(--text2); font-weight: 700;
      text-transform: uppercase; letter-spacing: .05em; }
    .campo input, .campo select { background: var(--surface); border: 1px solid var(--line);
      border-radius: 8px; padding: 6px 8px; color: var(--text); font-family: var(--fb); }
    .campo.chk { flex-direction: row; align-items: center; gap: 7px; font-size: var(--t-sm);
      color: var(--text2); cursor: pointer; align-self: end; padding-bottom: 6px; }
    .acciones { grid-column: 1 / -1; display: flex; gap: 8px; align-items: center;
      justify-content: flex-end; margin-top: 4px; }
    .acciones .mini { flex: 1; font-size: var(--t-xs); }
    .chip { font-size: var(--t-xs); }

    @media (max-width: 800px) {
      .detalle { grid-template-columns: 1fr; }
      .edit { grid-template-columns: repeat(2, 1fr); }
    }
  `],
})
export class AdminPuntuacionesComponent implements OnInit {
  jornadas = signal<{ numero: number; descripcion: string }[]>([]);
  lfp = signal<number | null>(null);
  lista = signal<AdminPuntuacion[]>([]);
  filtro = signal('');
  cargando = signal(true);
  aviso = signal('');
  error = signal('');
  /** ext_id de la fila desplegada, o -1. */
  abierto = signal<number>(-1);
  guardando = signal(false);
  /** Valores en edición, con las claves tal como se llaman en el desglose. */
  ed = signal<Record<string, any>>({});

  campos = CAMPOS;

  visibles = computed(() => {
    const f = this.filtro().trim().toLowerCase();
    return this.lista().filter((p) => !f || p.nombre.toLowerCase().includes(f) || p.equipo.toLowerCase().includes(f));
  });

  constructor(private admin: AdminService) {}
  abr(p: string) { return ABR[p] ?? 'MED'; }

  /** Penaltis parados y goles encajados solo puntúan al portero. */
  camposDe(p: AdminPuntuacion) {
    const esPortero = this.abr(p.posicion) === 'POR';
    return this.campos.filter((c) => !c.soloPortero || esPortero);
  }

  async ngOnInit() {
    try {
      const js = await this.admin.jornadasLfp();
      this.jornadas.set(js);
      if (js.length) await this.seleccionar(js[0].numero);
      else this.cargando.set(false);
    } catch (e: any) { this.error.set(e?.message ?? 'Error'); this.cargando.set(false); }
  }

  async seleccionar(numero: number) {
    this.lfp.set(+numero); this.cargando.set(true); this.error.set(''); this.abierto.set(-1);
    try { this.lista.set(await this.admin.puntuaciones(+numero)); }
    catch (e: any) { this.error.set(e?.message ?? 'Error'); }
    finally { this.cargando.set(false); }
  }

  alternar(p: AdminPuntuacion) {
    if (this.abierto() === p.id) { this.abierto.set(-1); return; }
    this.aviso.set(''); this.error.set('');
    this.ed.set({
      resultado: p.resultado || 'DERROTA',
      minutos: p.minutos,
      estrellas: p.estrellas,
      goles: p.goles,
      goles_penalti: p.golesPenalti,
      penalti_fallado: p.penaltiFallado,
      tarjetas_rojas: p.tarjetasRojas,
      goles_en_propia: p.golesEnPropia,
      penalti_parado: p.penaltiParado,
      goles_en_contra: p.golesEnContra,
      imbatido: p.imbatido,
    });
    this.abierto.set(p.id);
  }

  cambiar(clave: string, valor: any) {
    this.ed.update((e) => ({ ...e, [clave]: valor }));
  }

  async guardar(p: AdminPuntuacion) {
    const lfp = this.lfp();
    if (lfp == null || this.guardando()) return;
    this.aviso.set(''); this.error.set('');
    this.guardando.set(true);
    try {
      const e = this.ed();
      const cambios: Record<string, any> = {
        resultado: e['resultado'],
        imbatido: !!e['imbatido'],
        minutos: Number(e['minutos'] ?? 0),
        estrellas: Number(e['estrellas'] ?? 0),
        goles: Number(e['goles'] ?? 0),
        goles_penalti: Number(e['goles_penalti'] ?? 0),
        penalti_fallado: Number(e['penalti_fallado'] ?? 0),
        tarjetas_rojas: Number(e['tarjetas_rojas'] ?? 0),
        goles_en_propia: Number(e['goles_en_propia'] ?? 0),
        penalti_parado: Number(e['penalti_parado'] ?? 0),
        goles_en_contra: Number(e['goles_en_contra'] ?? 0),
      };
      const puntos = await this.admin.editarDesglose(p.id, lfp, cambios);
      this.aviso.set(
        `${p.nombre}: ${puntos} puntos. Queda marcado como manual y la ingesta automática ya no lo ` +
        `pisará. Para que cuente en clasificación y premios, recalcula en Simulación.`
      );
      this.abierto.set(-1);
      this.lista.set(await this.admin.puntuaciones(lfp));
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se pudo guardar');
    } finally {
      this.guardando.set(false);
    }
  }
}
