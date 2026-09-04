import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Agenda, AgendaItem, Alineado, FalmService, ItemPlantilla, PorteroClub, RolAlineacion } from '../../core/falm.service';

const ORDEN = ['PORTERO', 'DEFENSA', 'MEDIO', 'DELANTERO'] as const;
/** Las líneas que puede cubrir un suplente: una portería no deja hueco. */
const LINEAS = ['DEFENSA', 'MEDIO', 'DELANTERO'];
const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/** Un titular ya cruzado con su ficha de plantilla. */
interface EnCampo { pos: string; nombre: string; foto: string | null; escudo: string | null; club_id: string | null; pts: number | null; }
/** Un suplente: quién es, qué líneas cubre y lo que lleva sumado. */
interface EnBanca extends EnCampo { cubre: string[]; }
/** La alineación de un equipo en la jornada, lista para pintar. */
interface Once { equipo: string; formacion: string; campo: EnCampo[]; banca: EnBanca[]; enviada: boolean; }

/** Inicio: qué viene ahora — resumen, partido actual, próximo, alineación, fichajes. */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else {
      <header class="phead">
        <div>
          <h1>{{ nombre() || 'Mi equipo' }}</h1>
          @if (resumen(); as r) {
            <p class="sub">{{ r.pos }}º de {{ r.total }} en la liga · {{ r.pts }} puntos de clasificación.</p>
          } @else {
            <p class="sub">Temporada 2026/27.</p>
          }
        </div>
        <a class="btn-sec" routerLink="/clasificacion">Ver clasificación</a>
      </header>

      @if (ag()?.en_juego; as ej) {
        <section class="live">
          <span class="dot"></span>
          <div class="lt">
            <strong>Jornada {{ ej.numero }} en juego</strong>
            <p>{{ nombre() }} {{ ej.es_local ? 'contra' : 'en casa de' }} {{ ej.rival }} · alineación cerrada</p>
          </div>
          <a class="btn-sec" routerLink="/jornadas">Seguir</a>
        </section>
      }

      @if (ag()?.proximo; as pr) {
        <section class="next">
          <div class="nh">
            <span class="jlbl">Jornada {{ pr.numero }} · {{ etiqueta(pr.comp) }}
              @if (doble()) { <b class="x2" title="Cada equipo juega dos partidos con esta misma alineación">doble ×2</b> }
            </span>
            <span class="fecha">{{ fechaLarga(pr.fecha) }}</span>
          </div>
          <div class="match">
            <span class="tn">{{ nombre() }}</span>
            <span class="vs">{{ pr.es_local ? 'vs' : '@' }}</span>
            <span class="tn">{{ pr.rival }}</span>
          </div>
          <p class="cd">{{ cuentaPartido() }}</p>
          @if (!mio()?.enviada) { <a class="btn" routerLink="/alineacion">Manda tu alineación</a> }
        </section>
      } @else {
        <section class="next vacio"><p class="muted">Sin próximos partidos programados.</p></section>
      }

      <!-- Los dos onces, uno en cada columna, en tabla: una fila por jugador
           y todas del mismo alto, que las píldoras de ancho variable mareaban. -->
      @if (mio()?.enviada) {
        <section class="once">
          <div class="duelo">
            @for (o of lados(); track $index) {
              <div class="tabla">
                <div class="barra">
                  <strong>{{ o.equipo }}</strong>
                  <span class="f">{{ o.enviada ? o.formacion : 'sin enviar' }}</span>
                </div>

                @if (o.enviada) {
                  <div class="fila j11 cab">
                    <span></span><span></span><span>Once</span><span></span><span class="der">Pts</span>
                  </div>
                  @for (j of once(o); track $index) {
                    <div class="fila j11">
                      <span class="p" [class]="abr(j.pos)">{{ abr(j.pos) }}</span>
                      <img class="fo" [class.es]="!j.foto" [src]="j.foto || j.escudo" alt=""
                           loading="lazy" (error)="j.foto = null" />
                      <span class="nb">{{ j.nombre }}</span>
                      @if (j.escudo) {
                        <img class="cl" [src]="j.escudo" alt="" loading="lazy" />
                      } @else { <span></span> }
                      <span class="pts num" [class.cero]="!j.pts">{{ j.pts ?? 0 }}</span>
                    </div>
                  }
                  @if (o.banca.length) {
                    <div class="fila cab">Banquillo · quién entra en cada línea</div>
                    @for (c of colas(o); track c.linea) {
                      <div class="fila cola">
                        <span class="p" [class]="abr(c.linea)">{{ abr(c.linea) }}</span>
                        <div class="cs">
                          @for (b of c.js; track $index) {
                            <span class="s">
                              <i>{{ $index + 1 }}</i>
                              <img class="fo" [class.es]="!b.foto" [src]="b.foto || b.escudo" alt=""
                                   loading="lazy" (error)="b.foto = null" />
                              {{ corto(b.nombre) }}
                              <b class="real" [class]="abr(b.pos)">{{ abr(b.pos) }}</b>
                              <em class="num" [class.cero]="!b.pts">{{ b.pts ?? 0 }}</em>
                            </span>
                          }
                        </div>
                      </div>
                    }
                  }
                } @else {
                  <p class="esperando">Aún no ha mandado su alineación.</p>
                }
              </div>
            }
          </div>

          <a class="cambiar" routerLink="/alineacion">Cambiar mi alineación</a>
        </section>
      }

      @if (actual(); as ac) {
        <a class="actual" routerLink="/jornadas">
          <div class="ah">
            <span class="al">{{ ag()?.en_juego ? 'Partido actual' : 'Último partido' }} · J{{ ac.numero }}</span>
            <span class="go">Ver detalle ›</span>
          </div>
          <div class="amatch">
            <span class="t" [class.win]="gane(ac)">{{ nombre() }}</span>
            <span class="sc num">{{ fmt(ac.mis_puntos) }}<i>–</i>{{ fmt(ac.rival_puntos) }}</span>
            <span class="t" [class.win]="perdi(ac)">{{ ac.rival }}</span>
          </div>
        </a>
      }

      <section class="accion">
        <div class="cd2">
          <span class="lb">Cierre de fichajes</span>
          <strong>{{ cuenta() }}</strong>
        </div>
        <a class="btn-sec" routerLink="/fichajes">Pedir fichaje</a>
      </section>
    }
  `,
  styles: [`
    .phead { display: flex; align-items: flex-end; justify-content: space-between;
      gap: 20px; flex-wrap: wrap; margin-bottom: 18px; }
    .phead .sub { margin: 5px 0 0; color: var(--text2); font-size: var(--t-sm); }

    .live { display: flex; align-items: center; gap: 12px; padding: 13px 17px; margin-bottom: 14px;
      background: var(--accent-soft); border: 1px solid var(--accent-line); border-radius: var(--r-sm); }
    .live .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); flex: 0 0 auto; }
    .live .lt { flex: 1; } .live strong { display: block; color: var(--accent); font-size: var(--t-sm); }
    .live p { margin: 2px 0 0; font-size: var(--t-sm); color: var(--text2); }

    /* El duelo de la semana es la portada: se lee de lejos. */
    .next { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r);
      padding: 20px; margin-bottom: 14px; }
    .next.vacio { padding: 26px; text-align: center; }
    .nh { display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
      padding-bottom: 14px; border-bottom: 1px solid var(--line); margin-bottom: 20px; }
    .jlbl { font-size: var(--t-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .16em; color: var(--accent); }
    /* Una jornada doble se puntúa dos veces con la misma alineación. */
    .x2 { margin-left: 7px; color: var(--por); letter-spacing: .06em; }
    .fecha { font-size: var(--t-sm); color: var(--text2); text-transform: capitalize; }
    .match { display: flex; align-items: center; justify-content: center; gap: 16px; }
    .match .tn { flex: 1; min-width: 0; text-align: center; font-family: var(--fh); font-size: var(--t-lg);
      font-weight: 600; text-transform: uppercase; letter-spacing: -.01em;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .match .vs { flex: 0 0 auto; font-size: var(--t-xs); font-weight: 700; text-transform: uppercase;
      letter-spacing: .1em; color: var(--text2); padding: 4px 10px;
      border: 1px solid var(--line); border-radius: var(--pill); }
    .cd { text-align: center; color: var(--text2); font-size: var(--t-sm); margin: 16px 0 18px; }
    .cd:last-child { margin-bottom: 0; }
    .btn { display: block; text-align: center; }

    .once { margin-bottom: 14px; }
    /* Los dos onces, uno a cada lado y en tabla. */
    .duelo { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
    .tabla .barra { justify-content: space-between; padding: 12px 14px; }
    .barra strong { font-family: var(--fh); font-size: var(--t-lg); font-weight: 600;
      text-transform: uppercase; letter-spacing: -.01em; line-height: 1.1;
      min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .barra .f { font-family: var(--fm); font-size: var(--t-sm); color: var(--text2); }

    /* Todas las filas iguales: demarcación, cara, nombre, club y puntos. */
    .tabla .fila { padding: 6px 14px; }
    .j11 { grid-template-columns: 32px 26px 1fr 18px 38px; gap: 9px; }
    .j11.cab { padding-top: 10px; padding-bottom: 8px; }
    .p { font-size: var(--t-xs); font-weight: 700; letter-spacing: .06em; color: var(--text2); }
    .p.POR { color: var(--por); } .p.DEF { color: var(--def); }
    .p.MED { color: var(--med); } .p.DEL { color: var(--del); }
    .p.n { font-family: var(--fm); font-weight: 400; }
    .fo { width: 26px; height: 26px; border-radius: 50%; object-fit: cover;
      object-position: top center; background: var(--surface2); }
    /* Un escudo casi blanco (el del Madrid) se perdía sobre el papel: va sobre
       un disco con filete, como los retratos. */
    .fo.es { object-fit: contain; padding: 3px; background: var(--surface2);
      border: 1px solid var(--line); }
    .nb { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .cl { width: 18px; height: 18px; object-fit: contain; opacity: .85; }
    .pts { font-family: var(--fm); font-size: var(--t-sm); text-align: right; }
    /* Sin puntuación todavía es un cero, no un hueco: se ve que jugó y no sumó
       igual que se vería un 7. */
    .pts.cero, .s em.cero { display: inline-flex; align-items: center; justify-content: center;
      width: 22px; height: 22px; border: 1px solid var(--line); border-radius: 50%;
      color: var(--text2); }
    .pts.cero { margin-left: auto; }

    /* El banquillo, agrupado por la línea que cubre cada uno: de un vistazo se
       ve quién entra si falla un defensa, un medio o un delantero. */
    .cola { grid-template-columns: 32px 1fr; gap: 9px; }
    .cs { display: flex; flex-wrap: wrap; gap: 6px; }
    .s { display: inline-flex; align-items: center; gap: 5px; font-size: var(--t-sm);
      padding: 2px 9px 2px 6px; border: 1px solid var(--line); border-radius: var(--pill); }
    .s i { font-family: var(--fm); font-style: normal; font-size: var(--t-xs); color: var(--text2); }
    .s .fo { width: 21px; height: 21px; }
    .s em { font-style: normal; font-size: var(--t-xs); color: var(--text2); }
    /* La posición real del suplente, que es la que juega aunque cubra otra
       línea: de ahí salen las formaciones imposibles. */
    .s .real { font-size: var(--t-xs); font-weight: 700; letter-spacing: .06em; }
    .real.POR { color: var(--por); } .real.DEF { color: var(--def); }
    .real.MED { color: var(--med); } .real.DEL { color: var(--del); }
    .esperando { margin: 0; padding: 22px 14px; font-size: var(--t-sm); color: var(--text2); }

    .cambiar { display: block; text-align: center; margin: 14px 0 0;
      padding: 10px; border: 1px solid var(--line); border-radius: var(--r-sm);
      font-size: var(--t-sm); font-weight: 600; }

    .actual { display: block; background: var(--surface); border: 1px solid var(--line);
      border-radius: var(--r); padding: 15px 17px; margin-bottom: 14px; }
    .actual .ah { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .actual .al { font-size: var(--t-xs); text-transform: uppercase; letter-spacing: .16em; color: var(--text2); font-weight: 700; }
    .actual .go { color: var(--accent); font-size: var(--t-sm); font-weight: 600; }
    .actual .amatch { display: flex; align-items: center; justify-content: center; gap: 12px; }
    .actual .t { flex: 1; text-align: center; font-weight: 600; font-size: var(--t-sm); color: var(--text2);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .actual .t.win { color: var(--text); font-weight: 700; }
    .actual .sc { flex: 0 0 auto; font-size: var(--t-lg); font-weight: 700; color: var(--accent); }
    .actual .sc i { color: var(--text2); font-style: normal; margin: 0 5px; }

    .accion { display: flex; align-items: center; gap: 14px; padding: 14px 17px;
      background: var(--surface); border: 1px solid var(--line); border-left: 3px solid var(--por);
      border-radius: var(--r-sm); }
    .accion .cd2 { flex: 1; }
    .accion .lb { display: block; font-size: var(--t-xs); font-weight: 700; letter-spacing: .16em;
      text-transform: uppercase; color: var(--text2); }
    .accion strong { display: block; margin-top: 2px; font-size: var(--t-md); }
    .muted { color: var(--text2); }

    @media (max-width: 760px) {
      /* Una tabla debajo de la otra: dos no caben en un móvil. */
      .duelo { grid-template-columns: 1fr; }
      .barra strong { font-size: var(--t-md); }
      /* Las cinco columnas siguen siendo cinco: si aquí faltaba una, los
         puntos se caían a una segunda línea. */
      .j11 { grid-template-columns: 30px 24px 1fr 16px 34px; gap: 7px; }
      .tabla .fila { padding: 6px 12px; }
      .cola { grid-template-columns: 30px 1fr; gap: 7px; }
      .pts.cero, .s em.cero { width: 20px; height: 20px; }
    }
  `],
})
export class DashboardComponent implements OnInit, OnDestroy {
  cargando = signal(true);
  nombre = signal('');
  ag = signal<Agenda | null>(null);
  resumen = signal<{ pos: number; total: number; pts: number } | null>(null);
  cuenta = signal('');
  cuentaPartido = signal('');
  private timer: any = null;

  /** Los dos onces de la jornada que viene (o de la que se está jugando). */
  mio = signal<Once | null>(null);
  rival = signal<Once | null>(null);
  /** Si en esta jornada cada equipo juega dos partidos. */
  doble = signal(false);

  actual = computed<AgendaItem | null>(() => this.ag()?.en_juego ?? this.ag()?.ultimo ?? null);
  /** La jornada cuyo once enseñamos: la que viene, y si no la que está en juego. */
  private foco = computed<AgendaItem | null>(() => this.ag()?.proximo ?? this.ag()?.en_juego ?? null);

  /** Mi once y el del rival, en ese orden. */
  lados = computed<Once[]>(() => [this.mio(), this.rival()].filter((o): o is Once => !!o));
  /** Los once, de portería a delantera. */
  once(o: Once) { return ORDEN.flatMap((pos) => o.campo.filter((j) => j.pos === pos)); }
  /**
   * El banquillo por líneas: quién entra si falla un defensa, un medio o un
   * delantero, en el orden en que entrarían. Uno puede cubrir varias, y
   * entonces sale en varias colas.
   */
  colas(o: Once) {
    const cs = LINEAS.map((linea) => ({ linea, js: o.banca.filter((b) => b.cubre.includes(linea)) }))
      .filter((c) => c.js.length);
    const sueltos = o.banca.filter((b) => !b.cubre.length);
    return sueltos.length ? [...cs, { linea: 'SIN LÍNEA', js: sueltos }] : cs;
  }

  constructor(private falm: FalmService) {}
  ngOnDestroy() { if (this.timer) clearInterval(this.timer); }

  etiqueta(t: string) { return t === 'CHAMPIONS' ? 'Champions' : t === 'CLAUSURA' ? 'Clausura' : 'Liga'; }
  fmt(n: number | null) { return n == null ? '–' : (Math.round(n * 10) / 10).toString(); }
  gane(ac: AgendaItem) { return ac.mis_puntos != null && ac.rival_puntos != null && ac.mis_puntos > ac.rival_puntos; }
  perdi(ac: AgendaItem) { return ac.mis_puntos != null && ac.rival_puntos != null && ac.rival_puntos > ac.mis_puntos; }
  abr(pos: string) { return ABR[pos] ?? pos; }
  /** En una línea de once cabe el apellido; una portería se nombra por su club. */
  corto(nombre: string) {
    if (nombre.startsWith('Porter')) return nombre.replace(/^Porter[íi]a\s*/, '');
    const p = nombre.trim().split(/\s+/);
    return p.length > 1 ? p[p.length - 1] : nombre;
  }

  fechaLarga(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) +
      ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  /** Próximo martes 23:59 (deadline semanal de fichajes). */
  private proximoCierre(): Date {
    const ahora = new Date(); const d = new Date(ahora); d.setHours(23, 59, 0, 0);
    let dias = (2 - d.getDay() + 7) % 7;
    if (dias === 0 && ahora.getTime() > d.getTime()) dias = 7;
    d.setDate(d.getDate() + dias); return d;
  }
  private restante(ms: number): string {
    if (ms <= 0) return 'En proceso';
    const dd = Math.floor(ms / 86400000), hh = Math.floor((ms % 86400000) / 3600000), mm = Math.floor((ms % 3600000) / 60000);
    return dd > 0 ? `Faltan ${dd}d ${hh}h` : `Faltan ${hh}h ${mm}m`;
  }
  private tick() {
    this.cuenta.set(this.restante(this.proximoCierre().getTime() - Date.now()));
    const pr = this.ag()?.proximo;
    if (pr) {
      const ms = new Date(pr.fecha).getTime() - Date.now();
      this.cuentaPartido.set(ms > 0
        ? this.restante(ms) + (this.mio()?.enviada ? ' para el cierre' : ' para cerrar tu alineación')
        : 'Alineación cerrada');
    }
  }

  /** Cruza una alineación guardada con la plantilla y con lo que sumó cada uno en la jornada. */
  private async onceDe(equipoId: string, equipo: string, jornadaId: string): Promise<Once> {
    const vacio: Once = { equipo, formacion: '', campo: [], banca: [], enviada: false };
    const al = await this.falm.getAlineacion(equipoId, jornadaId);
    if (!al) return vacio;
    const [plantilla, pts] = await Promise.all([
      this.falm.miPlantilla(equipoId),
      this.falm.puntosDeJornada(jornadaId, al.jugadores.map((j: Alineado) => j.activo_id))
        .catch(() => ({} as Record<string, number>)),
    ]);
    const ficha = new Map<string, ItemPlantilla>(plantilla.map((p) => [p.activo_id, p]));
    const dentro = (rol: RolAlineacion) => al.jugadores.filter((j: Alineado) => j.rol === rol);
    const datos = (p: ItemPlantilla): EnCampo => ({
      pos: p.posicion, nombre: p.nombre, foto: p.foto ?? null, escudo: p.escudo ?? null,
      club_id: p.club_id ?? null, pts: pts[p.activo_id] ?? null,
    });
    const once: Once = {
      equipo,
      formacion: al.formacion,
      enviada: true,
      campo: dentro('TITULAR').flatMap<EnCampo>((j) => {
        const p = ficha.get(j.activo_id);
        return p ? [datos(p)] : [];
      }),
      banca: dentro('SUPLENTE').flatMap<EnBanca>((j) => {
        const p = ficha.get(j.activo_id);
        return p ? [{ ...datos(p), cubre: j.lineas ?? [] }] : [];
      }),
    };
    await this.caraDeLasPorterias(once);
    return once;
  }

  /**
   * Una portería no tiene retrato: sin esto salía su escudo dos veces, de cara
   * y en la columna del club. Le ponemos la cara del portero de ese equipo,
   * que al fin y al cabo es quien para.
   */
  private async caraDeLasPorterias(o: Once) {
    const sinCara = [...o.campo, ...o.banca].filter((j) => !j.foto && j.club_id);
    if (!sinCara.length) return;
    const porteros = await this.falm.porterosDeClubes(sinCara.map((j) => j.club_id!))
      .catch(() => ({} as Record<string, PorteroClub[]>));
    for (const j of sinCara) {
      const foto = porteros[j.club_id!]?.find((p) => p.foto)?.foto;
      if (foto) j.foto = foto;
    }
  }

  async ngOnInit() {
    try {
      const eq = await this.falm.miEquipo();
      if (eq) {
        this.nombre.set(eq.nombre);
        this.ag.set(await this.falm.agenda(eq.id));
        const f = this.foco();
        if (f?.jornada_id) {
          this.falm.jornadasDobles([f.jornada_id])
            .then((d) => this.doble.set(d.has(f.jornada_id))).catch(() => {});
          const [yo, otro] = await Promise.all([
            this.onceDe(eq.id, eq.nombre, f.jornada_id),
            this.onceDe(f.rival_id, f.rival, f.jornada_id),
          ]);
          this.mio.set(yo);
          this.rival.set(otro);
        }
        const comps = await this.falm.competiciones();
        const liga = comps.find((c) => c.tipo === 'LIGA') ?? comps[0];
        if (liga) {
          const clas = await this.falm.clasificacion(liga.id);
          const mia = clas.find((fila) => fila.equipo_falm_id === eq.id);
          if (mia) this.resumen.set({ pos: mia.posicion, total: clas.length, pts: mia.puntos_clasificacion });
        }
      }
    } catch { /* defaults */ } finally {
      this.cargando.set(false);
      this.tick();
      this.timer = setInterval(() => this.tick(), 60000);
    }
  }
}
