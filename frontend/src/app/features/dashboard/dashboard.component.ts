import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DetallePartidoComponent } from '../../shared/detalle-partido.component';
import { ActivoResuelto, Agenda, AgendaItem, Alineado, FalmService, ItemPlantilla, MarcadorJornada, PorteroClub, RolAlineacion } from '../../core/falm.service';

const ORDEN = ['PORTERO', 'DEFENSA', 'MEDIO', 'DELANTERO'] as const;
/** Las líneas que puede cubrir un suplente: una portería no deja hueco. */
const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/**
 * Un titular ya cruzado con su ficha de plantilla y con el desenlace de la
 * jornada: si jugo, si sus puntos entran en el total y con quien se releva.
 * Eso ultimo no se calcula aqui, lo resuelve falm.once_resuelto.
 */
interface EnCampo {
  pos: string; nombre: string; foto: string | null; escudo: string | null;
  club_id: string | null; pts: number | null;
  jugo: boolean; cuenta: boolean; pendiente: boolean;
  /** Titular: quien entro en su lugar. Suplente: a quien sustituye. */
  releva: string | null;
}
/** Un suplente: quién es, qué líneas cubre y lo que lleva sumado. */
interface EnBanca extends EnCampo { cubre: string[]; }
/** La alineación de un equipo en la jornada, lista para pintar. */
interface Once { equipo: string; formacion: string; campo: EnCampo[]; banca: EnBanca[]; enviada: boolean; }

