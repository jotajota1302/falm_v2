import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FalmService, JornadaLfp, PuntosJugador } from '../../core/falm.service';
import { FichaService } from '../../shared/ficha.service';
import { crearLista } from '../../shared/lista';
import { OrdDirective } from '../../shared/orden.directive';
import { PaginasComponent } from '../../shared/paginas.component';

const ABR: Record<string, string> = { Portero: 'POR', PORTERO: 'POR', Defensa: 'DEF', DEFENSA: 'DEF',
  Mediocampista: 'MED', MEDIO: 'MED', Delantero: 'DEL', DELANTERO: 'DEL' };

/** Estadísticas: puntos de cada jugador, acumulados o de una jornada LFP. */
@Component({
  selector: 'app-puntuaciones',
  standalone: true,
  imports: [FormsModule, OrdDirective, PaginasComponent],
  template: `
    <header class="phead">
      <h1>Estadísticas</h1>
      <p class="sub">{{ subtitulo() }}</p>
    </header>

    <div class="chips modos">
      <button [class.on]="modo() === 'acumulada'" (click)="setModo('acumulada')">Acumulada</button>
      <button [class.on]="modo() === 'jornada'" (click)="setModo('jornada')">Por jornada</button>
    </div>

    @if (modo() === 'jornada' && jornadas().length) {
      <div class="jchips tira-x">
        <!-- El numero es el de LaLiga: estas puntuaciones son de sus partidos y es por
             donde se comprueban en la prensa. Que jornada nuestra es cada una lo dice
             el title, y debajo se aclara de que jornadas se esta hablando. -->
        @for (j of jornadas(); track j.numero) {
          <button [class.on]="j.numero === sel()" (click)="elegir(j.numero)"
                  [class.fuera]="!j.falm" [title]="j.descripcion">J{{ j.numero }}</button>
        }
      </div>
      <p class="leyj">
        Son las jornadas de <b>LaLiga (LFP)</b>, que es como salen publicadas las
        puntuaciones.@if (hayDeFuera()) { Las de trazo discontinuo se jugaron antes de
        que empezara nuestra liga y no cuentan para la clasificación. }
      </p>
    }

    @if (cargando()) {
      <p class="muted">Cargando{{ modo() === 'jornada' ? ' la jornada ' + sel() + ' de LaLiga' : ' la acumulada' }}…</p>
    } @else if (error()) {
      <p class="err">{{ error() }}</p>
    } @else {
      <section class="tabla">
        <div class="barra">
          <span class="lb">{{ modo() === 'acumulada' ? 'Más puntuados' : 'Jornada ' + sel() + ' de LaLiga' }}</span>
          <input class="buscar" type="search" placeholder="Buscar jugador o equipo…"
                 [ngModel]="texto()" (ngModelChange)="texto.set($event); l.reset()" />
          <!-- Las flechas también arriba: pasar de página sin bajar al fondo. -->
          <falm-paginas [l]="l" [compacto]="true" />
        </div>

        <!-- Esta lista no tenía cabecera: sin ella no había dónde ordenar. -->
        <div class="fila cab">
          <span class="rk">#</span><span></span>
          <span falmOrd="nombre" [l]="l">Jugador</span>
          <span class="hechos" falmOrd="goles" [l]="l">Goles</span>
          <span class="barra-p"></span>
          <span class="der" falmOrd="pts" [l]="l">Pts</span>
        </div>

        @if (!l.total()) {
          <p class="vacio muted">Sin resultados.</p>
        } @else {
          @for (p of l.visibles(); track p.jugador.id; let i = $index) {
            <button class="fila" (click)="abrirFicha(p)">
              <span class="rk num">{{ l.desde() + i + 1 }}</span>
              <span class="av">
                @if (p.jugador.escudo) { <img class="wm" [src]="p.jugador.escudo" alt="" /> }
                @if (p.jugador.foto) { <img class="pl" [src]="p.jugador.foto" alt="" loading="lazy" (error)="p.jugador.foto = ''" /> }
                @else { <span class="ini">{{ p.jugador.nombre.charAt(0) }}</span> }
              </span>
              <span class="who">
                <span class="nm">{{ p.jugador.nombre }}</span>
                <span class="meta">
                  <span class="pos" [class]="abr(p.jugador.posicion)">{{ abr(p.jugador.posicion) }}</span>
                  {{ p.jugador.equipo }} · {{ modo() === 'jornada' ? p.minutosJugados + "'" : jorn(p) + ' jorn.' }}
                </span>
              </span>
              <span class="hechos">
                @if (p.goles) { <b>{{ p.goles }} gol{{ p.goles === 1 ? '' : 'es' }}</b> }
                @if (p.golesPenalti) { <b>{{ p.golesPenalti }} pen.</b> }
                @if (p.asistencias) { <b>{{ p.asistencias }} asis.</b> }
                @if (p.estrellas) { <b class="est">{{ p.estrellas }} ★</b> }
                @if (p.imbatido && esCero(p.jugador.posicion)) { <b>{{ p.imbatido }} a cero</b> }
                @if (p.tarjetasRojas) { <b class="roja">roja</b> } @else if (p.tarjetasAmarillas) { <b class="amar">amarilla</b> }
              </span>
              <span class="barra-p"><span class="rel" [style.width]="ancho(p)"></span></span>
              <span class="pts num" [class.neg]="p.puntosTotales < 0">{{ p.puntosTotales }}</span>
            </button>
          }
        }
      </section>

      <falm-paginas [l]="l" unidad="jugadores" />
    }
  `,
  styles: [`
    .phead { margin-bottom: 16px; }
    .phead .sub { margin: 5px 0 0; color: var(--text2); font-size: var(--t-sm); }

    /* Elegir vista es el mismo control que en Clasificacion y en Partidos, y
       eran dos rectangulos a todo el ancho contra dos pildoras. */
    .modos { margin-bottom: 12px; }

    /* Las sombras de los lados salen de .tira-x, igual que en Partidos. */
    .jchips { display: flex; gap: 6px; padding-bottom: 6px; margin-bottom: 12px; }
    .jchips button { flex: 0 0 auto; min-width: 44px; padding: 8px 10px; border: 1px solid var(--line);
      background: var(--surface); color: var(--text2); border-radius: var(--r-xs); cursor: pointer;
      /* J1, J2x2: es una etiqueta, no una cifra. La mono es solo para
         numeros y aqui cantaba al lado del resto de pildoras. */
      font-family: var(--fb); font-weight: 700; font-size: var(--t-sm); }
    .jchips button.on { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
    /* Las de antes de empezar la liga: se pueden mirar, pero no cuentan. */
    .jchips button.fuera { color: var(--text2); border-style: dashed; }
    .jchips button.fuera.on { color: var(--accent-ink); border-style: solid; }
    /* De que jornadas se habla: el numero es el de LaLiga, no el de la liga, y
       sin decirlo J6 se lee como nuestra jornada 6. */
    .leyj { margin: -6px 0 14px; font-size: var(--t-xs); line-height: 1.5; color: var(--text2); }
    .leyj b { color: var(--text); }

    /* La caja, la barra y las filas salen de styles.css. */
    .barra .lb { font-size: var(--t-xs); font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--text2); }
    .barra .buscar { margin-left: auto; flex: 0 1 250px; padding: 7px 13px; font-size: var(--t-sm); border-radius: var(--pill); }

    .fila { grid-template-columns: 28px 42px minmax(0, 1.5fr) minmax(0, 1fr) 90px 52px;
      gap: 12px; padding: 9px 18px; }
    .rk { text-align: center; color: var(--text2); font-size: var(--t-sm); }

    .av { position: relative; width: 42px; height: 42px; border-radius: var(--r-xs); overflow: hidden;
      background: var(--surface2); border: 1px solid var(--line);
      display: flex; align-items: flex-end; justify-content: center; }
    .av .wm { position: absolute; width: 118%; left: 50%; top: 50%; transform: translate(-50%,-50%); opacity: .16; object-fit: contain; }
    .av .pl { position: relative; z-index: 1; height: 100%; width: 100%; object-fit: contain; }
    .av .ini { position: relative; z-index: 1; font-family: var(--fb); font-weight: 700; font-size: var(--t-md); padding-bottom: 6px; color: var(--text2); }

    .who { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .nm { font-weight: 700; font-size: var(--t-md); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .meta { display: flex; align-items: center; gap: 6px; color: var(--text2); font-size: var(--t-xs);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .meta .pos { min-width: 30px; padding: 2px 5px; font-size: var(--t-xs); }

    /* Los hechos del partido, escritos: se leen mejor que una fila de iconos. */
    .hechos { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: var(--t-xs); color: var(--text2); min-width: 0; }
    .hechos b { font-weight: 600; }
    .hechos .est { color: var(--por); }
    .hechos .amar { color: var(--por); } .hechos .roja { color: var(--bad); }

    /* La barra da la escala de un vistazo: el líder ocupa el ancho entero. */
    .barra-p { height: 8px; border-radius: var(--pill); background: var(--surface2); overflow: hidden; }
    /* En la cabecera esa celda solo guarda el hueco de la columna. */
    .fila.cab .barra-p { height: auto; background: none; }
    .barra-p .rel { display: block; height: 100%; background: var(--accent); }

    .pts { text-align: right; font-size: var(--t-lg); font-weight: 700; }
    .pts.neg { color: var(--bad); }
    .vacio { padding: 22px 18px; margin: 0; font-size: var(--t-sm); }

    .muted { color: var(--text2); } .err { color: var(--bad); }

    @media (max-width: 900px) { .fila { grid-template-columns: 28px 42px 1fr 90px 52px; } .hechos { display: none; } }
    @media (max-width: 620px) {
      .fila { grid-template-columns: 24px 38px 1fr 48px; gap: 10px; padding: 9px 13px; }
      .barra-p { display: none; }
      .barra .buscar { flex: 1 1 100%; margin-left: 0; }
      .av { width: 38px; height: 38px; }
      .pts { font-size: var(--t-md); }
    }
  `],
})
export class PuntuacionesComponent implements OnInit {
  jornadas = signal<JornadaLfp[]>([]);
  /** Si en la tira asoma alguna jornada de LaLiga anterior a que empezara la liga. */
  hayDeFuera = computed(() => this.jornadas().some((j) => !j.falm));
  sel = signal<number>(0);
  modo = signal<'jornada' | 'acumulada'>('acumulada');
  jugadores = signal<PuntosJugador[]>([]);
  texto = signal('');
  cargando = signal(true);
  error = signal('');

