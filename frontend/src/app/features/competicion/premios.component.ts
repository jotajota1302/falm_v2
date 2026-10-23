import { Component, OnInit, computed, signal } from '@angular/core';
import { FalmService, PremioDetalle } from '../../core/falm.service';
import { environment } from '../../../environments/environment';
import { colorEquipo } from '../../shared/equipo-colores';
import { SubnavComponent, SubnavItem } from '../../shared/subnav.component';

/** Premios: beneficio del equipo + ranking de premios de la liga. */
@Component({
  selector: 'app-premios',
  standalone: true,
  imports: [SubnavComponent],
  template: `
    <header class="phead">
      <div>
        <h1>Premios</h1>
        <p class="sub">Premios de jornada y de competición, esta temporada.</p>
      </div>
    </header>

    <falm-subnav [items]="secciones" />

    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else if (error()) {
      <p class="err">{{ error() }}</p>
    } @else {
      <div class="hero">
        <span class="lb">Tu beneficio · {{ miEquipo() }}</span>
        <span class="big num" [class.neg]="miBeneficio() < 0"
              [class.cero]="miBeneficio() === 0">{{ eur(miBeneficio()) }}<small>€</small></span>
      </div>

      <!-- Cada fila se abre: la cifra sola no dice de que jornadas sale, y asi
           cualquiera puede comprobar que el reparto esta bien. -->
      <div class="tabla">
        <div class="fila cab"><span>#</span><span>Equipo</span><span class="der">Beneficio</span></div>
        @for (e of ranking(); track e.nombre; let i = $index) {
          <button class="fila abre" [class.yo]="e.nombre === miEquipo()" (click)="ver.set(e.nombre)"
                  title="Ver de dónde sale">
            <span class="puesto">
              <span class="marca" [style.background]="color(e.nombre)"></span>
              <span class="num">{{ i + 1 }}</span>
            </span>
            <span class="nm">{{ e.nombre }}</span>
            <span class="der num ben" [class.neg]="e.beneficio < 0"
                  [class.cero]="e.beneficio === 0">{{ eur(e.beneficio) }}<small>€</small> <i class="mas">›</i></span>
          </button>
        }
      </div>
      <p class="reparto">
        Jornada normal: 20 € al primero y 5 € al segundo. Jornada doble: 20, 15 y 5 €.
        Si hay empate, los empatados se reparten a partes iguales lo de los puestos que ocupan.
        Una jornada no reparte hasta que se han jugado y puntuado todos sus partidos.
      </p>
    }

    @if (ver(); as eq) {
      <div class="back" (click)="ver.set(null)">
        <div class="panel" (click)="$event.stopPropagation()" role="dialog" [attr.aria-label]="'Premios de ' + eq">
          <button class="x" (click)="ver.set(null)" aria-label="Cerrar">✕</button>
          <h2>{{ eq }}</h2>
          @if (desglose(eq); as filas) {
            @if (filas.length) {
              <div class="dg">
                @for (p of filas; track $index) {
                  <div class="dl">
                    <span class="cq">{{ p.concepto }}</span>
                    <span class="dt">
                      {{ p.posicion }}º@if (p.puntos != null) { · {{ eur(p.puntos) }} pts }
                      @if (p.empate) { <br /><small>empatado con {{ p.empate }}</small> }
                    </span>
                    <span class="der num ben">{{ eur(p.importe) }}<small>€</small></span>
                  </div>
                }
                <div class="dl tot">
                  <span class="cq">Total</span><span></span>
                  <span class="der num ben">{{ eur(total(filas)) }}<small>€</small></span>
                </div>
              </div>
            } @else {
              <p class="muted">Todavía no ha cobrado ningún premio.</p>
            }
          }
        </div>
      </div>
    }
  `,
  styles: [`
    /* La cifra propia manda: es la única de este tamaño en toda la app. */
    .hero { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r);
      padding: 24px 20px; margin-bottom: 16px; }
    .hero .big { display: block; margin-top: 4px; font-size: var(--t-3xl); font-weight: 700;
      color: var(--good); letter-spacing: -.02em; line-height: 1; }
    .hero .big.neg { color: var(--bad); }
    .hero .big small { font-size: var(--t-lg); margin-left: 2px; }

    .fila { grid-template-columns: 60px 1fr 110px; }
    /* La fila es un boton: hereda la rejilla y pierde el aspecto de boton. */
    .fila.abre { width: 100%; border: none; border-bottom: 1px solid var(--line); background: transparent;
      font: inherit; color: inherit; text-align: left; cursor: pointer; }
    .fila.abre:hover { background: var(--surface2); }
    .mas { font-style: normal; color: var(--text2); margin-left: 4px; }
    .fila.yo { background: var(--accent-soft); box-shadow: inset 2px 0 0 var(--accent); }
    .puesto { display: flex; align-items: center; gap: 8px; }
    .marca { width: 3px; height: 20px; border-radius: 2px; flex: 0 0 auto; }
    .nm { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ben { font-weight: 700; color: var(--good); } .ben.neg { color: var(--bad); }
    /* Cero no es ganar dinero: en verde parecía que ya se había cobrado algo. */
    .ben.cero, .hero .big.cero { color: var(--text2); }
    .ben small { font-size: var(--t-xs); opacity: .75; margin-left: 1px; }
    .muted { color: var(--text2); } .err { color: var(--bad); }
    .reparto { margin: 12px 2px 0; font-size: var(--t-xs); color: var(--text2); line-height: 1.5; }

    .back { position: fixed; inset: 0; z-index: 60; background: rgba(22,19,15,.42);
      display: flex; align-items: flex-end; justify-content: center; }
    .panel { position: relative; width: 100%; max-width: 480px; max-height: 88vh; overflow-y: auto;
      background: var(--surface); border: 1px solid var(--line); border-top: 3px solid var(--accent);
      border-radius: var(--r-lg) var(--r-lg) 0 0; padding: 22px; }
    @media (min-width: 621px) { .back { align-items: center; } .panel { border-radius: var(--r-lg); } }
    .panel h2 { margin: 0 40px 14px 0; font-family: var(--fh); font-size: var(--t-md); text-transform: uppercase; }
    .x { position: absolute; top: 14px; right: 14px; background: var(--surface2); border: 1px solid var(--line);
      color: var(--text2); width: 32px; height: 32px; border-radius: var(--r-xs); cursor: pointer; font-size: var(--t-sm); }
    .dg { display: flex; flex-direction: column; }
    .dl { display: grid; grid-template-columns: 1fr auto 80px; gap: 10px; align-items: center;
      padding: 9px 2px; border-bottom: 1px solid var(--line); font-size: var(--t-sm); }
    .dl .cq { font-weight: 600; }
    .dl .dt { color: var(--text2); text-align: right; }
    .dl .dt small { font-size: var(--t-xs); }
    .dl.tot { border-bottom: none; border-top: 2px solid var(--text); }
    .dl.tot .cq { font-weight: 700; text-transform: uppercase; letter-spacing: .06em; font-size: var(--t-xs); }

    @media (max-width: 620px) {
      .hero { padding: 20px 15px; }
      .fila { grid-template-columns: 46px 1fr 92px; gap: 9px; padding: 10px 13px; }
      .panel { padding: 18px 15px; }
    }
  `],
})
export class PremiosComponent implements OnInit {
  secciones: SubnavItem[] = [
    { path: '/clasificacion', label: 'Clasificación' },
    { path: '/premios', label: 'Premios' },
  ];
  miBeneficio = signal<number>(0);
  miEquipo = signal<string>(environment.devEquipoNombre || '');
  ranking = signal<{ nombre: string; beneficio: number }[]>([]);
  premios = signal<PremioDetalle[]>([]);
  /** El equipo cuyo desglose está abierto. */
  ver = signal<string | null>(null);
  cargando = signal(true);
  error = signal('');

