import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminPuntuacion, AdminService } from './admin.service';

const ABR: Record<string, string> = { Portero: 'POR', PORTERO: 'POR', Defensa: 'DEF', DEFENSA: 'DEF',
  Mediocampista: 'MED', MEDIO: 'MED', Delantero: 'DEL', DELANTERO: 'DEL' };

/** Admin · Corrección manual de puntos por jornada LFP. */
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
          @for (j of jornadas(); track j.numero) { <option [value]="j.numero">J{{ j.numero }} — {{ j.descripcion }}</option> }
        </select>
      </label>
      <input class="buscar" type="search" placeholder="Buscar…" [ngModel]="filtro()" (ngModelChange)="filtro.set($event)" />
    </div>

    @if (cargando()) {
      <p class="muted">Cargando puntuaciones…</p>
    } @else if (visibles().length === 0) {
      <p class="muted">Sin datos para esta jornada.</p>
    } @else {
      <div class="tabla card">
        @for (p of visibles(); track p.id) {
          <div class="fila">
            <span class="pos" [class]="abr(p.posicion)">{{ abr(p.posicion) }}</span>
            <div class="info"><span class="nm">{{ p.nombre }}</span><span class="cl">{{ p.equipo }}</span></div>
            <span class="st">⚽ {{ p.goles }}</span>
            <span class="st">🅰 {{ p.asistencias }}</span>
            @if (editId() === p.id) {
              <input class="ed" type="number" step="0.5" [ngModel]="edPts()" (ngModelChange)="edPts.set($event)" />
              <button class="bn ok" (click)="guardar(p)">✓</button>
              <button class="bn no" (click)="editId.set(-1)">✕</button>
            } @else {
              <span class="pts num">{{ p.puntos }}</span>
              <button class="bn" (click)="editar(p)">✎</button>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .aviso { background: rgba(255,194,75,.08); border: 1px solid rgba(255,194,75,.22); color: var(--gold); padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; }
    .err { color: var(--bad); }
    .barra { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
    .barra label { font-size: .8rem; color: var(--muted); font-weight: 700; display: flex; gap: 6px; align-items: center; }
    .buscar { flex: 1; min-width: 140px; }
    .tabla { overflow: hidden; }
    .fila { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-bottom: 1px solid var(--border); }
    .fila:last-child { border-bottom: none; }
    .pos { flex: 0 0 auto; width: 34px; padding: 3px 0; text-align: center; border-radius: 6px; font-size: .66rem; font-weight: 800; color: #07120d; }
    .pos.POR { background: var(--pos-POR); } .pos.DEF { background: var(--pos-DEF); }
    .pos.MED { background: var(--pos-MED); } .pos.DEL { background: var(--pos-DEL); }
    .info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .nm { font-weight: 700; font-size: .86rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cl { color: var(--muted); font-size: .74rem; }
    .st { font-size: .76rem; color: var(--muted); }
    .pts { font-weight: 900; color: var(--primary); min-width: 34px; text-align: right; }
    .ed { width: 64px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 6px 8px; }
    .bn { border: 1px solid var(--border); background: var(--surface-2); color: var(--muted); border-radius: 8px; width: 30px; height: 30px; cursor: pointer; font-weight: 800; }
    .bn.ok { background: var(--primary); color: var(--primary-ink); border-color: var(--primary); } .bn.no { color: var(--bad); }
    .muted { color: var(--muted); }
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
  editId = signal<number>(-1);
  edPts = signal(0);

  visibles = computed(() => {
    const f = this.filtro().trim().toLowerCase();
    return this.lista().filter((p) => !f || p.nombre.toLowerCase().includes(f) || p.equipo.toLowerCase().includes(f));
  });

  constructor(private admin: AdminService) {}
  abr(p: string) { return ABR[p] ?? 'MED'; }

  async ngOnInit() {
    try {
      const js = await this.admin.jornadasLfp();
      this.jornadas.set(js);
      if (js.length) await this.seleccionar(js[0].numero);
      else this.cargando.set(false);
    } catch (e: any) { this.error.set(e?.message ?? 'Error'); this.cargando.set(false); }
  }

  async seleccionar(numero: number) {
    this.lfp.set(+numero); this.cargando.set(true); this.error.set(''); this.editId.set(-1);
    try { this.lista.set(await this.admin.puntuaciones(+numero)); }
    catch (e: any) { this.error.set(e?.message ?? 'Error'); }
    finally { this.cargando.set(false); }
  }

  editar(p: AdminPuntuacion) { this.editId.set(p.id); this.edPts.set(p.puntos); this.aviso.set(''); }

  async guardar(p: AdminPuntuacion) {
    this.aviso.set(''); this.error.set('');
    const lfp = this.lfp();
    if (lfp == null) return;
    try {
      await this.admin.ejecutar('editar_puntos', { p_ext: p.id, p_lfp: lfp, p_puntos: this.edPts() });
      this.lista.update((arr) => arr.map((x) => x.id === p.id ? { ...x, puntos: this.edPts() } : x));
      this.editId.set(-1);
      this.aviso.set(`✅ ${p.nombre}: ${this.edPts()} pts (manual). Para que afecte a clasificación/premios de una temporada en juego, recalcula en Simulación.`);
    } catch (e: any) { this.error.set(e?.message ?? 'Error al guardar'); }
  }
}
