import { Component, OnInit, computed, signal } from '@angular/core';
import { ContextoActivo, Equipo, FalmService, ItemPlantilla, PorteroClub } from '../../core/falm.service';
import { FichaService } from '../../shared/ficha.service';

const ORDEN: Record<string, number> = { PORTERO: 0, DEFENSA: 1, MEDIO: 2, DELANTERO: 3 };
const ETI: Record<string, string> = { PORTERO: 'Porteros', DEFENSA: 'Defensas', MEDIO: 'Mediocampistas', DELANTERO: 'Delanteros' };

/** Mi plantilla en cromos, agrupada por posición. */
@Component({
  selector: 'app-plantilla',
  standalone: true,
  template: `
    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else if (error()) {
      <p class="err">{{ error() }}</p>
    } @else if (!equipo()) {
      <p class="muted">No tienes equipo en la temporada activa.</p>
    } @else {
      <header class="phead">
        <h1>Mi plantilla</h1>
      </header>

      <div class="kpis">
        <div class="kpi">
          <span class="lb">Puntos totales</span>
          <span class="v num">{{ totalPuntos() }}</span>
        </div>
        <div class="kpi">
          <span class="lb">Jugadores</span>
          <span class="dato">
            <span class="v num">{{ items().length }}</span>
            <span class="det">{{ resumen() }}</span>
          </span>
        </div>
      </div>

      <div class="tabla">
        <div class="fila cab">
          <span>Pos</span><span>Jugador</span><span>Club</span>
          <span class="der">Pts</span><span class="der">Media</span>
        </div>
        @for (j of filas(); track j.activo_id) {
          <button class="fila" (click)="abrir(j)">
            <span class="pos" [class]="abr(j.posicion)">{{ abr(j.posicion) }}</span>
            <span class="quien">
              <span class="av" [class.esc]="j.tipo === 'DEFENSA'">
                @if (j.tipo === 'DEFENSA') {
                  @if (j.escudo) { <img class="pl" [src]="j.escudo" alt="" loading="lazy" /> }
                } @else {
                  @if (j.escudo) { <img class="wm" [src]="j.escudo" alt="" loading="lazy" /> }
                  @if (j.foto) { <img class="pl" [src]="j.foto" alt="" loading="lazy" (error)="j.foto = ''" /> }
                  @else { <span class="ini">{{ j.nombre.charAt(0) }}</span> }
                }
              </span>
              <span class="nom">
                {{ j.nombre }}
                @if (parte(j.activo_id); as e) { <b class="parte" [class]="e.clase" [title]="e.title">{{ e.eti }}</b> }
              </span>
              @if (porterosDe(j); as ps) {
                <span class="caras" [title]="nombresPorteros(ps)">
                  @for (g of ps; track g.nombre) {
                    @if (g.foto) { <img [src]="g.foto" alt="" loading="lazy" /> }
                  }
                </span>
              }
            </span>
            <span class="club">
              @if (j.escudo) { <img [src]="j.escudo" alt="" loading="lazy" /> }
              {{ j.club }}
            </span>
            <span class="der num">{{ puntosDe(j) }}</span>
            <span class="der num media">{{ mediaDe(j) }}</span>
          </button>
        }
      </div>
    }
  `,
  styles: [`
    .phead { margin-bottom: 18px; }
    .phead .sub { margin: 5px 0 0; color: var(--text2); font-size: var(--t-sm); }

    .kpis { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
    .kpi { flex: 1 1 190px; background: var(--surface); border: 1px solid var(--line);
      border-radius: 16px; padding: 15px 17px; }
    .kpi .lb { display: block; font-size: var(--t-xs); font-weight: 700; letter-spacing: .16em;
      text-transform: uppercase; color: var(--text2); }
    .kpi .v { display: block; margin-top: 4px; font-family: var(--fh); font-size: var(--t-xl); font-weight: 600; }
    .kpi .v small { font-size: var(--t-md); color: var(--text2); }
    .kpi .v.neg { color: var(--bad); }
    /* El desglose por líneas, junto al número que desglosa. */
    .dato { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; }
    .kpi .det { font-size: var(--t-xs); color: var(--text2); }

    /* La plantilla se lee como una clasificación: una fila por jugador.
       La caja y las filas salen de styles.css; aquí solo las columnas. */
    .fila { grid-template-columns: 46px 2fr 150px 74px 78px; }
    /* El retrato del jugador, si lo hay, junto a su nombre. */
    .quien { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .av { position: relative; width: 36px; height: 36px; flex: 0 0 auto; border-radius: 9px;
      overflow: hidden; background: var(--surface2); border: 1px solid var(--line);
      display: flex; align-items: flex-end; justify-content: center; }
    .av .wm { position: absolute; width: 116%; left: 50%; top: 50%;
      transform: translate(-50%,-50%); opacity: .16; object-fit: contain; }
    .av .pl { position: relative; z-index: 1; width: 100%; height: 100%; object-fit: contain; }
    .av .ini { position: relative; z-index: 1; font-weight: 700; color: var(--text2); padding-bottom: 4px; }
    /* La portería no tiene cara: lleva el escudo del club, entero. */
    .av.esc { align-items: center; }
    .av.esc .pl { width: 74%; height: 74%; object-fit: contain; }
    /* A su derecha, quiénes paran de verdad en ese club. */
    .caras { display: flex; align-items: center; flex: 0 0 auto; }
    .caras img { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; object-position: top;
      background: var(--surface2); border: 1.5px solid var(--surface); margin-left: -8px; }
    .caras img:first-child { margin-left: 2px; }
    .nom { font-weight: 700; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .club { display: flex; align-items: center; gap: 6px; color: var(--text2); font-size: var(--t-sm);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .club img { width: 16px; height: 16px; object-fit: contain; }
    .estado { font-size: var(--t-xs); color: var(--text2); }
    .estado.virtual { color: var(--por); font-weight: 600; }
    .media { color: var(--text2); }
    .muted { color: var(--text2); } .err { color: var(--bad); }

    @media (max-width: 760px) {
      /* Sin club ni media: quedan tres celdas, y la rejilla tiene que ser de
         tres o los puntos no llegan al borde. */
      .fila { grid-template-columns: 38px 1fr 54px; gap: 9px; padding: 10px 13px; }
      .fila > :nth-child(3), .fila > :nth-child(5) { display: none; }
      /* Las caras de los porteros se comen el nombre en una pantalla estrecha. */
      .caras { display: none; }
      .av { width: 32px; height: 32px; }
    }
  `],
})
export class PlantillaComponent implements OnInit {
  equipo = signal<Equipo | null>(null);
  items = signal<ItemPlantilla[]>([]);
  statsEq = signal<Record<string, any>>({});
  /** Porteros reales de cada club del que tienes la portería. */
  porteros = signal<Record<string, PorteroClub[]>>({});
  estados = signal<Record<string, ContextoActivo>>({});
  cargando = signal(true);
  error = signal('');


