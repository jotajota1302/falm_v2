import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FalmService } from '../../core/falm.service';

/** Dashboard "Matchday": resumen del equipo con datos reales. */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else {
      <section class="hero card rise">
        <div class="ribbon"></div>
        <div class="who">
          <span class="hola">Tu equipo</span>
          <h1>{{ nombre() || 'Mi equipo' }}</h1>
        </div>
        <div class="rank">
          <span class="pos num">{{ posicion() ? posicion() : '—' }}<small>º</small></span>
          <span class="rl">en la liga</span>
        </div>
      </section>

      @if (posiciones().length) {
        <div class="comps">
          @for (c of posiciones(); track c.tipo) {
            <a class="comp card rise" routerLink="/clasificacion">
              <span class="ci">{{ c.icono }}</span>
              <span class="cn">{{ c.nombre }}</span>
              <span class="cp num">{{ c.principal }}</span>
              @if (c.secundario) { <span class="cs">{{ c.secundario }}</span> }
            </a>
          }
        </div>
      }

      <section class="accion rise">
        <span class="ic">⏰</span>
        <div class="cd">
          <strong>Cierre de fichajes</strong>
          <p class="muted">{{ cuenta() }}</p>
        </div>
        <a class="btn-cd" routerLink="/fichajes">Pedir fichaje</a>
      </section>

      <div class="grid">
        <a class="stat card rise" routerLink="/clasificacion">
          <span class="lbl">Puntos</span><span class="big num">{{ puntos() }}</span><span class="sub">clasificación</span>
        </a>
        <a class="stat card rise gold" routerLink="/premios">
          <span class="lbl">Premios</span><span class="big num">{{ premios() }}<small>€</small></span><span class="sub">ganado</span>
        </a>
        <a class="stat card rise" routerLink="/plantilla">
          <span class="lbl">Plantilla</span><span class="big num">{{ jugadores() }}</span><span class="sub">jugadores</span>
        </a>
        <a class="stat card rise" routerLink="/mercado">
          <span class="lbl">Presupuesto</span><span class="big num euro">{{ presupuesto() }}</span><span class="sub">disponible</span>
        </a>
      </div>
    }
  `,
  styles: [`
    .hero { position: relative; overflow: hidden; display: flex; align-items: center;
      justify-content: space-between; padding: 26px 22px; margin-bottom: 16px; }
    .hero .ribbon { position: absolute; inset: 0 auto 0 0; width: 5px; background: var(--primary); box-shadow: 0 0 20px var(--glow); }
    .who .hola { font-size: .72rem; text-transform: uppercase; letter-spacing: .08em; color: var(--faint); }
    .who h1 { font-size: 1.8rem; margin-top: 2px; }
    .rank { text-align: right; }
    .rank .pos { font-size: 3rem; font-weight: 900; line-height: 1; color: var(--primary); letter-spacing: -.04em; }
    .rank .pos small { font-size: 1.2rem; color: var(--muted); }
    .rank .rl { display: block; font-size: .72rem; color: var(--faint); text-transform: uppercase; letter-spacing: .06em; }

    .comps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
    .comp { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 14px 8px; text-align: center; }
    .comp .ci { font-size: 1.3rem; }
    .comp .cn { font-size: .68rem; text-transform: uppercase; letter-spacing: .04em; color: var(--faint); font-weight: 700;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
    .comp .cp { font-size: 1.5rem; font-weight: 900; color: var(--primary); line-height: 1.05; letter-spacing: -.03em; }
    .comp .cs { font-size: .68rem; color: var(--faint); font-weight: 700; }
    @media (max-width: 420px) { .comp { padding: 11px 6px; } .comp .cp { font-size: 1.1rem; } }
    .accion { display: flex; align-items: center; gap: 14px; padding: 14px 16px; margin-bottom: 18px;
      background: rgba(255,194,75,.07); border: 1px solid rgba(255,194,75,.2); border-radius: 14px; }
    .accion .ic { font-size: 1.5rem; }
    .accion .cd { flex: 1; } .accion strong { display: block; } .accion p { margin: 2px 0 0; font-size: .85rem; }
    .btn-cd { flex: 0 0 auto; background: var(--gold); color: #1a1206; font-weight: 800; font-size: .8rem;
      padding: 8px 14px; border-radius: 10px; white-space: nowrap; }

    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
    .stat { display: flex; flex-direction: column; gap: 2px; padding: 18px;
      transition: transform .14s ease, border-color .14s ease; }
    .stat:hover { transform: translateY(-3px); border-color: var(--border-strong); }
    .stat .lbl { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: var(--faint); }
    .stat .big { font-size: 2.2rem; font-weight: 900; letter-spacing: -.03em; line-height: 1.05; }
    .stat .big small { font-size: 1rem; opacity: .7; }
    .stat.gold .big { color: var(--gold); }
    .stat .sub { font-size: .75rem; color: var(--muted); }
    .muted { color: var(--muted); }
  `],
})
export class DashboardComponent implements OnInit, OnDestroy {
  cuenta = signal('');
  private timer: any = null;
  nombre = signal('');
  posicion = signal<number | null>(null);
  puntos = signal<number>(0);
  premios = signal<number>(0);
  jugadores = signal<number>(0);
  presupuesto = signal<number>(0);
  posiciones = signal<{ tipo: string; nombre: string; icono: string; principal: string; secundario: string }[]>([]);
  cargando = signal(true);

  constructor(private falm: FalmService) {}

  ngOnDestroy() { if (this.timer) clearInterval(this.timer); }

  /** Próximo martes 23:59 (hora local): deadline semanal de fichajes. */
  private proximoCierre(): Date {
    const ahora = new Date();
    const d = new Date(ahora);
    d.setHours(23, 59, 0, 0);
    // días hasta el próximo martes (2). Si hoy es martes pero ya pasaron las 23:59, va al siguiente.
    let dias = (2 - d.getDay() + 7) % 7;
    if (dias === 0 && ahora.getTime() > d.getTime()) dias = 7;
    d.setDate(d.getDate() + dias);
    return d;
  }

  private tick() {
    const ms = this.proximoCierre().getTime() - Date.now();
    if (ms <= 0) { this.cuenta.set('¡Procesando fichajes!'); return; }
    const dd = Math.floor(ms / 86400000);
    const hh = Math.floor((ms % 86400000) / 3600000);
    const mm = Math.floor((ms % 3600000) / 60000);
    this.cuenta.set(dd > 0 ? `Faltan ${dd}d ${hh}h para el martes 23:59` : `Faltan ${hh}h ${mm}m — ¡hoy cierra a las 23:59!`);
  }

  private icono(t: string) { return t === 'CHAMPIONS' ? '🌟' : t === 'CLAUSURA' ? '🔚' : '🏆'; }
  private etiqueta(t: string) { return t === 'CHAMPIONS' ? 'Champions' : t === 'CLAUSURA' ? 'Clausura' : 'Liga'; }

  /** Fase alcanzada por el equipo en la eliminatoria de Champions. */
  private async faseChampions(compId: string, equipo: string): Promise<string | null> {
    const rondas = await this.falm.eliminatorias(compId);
    let ultima: { ronda: string; llave: any } | null = null;
    for (const r of rondas) {
      const llave = r.llaves.find((k) => k.a === equipo || k.b === equipo);
      if (llave) ultima = { ronda: r.ronda, llave };
    }
    if (!ultima) return null;
    const { ronda, llave } = ultima;
    if (ronda === 'Final') {
      if (llave.subtitulo === 'Final' || !llave.subtitulo) return llave.ganador === equipo ? '🏆 Campeón' : 'Finalista';
      return llave.ganador === equipo ? '🥉 3º puesto' : '4º puesto';
    }
    return ronda; // eliminado en esa ronda
  }

  async ngOnInit() {
    this.tick();
    this.timer = setInterval(() => this.tick(), 60000);
    try {
      const eq = await this.falm.miEquipo();
      if (!eq) return;
      this.nombre.set(eq.nombre);
      this.presupuesto.set(eq.presupuesto);
      this.premios.set(Number(eq.beneficio ?? 0));
      const comps = await this.falm.competiciones();
      const liga = comps.find((c) => c.tipo === 'LIGA') ?? comps[0];
      const [clas, plantilla] = await Promise.all([
        liga ? this.falm.clasificacion(liga.id) : Promise.resolve([]),
        this.falm.miPlantilla(eq.id),
      ]);
      const mia = clas.find((f) => f.equipo_falm_id === eq.id);
      if (mia) { this.posicion.set(mia.posicion); this.puntos.set(mia.puntos_clasificacion); }
      this.jugadores.set(plantilla.length);

      // Liga/Clausura: posición. Champions: fase alcanzada (es eliminatoria).
      const orden = { LIGA: 0, CHAMPIONS: 1, CLAUSURA: 2 } as Record<string, number>;
      const ordenadas = [...comps].sort((a, b) => (orden[a.tipo] ?? 9) - (orden[b.tipo] ?? 9));
      const filas = await Promise.all(ordenadas.map(async (c) => {
        try {
          if (c.tipo === 'CHAMPIONS') {
            const fase = await this.faseChampions(c.id, eq.nombre);
            return fase ? { tipo: c.tipo, nombre: this.etiqueta(c.tipo), icono: this.icono(c.tipo), principal: fase, secundario: '' } : null;
          }
          const t = c.tipo === 'LIGA' ? clas : await this.falm.clasificacionCalculada(c.id);
          const f = t.find((x) => x.equipo_falm_id === eq.id);
          return f && t.length
            ? { tipo: c.tipo, nombre: this.etiqueta(c.tipo), icono: this.icono(c.tipo), principal: f.posicion + 'º', secundario: 'de ' + t.length }
            : null;
        } catch { return null; }
      }));
      this.posiciones.set(filas.filter((x): x is NonNullable<typeof x> => !!x));
    } catch { /* defaults */ } finally { this.cargando.set(false); }
  }
}