  /** Lo que pasa el buscador; el orden y la página los lleva la lista. */
  filtrados = computed(() => {
    const f = this.texto().trim().toLowerCase();
    const arr = this.jugadores();
    return f ? arr.filter((p) => p.jugador.nombre.toLowerCase().includes(f) || (p.jugador.equipo || '').toLowerCase().includes(f)) : arr;
  });

  l = crearLista(() => this.filtrados(), {
    valor: (p, c) => c === 'nombre' ? p.jugador.nombre
      : c === 'goles' ? Number(p.goles ?? 0) + Number(p.golesPenalti ?? 0)
      : Number(p.puntosTotales ?? 0),
    campo: 'pts', dir: 'desc',
    inicial: { nombre: 'asc', goles: 'desc', pts: 'desc' },
    desempate: (a, b) => a.jugador.nombre.localeCompare(b.jugador.nombre, 'es'),
  });

  /** Tope de la escala de barras: el más puntuado de todo lo filtrado, no de
   *  la página, para que la barra siga significando lo mismo al pasar hoja. */
  tope = computed(() => Math.max(1, ...this.filtrados().map((p) => Number(p.puntosTotales) || 0)));

  subtitulo = computed(() => {
    const n = this.jugadores().length;
    if (this.modo() === 'jornada') {
      const j = this.jornadas().find((x) => x.numero === this.sel());
      return `${j?.descripcion ?? 'LaLiga ' + this.sel()} · ${n} jugadores con puntos.`;
    }
    const js = this.jornadas().length;
    return js ? `Acumulado de ${js} ${js === 1 ? 'jornada' : 'jornadas'} · ${n} jugadores.` : `Acumulado de la temporada · ${n} jugadores.`;
  });

