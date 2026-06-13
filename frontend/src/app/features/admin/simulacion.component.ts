import { Component, OnInit, computed, signal } from '@angular/core';
import { AdminService } from './admin.service';

/** Admin · Simulación: motor completo de V2 sobre una temporada de pruebas (datos reales). */
@Component({
  selector: 'app-admin-simulacion',
  standalone: true,
  template: `
    <p class="intro muted">
      Monta una <b>temporada de pruebas</b> reutilizando el catálogo y los puntos reales de este año
      (jornadas LFP 5-7), con los equipos y plantillas distribuidos igual y alineaciones por defecto.
      Calcula resultados y clasificación con el motor de V2 — sin tocar la temporada real.
    </p>

    @if (aviso()) { <p class="ok">{{ aviso() }}</p> }
    @if (error()) { <p class="err">{{ error() }}</p> }

    <div class="acc">
      <button class="btn" [disabled]="trabajando()" (click)="montar()">
        {{ trabajando() ? '…' : '⚙️ Montar y simular 3 jornadas' }}
      </button>
      @if (tempId()) {
        <button class="btn ghost" [disabled]="trabajando()" (click)="recalcular()">↻ Recalcular clasificación</button>
      }
    </div>

    @if (clasif().length) {
      <h3 class="th">Clasificación simulada</h3>
      <div class="card tabla">
        <div class="row head"><span>#</span><span class="eq">Equipo</span><span>PJ</span><span>V</span><span>Vm</span><span>E</span><span>Dm</span><span>D</span><span>Pts</span></div>
        @for (f of clasif(); track f.nombre; let i = $index) {
          <div class="row">
            <span class="pos">{{ i+1 }}</span>
            <span class="eq">{{ f.nombre }}</span>
            <span>{{ f.v + f.vm + f.e + f.dm + f.d }}</span>
            <span>{{ f.v }}</span><span>{{ f.vm }}</span><span>{{ f.e }}</span><span>{{ f.dm }}</span><span>{{ f.d }}</span>
            <span class="pts">{{ f.pts }}</span>
          </div>
        }
      </div>

      <h3 class="th">Partidos por jornada</h3>
      @for (j of jornadas(); track j) {
        <div class="jor">
          <span class="jl">Jornada {{ j }}</span>
          <div class="card pl">
            @for (p of partidosDe(j); track p.local + p.visitante) {
              <div class="pt" [class.gl]="p.pl > p.pv" [class.gv]="p.pv > p.pl">
                <span class="t izq">{{ p.local }}</span>
                <span class="mk">{{ p.pl }} · {{ p.pv }}</span>
                <span class="t der">{{ p.visitante }}</span>
              </div>
            }
          </div>
        </div>
      }
    }
  `,
  styles: [`
    .intro { font-size: .85rem; margin: 0 0 14px; } .muted { color: var(--muted); }
    .ok { background: rgba(0,230,118,.08); border: 1px solid rgba(0,230,118,.22); color: var(--primary); padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; }
    .err { color: var(--bad); }
    .acc { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
    .btn.ghost { background: var(--surface-2); color: var(--ink); border: 1px solid var(--border); }
    .th { margin: 18px 0 10px; font-size: 1rem; }
    .tabla { overflow: hidden; }
    .row { display: grid; grid-template-columns: 30px 1fr 32px 28px 28px 28px 28px 28px 44px; align-items: center;
      padding: 9px 12px; border-bottom: 1px solid var(--border); font-size: .82rem; text-align: center; }
    .row:last-child { border-bottom: none; }
    .row.head { font-size: .64rem; text-transform: uppercase; color: var(--faint); font-weight: 800; }
    .row .eq { text-align: left; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pos { color: var(--muted); font-weight: 800; } .pts { font-weight: 900; color: var(--primary); }
    .jor { margin-bottom: 12px; }
    .jl { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: var(--gold); font-weight: 800; }
    .pl { margin-top: 6px; overflow: hidden; }
    .pt { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--border); }
    .pt:last-child { border-bottom: none; }
    .t { font-size: .82rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .t.izq { text-align: right; } .t.der { text-align: left; }
    .pt.gl .izq, .pt.gv .der { color: var(--ink); font-weight: 700; }
    .mk { font-weight: 900; font-size: 1rem; }
  `],
})
export class AdminSimulacionComponent implements OnInit {
  tempId = signal<string | null>(null);
  clasif = signal<{ nombre: string; pts: number; favor: number; v: number; vm: number; e: number; dm: number; d: number }[]>([]);
  partidos = signal<{ jornada: number; local: string; visitante: string; pl: number; pv: number }[]>([]);
  trabajando = signal(false);
  aviso = signal('');
  error = signal('');

  jornadas = computed(() => [...new Set(this.partidos().map((p) => p.jornada))].sort((a, b) => a - b));
  partidosDe(j: number) { return this.partidos().filter((p) => p.jornada === j); }

  constructor(private admin: AdminService) {}

  async ngOnInit() { await this.cargar(); }

  private async cargar() {
    const id = await this.admin.temporadaPruebas();
    this.tempId.set(id);
    if (id) {
      this.clasif.set(await this.admin.clasificacionTemporada(id));
      this.partidos.set(await this.admin.partidosTemporada(id));
    }
  }

  async montar() {
    this.aviso.set(''); this.error.set(''); this.trabajando.set(true);
    try {
      await this.admin.ejecutar('montar_temporada_prueba');
      const id = await this.admin.temporadaPruebas();
      if (id) await this.admin.ejecutar('recalcular_clasificacion', { p_temp: id });
      await this.cargar();
      this.aviso.set('✅ Temporada de pruebas montada y simulada (3 jornadas).');
    } catch (e: any) { this.error.set(e?.message ?? 'Error'); }
    finally { this.trabajando.set(false); }
  }

  async recalcular() {
    this.aviso.set(''); this.error.set(''); this.trabajando.set(true);
    try {
      await this.admin.ejecutar('recalcular_clasificacion', { p_temp: this.tempId() });
      await this.cargar();
      this.aviso.set('✅ Clasificación recalculada.');
    } catch (e: any) { this.error.set(e?.message ?? 'Error'); }
    finally { this.trabajando.set(false); }
  }
}