/** Inicio: qué viene ahora — resumen, partido actual, próximo, alineación, fichajes. */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, DetallePartidoComponent],
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

      <!-- Con la jornada en juego, lo primero es el marcador: quién va ganando y por
           cuánto. Antes aquí solo ponía "en juego" y había que irse a Partidos para ver
           el tanteo, o bajar hasta el fondo de esta misma pantalla. -->
      @if (actual(); as ac) {
        <section class="actual" [class.vivo]="!!ag()?.en_juego">
          <div class="ah">
            <span class="al">
              @if (ag()?.en_juego) { <span class="dot"></span> Jornada {{ ac.numero }} en juego }
              @else { Último partido · Jornada {{ ac.numero }} }
            </span>
            <a class="go" routerLink="/jornadas">Ver toda la jornada ›</a>
          </div>
          <!-- Un marcador por partido: en una jornada doble son dos, con la misma
               alineación puntuando en los dos. Cada uno abre sus onces aquí mismo, que es
               lo que se mira cada rato mientras se juega. -->
          @for (r of rivales(ac); track r.enfrentamiento_id) {
            <button class="amatch" (click)="verEnf.set(r.enfrentamiento_id)"
                    title="Ver los dos onces y lo que lleva cada jugador">
              <span class="t" [class.win]="gane(r)">{{ nombre() }}</span>
              <span class="sc num">{{ tanteo(r, true) }}<i>–</i>{{ tanteo(r, false) }}</span>
              <span class="t" [class.win]="perdi(r)">{{ r.rival }}</span>
            </button>
          }
          <!-- Cuantas de las once plazas tienen ya desenlace: sin esto no se
               sabe si un 24-31 esta cerrado o va por la mitad. -->
          @if (avance(); as av) { <p class="av">{{ av }}</p> }
          @if (ag()?.en_juego) { <p class="av cerrada">La alineación ya está cerrada.</p> }
          <p class="av pista">Toca el marcador para ver los onces y los puntos de cada uno.</p>
        </section>
      }

      <falm-detalle-partido [enfrentamiento]="verEnf()" (cerrar)="verEnf.set(null)" />

      <!-- Los avisos van juntos y arriba: primero lo que esta pasando, luego lo
           que vence. Este bloque estaba al final, detras de los dos onces. -->
      <section class="accion">
        <span class="dot"></span>
        <div class="lt">
          <strong>Cierre de fichajes</strong>
          <p>{{ cuenta() }}</p>
        </div>
        <a class="btn-sec" routerLink="/fichajes">Pedir fichaje</a>
      </section>

      @if (ag()?.proximo; as pr) {
        <section class="next">
          <div class="nh">
            <span class="jlbl">Jornada {{ pr.numero }} · {{ etiqueta(pr.comp) }}
              @if (doble()) { <b class="x2" title="Cada equipo juega dos partidos con esta misma alineación">doble ×2</b> }
            </span>
            <span class="fecha">{{ fechaLarga(pr.fecha) }}</span>
          </div>
          <!-- En una jornada doble son dos rivales con la misma alineación: si solo se
               enseña uno, se prepara el once pensando en medio partido. -->
          @for (r of rivales(pr); track r.enfrentamiento_id) {
            <div class="match">
              <span class="tn">{{ nombre() }}</span>
              <span class="vs">{{ r.es_local ? 'vs' : '@' }}</span>
              <span class="tn">{{ r.rival }}</span>
            </div>
          }
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
                    <!-- Se apaga solo el que YA se sabe que no jugo. Mientras su
                         club tenga el partido pendiente sigue encendido: con la
                         jornada sin empezar salia el once entero como caido. -->
                    <div class="fila j11" [class.fuera]="!j.cuenta && !j.pendiente"
                         [title]="porQue(j, true)">
                      <span class="p" [class]="abr(j.pos)">{{ abr(j.pos) }}</span>
                      <img class="fo" [class.es]="!j.foto" [src]="j.foto || j.escudo" alt=""
                           loading="lazy" (error)="j.foto = null" />
                      <span class="nb">{{ j.nombre }}</span>
                      @if (j.escudo) {
                        <img class="cl" [src]="j.escudo" alt="" loading="lazy" />
                      } @else { <span></span> }
                      @if (j.jugo) {
                        <span class="pts num" [class.cero]="!j.pts">{{ j.pts ?? 0 }}</span>
                      } @else {
                        <span class="pts num nj">–</span>
                      }
                    </div>
                  }
                  @if (o.banca.length) {
                    <div class="fila cab">Banquillo</div>
                    <!-- En el banquillo no cuenta nadie hasta que se cae un
                         titular: los que no entran van apagados y el que entra
                         lleva flecha y dice por quien. -->
                    @for (b of suplentes(o); track $index) {
                      <div class="fila j11" [class.fuera]="!b.cuenta" [title]="porQue(b, false)">
                        <span class="p" [class]="abr(b.pos)">
                          @if (b.cuenta) { <i class="sube">↑</i> }{{ abr(b.pos) }}
                        </span>
                        <img class="fo" [class.es]="!b.foto" [src]="b.foto || b.escudo" alt=""
                             loading="lazy" (error)="b.foto = null" />
                        <span class="nb">
                          {{ b.nombre }}@if (b.cuenta && b.releva) { <b class="por">por {{ b.releva }}</b> }
                        </span>
                        @if (b.escudo) {
                          <img class="cl" [src]="b.escudo" alt="" loading="lazy" />
                        } @else { <span></span> }
                        @if (b.jugo) {
                          <span class="pts num" [class.cero]="!b.pts">{{ b.pts ?? 0 }}</span>
                        } @else {
                          <span class="pts num nj">–</span>
                        }
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

    }
  `,
  styles: [`
    .phead { display: flex; align-items: flex-end; justify-content: space-between;
      gap: 20px; flex-wrap: wrap; margin-bottom: 18px; }
    .phead .sub { margin: 5px 0 0; color: var(--text2); font-size: var(--t-sm); }

    /* Con la jornada en juego, el marcador se lleva el acento: es lo que está pasando. */
    .actual.vivo { background: var(--accent-soft); border-color: var(--accent-line); }
    .actual.vivo .al { color: var(--accent); }
    .actual .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%;
      background: var(--accent); margin-right: 6px; vertical-align: 1px; }
    .actual .av.cerrada { margin-top: 4px; }

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
    /* La mono es solo para cifras: aqui alterna la formacion con "sin enviar",
       que es una frase, asi que va en la de interfaz. */
    .barra .f { font-size: var(--t-sm); color: var(--text2); }

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
       igual que se vería un 7. Se distingue por el gris, no por un círculo:
       un número dentro de un aro y otro sin él no parecen la misma columna. */
    .pts.cero { color: var(--text2); }
    /* Quien no suma al total se apaga: el titular que no jugo y el suplente que
       se queda en el banquillo porque no se le cayo nadie delante. */
    .fila.fuera { opacity: .45; }
    .pts.nj { color: var(--text2); }
    .sube { font-style: normal; color: var(--accent); margin-right: 3px; }
    .por { font-size: var(--t-xs); font-weight: 700; color: var(--accent); margin-left: 5px; }

    /* El banquillo va en las mismas filas que el once, bajo su cabecera: iba en
       píldoras agrupadas por la línea que cubría cada uno y era el único bloque
       de la tabla con caja propia. Ahí el club no se veía y el orden de entrada
       (1, 2) se leía como puntos, al lado de los puntos de verdad. Quién cubre
       qué zona y en qué orden se gestiona en Alineación, que es su sitio. */
    .esperando { margin: 0; padding: 22px 14px; font-size: var(--t-sm); color: var(--text2); }

    .cambiar { display: block; text-align: center; margin: 14px 0 0;
      padding: 10px; border: 1px solid var(--line); border-radius: var(--r-sm);
      font-size: var(--t-sm); font-weight: 600; }

    .actual { display: block; background: var(--surface); border: 1px solid var(--line);
      /* .amatch es un boton: que no traiga los estilos de navegador. */
      border-radius: var(--r); padding: 15px 17px; margin-bottom: 14px; }
    .actual .ah { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .actual .al { font-size: var(--t-xs); text-transform: uppercase; letter-spacing: .16em; color: var(--text2); font-weight: 700; }
    .actual .go { color: var(--accent); font-size: var(--t-sm); font-weight: 600; }
    .actual .amatch { display: flex; align-items: center; justify-content: center; gap: 12px;
      width: 100%; padding: 6px 4px; background: none; border: 1px dashed transparent;
      border-radius: var(--r-sm); cursor: pointer; font-family: inherit; }
    .actual .amatch:hover { border-color: var(--accent-line); background: var(--surface2); }
    .actual.vivo .amatch:hover { background: color-mix(in oklab, var(--accent) 8%, transparent); }
    .actual .av.pista { opacity: .8; }
    .actual .t { flex: 1; text-align: center; font-weight: 600; font-size: var(--t-sm); color: var(--text2);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .actual .t.win { color: var(--text); font-weight: 700; }
    .actual .sc { flex: 0 0 auto; font-size: var(--t-lg); font-weight: 700; color: var(--accent); }
    .actual .sc i { color: var(--text2); font-style: normal; margin: 0 5px; }
    .actual .av { margin: 8px 0 0; text-align: center; font-size: var(--t-xs);
      color: var(--text2); }

    /* Misma franja que .live: el acento se lo queda la jornada en juego, que es
       lo que esta pasando; esto solo vence. */
    .accion { display: flex; align-items: center; gap: 12px; padding: 13px 17px; margin-bottom: 14px;
      background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-sm); }
    .accion .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--por); flex: 0 0 auto; }
    .accion .lt { flex: 1; }
    .accion strong { display: block; font-size: var(--t-sm); }
    .accion p { margin: 2px 0 0; font-size: var(--t-sm); color: var(--text2); }
    .muted { color: var(--text2); }

    @media (max-width: 760px) {
      /* Una tabla debajo de la otra: dos no caben en un móvil. */
      .duelo { grid-template-columns: 1fr; }
      .barra strong { font-size: var(--t-md); }
      /* Las cinco columnas siguen siendo cinco: si aquí faltaba una, los
         puntos se caían a una segunda línea. */
      .j11 { grid-template-columns: 30px 24px 1fr 16px 34px; gap: 7px; }
      .tabla .fila { padding: 6px 12px; }
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
  /** Marcador en vivo del partido de arriba, con lo puntuado hasta ahora. */
  marcaMio = signal<MarcadorJornada | null>(null);
  /** Lo que lleva cada rival de la jornada, por equipo: en una doble son dos. */
  marcaRivales = signal<Record<string, MarcadorJornada | null>>({});
  marcaRival = computed(() => {
    const ac = this.actual();
    return ac ? this.marcaRivales()[ac.rival_id] ?? null : null;
  });

  /** Los partidos de la jornada: dos si es doble, y si no, el de siempre. */
  rivales(ac: AgendaItem): AgendaItem[] {
    return ac.rivales?.length ? ac.rivales : [ac];
  }
  /** Si en esta jornada cada equipo juega dos partidos. */
  doble = signal(false);

  actual = computed<AgendaItem | null>(() => this.ag()?.en_juego ?? this.ag()?.ultimo ?? null);
  /** El partido cuyo detalle se está mirando, sin salir de Inicio. */
  verEnf = signal<string | null>(null);
  /** La jornada cuyo once enseñamos: la que viene, y si no la que está en juego. */
  private foco = computed<AgendaItem | null>(() => this.ag()?.proximo ?? this.ag()?.en_juego ?? null);

  /** Mi once y el del rival, en ese orden. */
  lados = computed<Once[]>(() => [this.mio(), this.rival()].filter((o): o is Once => !!o));
  /** Los once, de portería a delantera. */
  once(o: Once) { return ORDEN.flatMap((pos) => o.campo.filter((j) => j.pos === pos)); }
  /**
   * Por que suma o no suma cada uno, en palabras. El color y la flecha dan el
   * golpe de vista; esto lo explica cuando no basta con eso.
   */
  porQue(j: EnCampo, titular: boolean): string {
    if (!j.jugo) {
      // Mientras su club tenga el partido por jugar no ha fallado nadie: eso es
      // esperar, no caerse, y se pintaba igual que una baja.
      if (j.pendiente) return titular ? 'Aún no ha jugado' : 'Aún no ha jugado · en el banquillo';
      return titular && j.releva ? `No jugó · entra ${j.releva} en su lugar` : 'No jugó';
    }
    if (j.cuenta) {
      return titular ? `Suma ${j.pts ?? 0}`
        : `Entra por ${j.releva ?? 'un titular caído'} y suma ${j.pts ?? 0}`;
    }
    // Un suplente puede haber jugado y hasta puntuado, pero si no se cae nadie
    // de las lineas que cubre, sus puntos no entran.
    return `Jugó y sumó ${j.pts ?? 0}, pero se queda en el banquillo`;
  }

  /** El banquillo, en el mismo orden que el once: de portería a delantera. */
  suplentes(o: Once) { return ORDEN.flatMap((pos) => o.banca.filter((b) => b.pos === pos)); }

  constructor(private falm: FalmService) {}
  ngOnDestroy() { if (this.timer) clearInterval(this.timer); }

  etiqueta(t: string) { return t === 'CHAMPIONS' ? 'Champions' : t === 'CLAUSURA' ? 'Clausura' : 'Liga'; }
  fmt(n: number | null) { return n == null ? '–' : (Math.round(n * 10) / 10).toString(); }

  /**
   * Lo que va marcando cada uno. Mientras la jornada no la cierre el cron,
   * falm.enfrentamiento sigue vacio, asi que manda el calculo en vivo; cuando
   * se cierra los dos numeros son el mismo.
   */
  tanteo(ac: AgendaItem, mio: boolean): string {
    const m = mio ? this.marcaMio() : this.marcaRivales()[ac.rival_id] ?? null;
    if (m?.alineada && m.puntos != null) return this.fmt(m.puntos);
    return this.fmt(mio ? ac.mis_puntos : ac.rival_puntos);
  }

  /** "7 de 11 jugados", y solo mientras quede alguno por resolver. */
  avance = computed<string | null>(() => {
    const a = this.marcaMio(), b = this.marcaRival();
    if (!a?.alineada || !a.plazas) return null;
    const hechos = Math.min(a.resueltos ?? 0, b?.resueltos ?? a.resueltos ?? 0);
    if (hechos >= (a.plazas ?? 11)) return null;
    return `${a.resueltos ?? 0} de ${a.plazas} jugados · ${b?.resueltos ?? 0} de ${b?.plazas ?? a.plazas} el rival`;
  });
  gane(ac: AgendaItem) { return ac.mis_puntos != null && ac.rival_puntos != null && ac.mis_puntos > ac.rival_puntos; }
  perdi(ac: AgendaItem) { return ac.mis_puntos != null && ac.rival_puntos != null && ac.rival_puntos > ac.mis_puntos; }
  abr(pos: string) { return ABR[pos] ?? pos; }
  /** En una fila estrecha del relevo cabe el apellido; una porteria, su club. */
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
    const [plantilla, pts, resuelto] = await Promise.all([
      this.falm.miPlantilla(equipoId),
      this.falm.puntosDeJornada(jornadaId, al.jugadores.map((j: Alineado) => j.activo_id))
        .catch(() => ({} as Record<string, number>)),
      al.id ? this.falm.onceResuelto(al.id).catch(() => [] as ActivoResuelto[])
            : Promise.resolve([] as ActivoResuelto[]),
    ]);
    const ficha = new Map<string, ItemPlantilla>(plantilla.map((p) => [p.activo_id, p]));
    const res = new Map<string, ActivoResuelto>(resuelto.map((r) => [r.activo_id, r]));
    // El titular caido no sabe quien le sustituye; el suplente si sabe a quien
    // tapa, asi que se da la vuelta a esa relacion para poder decirlo en ambos.
    const releva = new Map<string, string>();
    for (const r of resuelto) {
      if (r.entra_por) releva.set(r.entra_por, r.activo_id);
    }
    const apellido = (id: string | null | undefined) =>
      id ? this.corto(ficha.get(id)?.nombre ?? '') || null : null;

    const dentro = (rol: RolAlineacion) => al.jugadores.filter((j: Alineado) => j.rol === rol);
    const datos = (p: ItemPlantilla): EnCampo => {
      const r = res.get(p.activo_id);
      return {
        pos: p.posicion, nombre: p.nombre, foto: p.foto ?? null, escudo: p.escudo ?? null,
        club_id: p.club_id ?? null,
        pts: r ? r.puntos : (pts[p.activo_id] ?? null),
        // Sin resolucion (jornada aun sin puntuar) nadie esta caido ni fuera:
        // se pinta como siempre y no se inventa un relevo.
        jugo: r ? r.jugo : true,
        cuenta: r ? r.cuenta : true,
        pendiente: r ? r.pendiente : true,
        releva: r ? apellido(r.entra_por ?? releva.get(p.activo_id)) : null,
      };
    };
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
        const ac = this.actual();
        if (ac?.jornada_id) {
          // Un marcador por rival: en una jornada doble hay dos, y el mío vale para ambos.
          const rivs = this.rivales(ac);
          const [a, ...otros] = await Promise.all([
            this.falm.marcadorJornada(ac.jornada_id, eq.id).catch(() => null),
            ...rivs.map((r) => this.falm.marcadorJornada(ac.jornada_id, r.rival_id).catch(() => null)),
          ]);
          this.marcaMio.set(a);
          this.marcaRivales.set(Object.fromEntries(rivs.map((r, i) => [r.rival_id, otros[i]])));
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