  /** Quién está tocado. Es un aviso: no cambia nada de lo que puedas hacer. */
  parte(activoId: string): { eti: string; clase: string; title: string } | null {
    const c = this.estados()[activoId];
    if (!c?.estado) return null;
    const eti = c.estado === 'SANCIONADO' ? 'Sancionado'
      : c.estado === 'DUDA' ? 'Duda' : 'Lesionado';
    return { eti, clase: c.estado.toLowerCase(),
             title: [c.detalle, c.vuelve].filter(Boolean).join(' · ') || eti };
  }

  totalPuntos = computed(() => +Object.values(this.statsEq()).reduce((s, x: any) => s + Number(x?.puntos || 0), 0).toFixed(1));

  grupos = computed(() => {
    const by: Record<string, ItemPlantilla[]> = {};
    for (const it of this.items()) (by[it.posicion] ??= []).push(it);
    return Object.keys(by).sort((a, b) => ORDEN[a] - ORDEN[b]).map((pos) => ({ pos, eti: ETI[pos] ?? pos, items: by[pos] }));
  });

  /** Por posición (POR, DEF, MED, DEL) y dentro por puntos, de más a menos. */
  /** Lo que costaría hoy la plantilla entera. */
  filas = computed(() =>
    [...this.items()].sort((a, b) =>
      (ORDEN[a.posicion] - ORDEN[b.posicion]) || (this.puntosDe(b) - this.puntosDe(a))));

  /** Cuántos hay de cada línea: lo que se mira antes de fichar. */
  resumen = computed(() => {
    const por = (p: string) => this.items().filter((j) => j.posicion === p).length;
    return [`${por('PORTERO')} POR`, `${por('DEFENSA')} DEF`,
            `${por('MEDIO')} MED`, `${por('DELANTERO')} DEL`].join(' · ');
  });

  constructor(private falm: FalmService, public ficha: FichaService) {}
  abr(p: string) { return ({ PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' } as Record<string, string>)[p] ?? p; }
  /** Las caras que van al lado de una portería; nada para el resto. */
  porterosDe(j: ItemPlantilla): PorteroClub[] | null {
    if (j.tipo !== 'DEFENSA' || !j.club_id) return null;
    const ps = this.porteros()[j.club_id];
    return ps?.length ? ps.slice(0, 3) : null;
  }

  /** Para el tooltip: quiénes son esas caras. */
  nombresPorteros(ps: PorteroClub[]) { return ps.map((p) => p.nombre).join(' · '); }

  puntosDe(j: ItemPlantilla) { return Number(this.statsEq()[j.activo_id]?.puntos ?? 0); }
  /** Media por jornada disputada; un guion mientras no haya ninguna. */
  mediaDe(j: ItemPlantilla): string {
    const s = this.statsEq()[j.activo_id];
    const n = Number(s?.jornadas ?? s?.jugadas ?? 0);
    if (!n) return '—';
    return (Number(s?.puntos ?? 0) / n).toFixed(1);
  }
  abrir(j: ItemPlantilla) {
    const s = this.statsEq()[j.activo_id];
    const tot = s ? {
      puntos: Number(s.puntos ?? 0), goles: Number(s.goles ?? 0), asis: Number(s.asis ?? 0),
      estrellas: Number(s.estrellas ?? 0), imbatidos: Number(s.imbatidos ?? 0), jugadas: Number(s.jugadas ?? 0),
    } : undefined;
    this.ficha.open({ id: j.ext_id ?? 0, activoId: j.activo_id, nombre: j.nombre, equipo: j.club, escudo: j.escudo ?? '', foto: j.foto ?? '', posicion: j.posicion, tot });
  }

  async ngOnInit() {
    try {
      const eq = await this.falm.miEquipo();
      this.equipo.set(eq);
      if (eq) {
        const [items, stats] = await Promise.all([
          this.falm.miPlantilla(eq.id), this.falm.statsEquipo(eq.id),
        ]);
        // Un extra: si falla, la plantilla se ve igual.
        this.falm.estadosActivos().then((e) => this.estados.set(e)).catch(() => {});
        this.items.set(items);
        this.statsEq.set(stats);
        const clubes = items.filter((j) => j.tipo === 'DEFENSA').map((j) => j.club_id!);
        if (clubes.length) {
          this.porteros.set(await this.falm.porterosDeClubes(clubes).catch(() => ({})));
        }
      }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error cargando la plantilla');
    } finally {
      this.cargando.set(false);
    }
  }
}