  constructor(private falm: FalmService) {}
  ini(n: string) { return (n || '?').charAt(0).toUpperCase(); }
  color(n: string) { return colorEquipo(n); }
  /** 12.5 se lee "12,50"; 20 se queda en "20". */
  eur(n: number) {
    const v = Number(n ?? 0);
    return Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',');
  }

  /** Quién comparte cada puesto: la clave es jornada o competición + puesto. */
  private empates = computed(() => {
    const m = new Map<string, string[]>();
    for (const p of this.premios()) {
      const k = `${p.jornada ?? p.competicion}|${p.posicion}`;
      m.set(k, [...(m.get(k) ?? []), p.equipo]);
    }
    return m;
  });

  /** Los premios de un equipo, por jornada; los de competición, al final. */
  desglose(equipo: string) {
    return this.premios()
      .filter((p) => p.equipo === equipo)
      .sort((a, b) => (a.jornada ?? 999) - (b.jornada ?? 999))
      .map((p) => {
        const otros = (this.empates().get(`${p.jornada ?? p.competicion}|${p.posicion}`) ?? [])
          .filter((n) => n !== equipo);
        return {
          ...p,
          concepto: p.jornada != null ? `Jornada ${p.jornada}` : (p.competicion ?? p.tipo),
          empate: otros.length ? otros.join(', ') : null,
        };
      });
  }
  total(filas: { importe: number }[]) { return filas.reduce((s, p) => s + p.importe, 0); }

  async ngOnInit() {
    try {
      const [eq, rank, prem] = await Promise.all([
        this.falm.miEquipo(), this.falm.rankingBeneficios(),
        this.falm.premiosDeLaTemporada().catch(() => [] as PremioDetalle[]),
      ]);
      if (eq) { this.miBeneficio.set(Number(eq.beneficio ?? 0)); this.miEquipo.set(eq.nombre); }
      this.ranking.set(rank.map((r) => ({ ...r, beneficio: Number(r.beneficio ?? 0) })));
      this.premios.set(prem);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error cargando los premios');
    } finally {
      this.cargando.set(false);
    }
  }
}