  constructor(private falm: FalmService, public ficha: FichaService) {}
  abr(p: string) { return ABR[p] ?? 'MED'; }
  esCero(pos: string) { const a = this.abr(pos); return a === 'POR' || a === 'DEF'; }
  ancho(p: PuntosJugador) {
    const v = Math.max(0, Number(p.puntosTotales) || 0);
    return Math.round((v / this.tope()) * 100) + '%';
  }
  abrirFicha(p: PuntosJugador) {
    this.ficha.open({ ...p.jugador, tot: {
      puntos: Number(p.puntosTotales ?? 0),
      goles: Number(p.goles ?? 0) + Number(p.golesPenalti ?? 0),
      asis: Number(p.asistencias ?? 0),
      estrellas: Number(p.estrellas ?? 0),
      imbatidos: this.esCero(p.jugador.posicion) ? Number(p.imbatido ?? 0) : 0,
      jugadas: Number((p as any).jornadas ?? 0),
    } });
  }
  jorn(p: any) { return p.jornadas ?? 0; }

  async ngOnInit() {
    try {
      this.jornadas.set(await this.falm.jornadasLfp());
      await this.cargarAcumulada(); // por defecto: acumulada
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error'); this.cargando.set(false);
    }
  }

  async setModo(m: 'jornada' | 'acumulada') {
    if (m === this.modo()) return;
    this.modo.set(m); this.l.reset(); this.error.set('');
    if (m === 'acumulada') await this.cargarAcumulada();
    else await this.elegir(this.sel() || this.jornadas()[0]?.numero || 0);
  }

  private async cargarAcumulada() {
    this.cargando.set(true);
    try { this.jugadores.set(await this.falm.puntuacionesAcumuladas()); }
    catch (e: any) { this.error.set(e?.message ?? 'Error cargando acumulada'); }
    finally { this.cargando.set(false); }
  }

  async elegir(n: number) {
    this.modo.set('jornada');
    this.sel.set(n); this.cargando.set(true); this.error.set(''); this.l.reset();
    try { this.jugadores.set(await this.falm.puntuacionesJornada(n)); }
    catch (e: any) { this.error.set(e?.message ?? 'Error cargando la jornada'); }
    finally { this.cargando.set(false); }
  }
}
