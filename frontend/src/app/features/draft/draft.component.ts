import { Component, HostListener, OnDestroy, OnInit, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivoLibre } from '../../core/falm.service';
import { DraftService, MIN_PORTERIAS, PickDetalle } from './draft.service';

const POS = ['PORTERO', 'DEFENSA', 'MEDIO', 'DELANTERO'];
const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/**
 * Tablero del draft en vivo. El catálogo se carga entero una vez y se filtra en
 * cliente, para que buscar no dependa de la red justo cuando te toca elegir.
 */
@Component({
  selector: 'app-draft',
  standalone: true,
  imports: [FormsModule],
  providers: [DraftService],
  template: `
    <header class="phead">
      <div>
        <h1>Draft</h1>
        <p class="sub">El turno no avanza hasta que elige el equipo que lo tiene.</p>
      </div>
      <!-- Para el televisor del salón. En pestaña aparte a propósito: esta se
           queda con el buscador, que es desde donde se ficha. -->
      <a class="tv" href="/tablero" target="_blank" rel="noopener"
         title="El draft entero en una pantalla, para proyectar"><span class="lg">Abrir tablero</span><span class="sm">Tablero</span> ↗</a>
    </header>

    @if (d.cargando()) {
      <p class="muted">Cargando draft…</p>
    } @else if (d.error()) {
      <p class="err">{{ d.error() }}</p>
    } @else if (!d.draft()) {
      <p class="muted">No hay ningún draft activo. Se crea desde Admin · Pretemporada.</p>
    } @else if (!d.miEquipoId()) {
      <p class="muted">
        Tu usuario no tiene ningún equipo asignado en esta temporada.
        Habla con el administrador de la liga.
      </p>
    } @else if (terminado()) {
      <!-- Lo que eligió cada uno, en el orden en que lo eligió. La gracia del
           draft se ve después: quién se llevó a quién y en qué ronda. -->
      <section class="tabla">
        <div class="barra">
          <span class="lb">Cómo quedó el reparto</span>
          <span class="muted mini">
            {{ d.detalle().length }} elecciones · {{ d.draft()!.total_rondas }} rondas
          </span>
        </div>
        <div class="equipos">
          @for (e of reparto(); track e.id) {
            <div class="eqc" [class.mio]="e.id === d.miEquipoId()">
              <h4>{{ e.nombre }}</h4>
              <ol>
                @for (p of e.picks; track p.activo_id) {
                  <li>
                    <span class="rd num">{{ p.ronda }}</span>
                    <span class="pos" [class]="abr(p.posicion)">{{ abr(p.posicion) }}</span>
                    <span class="nom">{{ p.nombre }}</span>
                    @if (p.escudo) { <img [src]="p.escudo" alt="" loading="lazy" /> }
                  </li>
                }
              </ol>
            </div>
          }
        </div>
      </section>

      <!-- El respaldo que uno se guarda: las diez plantillas en un fichero,
           fuera de la aplicación y de la base de datos. -->
      <section class="tabla export">
        <div class="barra">
          <span class="lb">Guardar el resultado</span>
          <span class="muted mini">Las {{ d.equipos().length }} plantillas, para tenerlas fuera de aquí</span>
          <button class="btn-sec" (click)="descargar('md')">Markdown</button>
          <button class="btn-sec" (click)="descargar('csv')">CSV</button>
        </div>
      </section>
    } @else {
      <!-- La tira de turno se queda pegada arriba: es el dato que se mira sin parar. -->
      <div class="tira" [class.mio]="d.esMiTurno()">
        <span class="lb">{{ d.esMiTurno() ? 'Es tu turno' : 'Turno' }}</span>
        <strong>{{ nombreEquipo(d.turno()?.equipo_falm_id) }}</strong>
        <span class="ronda">Ronda <b class="num">{{ d.turno()?.ronda ?? '—' }}</b></span>
        @if (!d.conectado()) { <span class="chip chip-warn">Reconectando…</span> }
      </div>

      <div class="kpis">
        <div class="kpi">
          <span class="lb">Tu plantilla</span>
          <span class="v num">{{ d.misPicks().length }}<small>/{{ d.draft()!.total_rondas }}</small></span>
        </div>
        <div class="kpi">
          <span class="lb">Porterías</span>
          <span class="v num" [class.falta]="d.misPorterias() < minPorterias">
            {{ d.misPorterias() }}<small>/{{ minPorterias }}</small>
          </span>
        </div>
        <div class="kpi">
          <span class="lb">Pick</span>
          <!-- El pick que toca ahora, no los hechos. Sin turno ya no toca
               ninguno: sumar uno daba el 231 de 230. -->
          <span class="v num">
            {{ d.turno() ? d.draft()!.picks_hechos + 1 : d.draft()!.picks_hechos }}<small>/{{ d.draft()!.picks_totales }}</small>
          </span>
        </div>
        <div class="kpi">
          <span class="lb">Te toca en</span>
          <span class="v num">
            @if (d.esMiTurno()) { ya } @else if (d.picksHastaMiTurno() > 0) {
              {{ d.picksHastaMiTurno() }}
            } @else { — }
          </span>
        </div>
      </div>

      @if (d.debeElegirPorteria()) {
        <p class="nota">
          Te quedan {{ d.misTurnosRestantes() }} turnos y te faltan
          {{ minPorterias - d.misPorterias() }} porterías: solo puedes elegir portería.
        </p>
      }
      @if (msg()) { <p class="nota mal" (click)="msg.set('')">{{ msg() }}</p> }

      <div class="cols">
        <section class="tabla cat">
          <div class="barra">
            <span class="lb">Fichables</span>
            <button [class.on]="!posFiltro()" (click)="posFiltro.set(''); limite.set(30)">Todos</button>
            @for (p of pos; track p) {
              <button class="pos-f" [class]="abr(p)" [class.on]="posFiltro() === p"
                      (click)="togglePos(p)">{{ abr(p) }}</button>
            }
            <button [class.on]="soloCola()" (click)="soloCola.set(!soloCola())">★ Mi cola</button>
            <button [class.on]="!soloLibres()" [disabled]="d.picks().length === 0"
                    [title]="d.picks().length === 0 ? 'Todavía no ha fichado nadie en este draft' : ''"
                    (click)="soloLibres.set(!soloLibres())">
              Ver fichados ({{ d.picks().length }})
            </button>
            <select class="club-f" [ngModel]="clubFiltro()"
                    (ngModelChange)="clubFiltro.set($event); limite.set(30)">
              <option value="">Todos los clubes</option>
              @for (c of clubes(); track c.nombre) {
                <option [value]="c.nombre">{{ c.nombre }} ({{ c.libres }})</option>
              }
            </select>
            <input class="buscar" type="search" placeholder="Buscar jugador o club…"
                   [ngModel]="texto()" (ngModelChange)="texto.set($event); limite.set(30)" />
          </div>

          <div class="fila cab">
            <span title="Marca a quien quieras vigilar: si otro se te adelanta, lo verás tacharse al instante">★</span>
            <span>Pos</span><span>Jugador</span>
            <span class="club"><span class="cl-txt">Club</span></span>
            <span class="der" title="Máximo 2 jugadores del Madrid, Barcelona o Atlético, y 3 de cualquier otro club">Cupo</span>
            <span></span>
          </div>

          @if (visibles().length === 0) {
            <p class="vacio muted">No hay jugadores para ese filtro.</p>
          } @else {
            @for (a of visibles().slice(0, limite()); track a.activo_id) {
              <div class="fila" [class.tomado]="!!tomado(a)">
                <button class="estrella" [class.on]="enCola(a)" (click)="alternarCola(a)"
                        [attr.aria-label]="enCola(a) ? 'Quitar de mi cola' : 'Añadir a mi cola'">
                  {{ enCola(a) ? '★' : '☆' }}
                </button>
                <span class="pos" [class]="abr(a.posicion)">{{ abr(a.posicion) }}</span>
                <span class="nom">
                  @if (a.foto) {
                    <img class="ret" [src]="a.foto" alt="" loading="lazy" />
                  } @else if (a.escudo) {
                    <img class="ret esc" [src]="a.escudo" alt="" loading="lazy" />
                  } @else {
                    <span class="ret sin">{{ a.nombre.charAt(0) }}</span>
                  }
                  {{ a.nombre }}
                </span>
                <span class="club">
                  @if (a.escudo) { <img [src]="a.escudo" alt="" loading="lazy" /> }
                  <span class="cl-txt">{{ a.club }}</span>
                </span>
                <span class="der num cupo" [class.lleno]="clubLleno(a)"
                      [title]="'Máximo ' + (a.limite_club ?? 3) + ' de ' + a.club">
                  {{ cupoUsado(a) }}/{{ a.limite_club ?? 3 }}
                </span>
                @if (tomado(a)) {
                  <span class="chip">{{ nombreEquipo(tomado(a)) }}</span>
                } @else {
                  <button class="btn" [disabled]="!puedeFichar(a)" (click)="fichar(a)">Fichar</button>
                }
              </div>
            }
          }
        </section>

        <aside class="lat">
          <section class="card">
            <h3>Mi cola</h3>
            <label class="prepick">
              <input type="checkbox" [ngModel]="prePick()" (ngModelChange)="prePick.set($event)" />
              Pre-pick: fichar solo al llegar mi turno
            </label>
            @if (colaVisible().length === 0) {
              <p class="muted mini">Marca jugadores con ★ para tenerlos aquí.</p>
            } @else {
              <p class="muted mini">
                <b class="num">{{ colaFichados() }}</b> de tus <b class="num">{{ d.cola().length }}</b> ya fichados
              </p>
              <ol class="cola">
                @for (a of colaVisible(); track a.activo_id; let i = $index) {
                  <li [class.tomado]="!!tomado(a)">
                    <span class="p num">{{ i + 1 }}</span>
                    <span class="pos" [class]="abr(a.posicion)">{{ abr(a.posicion) }}</span>
                    <span class="nom">{{ a.nombre }}</span>
                    <button class="mv" (click)="d.moverCola(a.activo_id, -1)" aria-label="Subir">↑</button>
                    <button class="mv" (click)="d.moverCola(a.activo_id, 1)" aria-label="Bajar">↓</button>
                    <!-- Sin esto no había forma de sacar de la cola a quien ya
                         han fichado: la estrella vive en la lista de fichables,
                         y de ahí desaparece en cuanto lo elige otro. -->
                    <button class="mv quitar" (click)="d.quitarCola(a.activo_id)"
                            [attr.aria-label]="'Quitar a ' + a.nombre + ' de mi cola'"
                            title="Quitar de mi cola">×</button>
                  </li>
                }
              </ol>
            }
          </section>

          <section class="card">
            <h3>Próximos turnos</h3>
            <ol class="orden">
              @for (o of proximosTurnos(); track o.orden_global; let i = $index) {
                <li [class.ahora]="i === 0" [class.yo]="o.equipo_falm_id === d.miEquipoId()">
                  <span class="p num">{{ i === 0 ? '▶' : i }}</span>
                  <span class="nom">{{ nombreEquipo(o.equipo_falm_id) }}</span>
                  <span class="r num">R{{ o.ronda }}</span>
                </li>
              }
            </ol>
          </section>
        </aside>
      </div>

      @if (d.soyGestor()) {
        <section class="tabla global">
          <div class="barra">
            <span class="lb">Vista general</span>
            <span class="muted"><b class="num">{{ d.draft()!.picks_hechos }}/{{ d.draft()!.picks_totales }}</b> picks</span>
            <button class="plegar" (click)="verGlobal.set(!verGlobal())">
              {{ verGlobal() ? 'Ocultar' : 'Mostrar' }}
            </button>
          </div>
          @if (verGlobal()) {
            <div class="fila cab gl">
              <span>Equipo</span><span class="der">Picks</span><span class="der">Port.</span>
              <span class="der">PT</span><span class="der">DF</span><span class="der">MC</span>
              <span class="der">DL</span><span>Último</span>
            </div>
            @for (e of resumenEquipos(); track e.id) {
              <div class="fila gl" [class.turno-de]="e.id === d.turno()?.equipo_falm_id"
                   [class.miequipo]="e.id === d.miEquipoId()">
                <span class="nom">{{ e.nombre }}</span>
                <span class="der num">{{ e.picks }}</span>
                <span class="der num" [class.falta]="e.porterias < minPorterias">{{ e.porterias }}</span>
                <span class="der num">{{ e.PT }}</span>
                <span class="der num">{{ e.DF }}</span>
                <span class="der num">{{ e.MC }}</span>
                <span class="der num">{{ e.DL }}</span>
                <span class="ult faint">{{ e.ultimo }}</span>
              </div>
            }
          }
        </section>

        <!-- Arreglar una elección suelta sin deshacer las de después. -->
        <section class="tabla global">
          <div class="barra">
            <span class="lb">Picks</span>
            <span class="muted mini">Corregir o anular una elección concreta</span>
            <button class="plegar" (click)="verPicks.set(!verPicks())">
              {{ verPicks() ? 'Ocultar' : 'Mostrar' }}
            </button>
          </div>
          @if (verPicks()) {
            @if (d.detalle().length === 0) {
              <p class="vacio muted">Todavía no ha elegido nadie.</p>
            } @else {
              <div class="fila cab pk">
                <span class="der">#</span><span>Equipo</span><span>Pos</span>
                <span>Jugador</span>
                <span class="club"><span class="cl-txt">Club</span></span><span></span>
              </div>
              @for (p of picksRecientes(); track p.id) {
                <div class="fila pk">
                  <span class="der num">{{ p.orden_seleccion }}</span>
                  <span class="nom eq">{{ nombreEquipo(p.equipo_falm_id) }}</span>
                  <span class="pos" [class]="abr(p.posicion)">{{ abr(p.posicion) }}</span>
                  <span class="nom">{{ p.nombre }}</span>
                  <span class="club">
                    @if (p.escudo) { <img [src]="p.escudo" alt="" loading="lazy" /> }
                    <span class="cl-txt">{{ p.club }}</span>
                  </span>
                  <span class="ops">
                    <button class="mini-btn" (click)="abrirCambio(p)">Cambiar</button>
                    <button class="mini-btn peligro" (click)="anulando.set(p)">Anular</button>
                  </span>
                </div>
              }
            }
          }
        </section>
      }

      @if (confirmando(); as c) {
        <div class="velo" (click)="confirmando.set(null)">
          <div class="dialogo rise" role="dialog" aria-modal="true"
               aria-labelledby="tit-fichar" (click)="$event.stopPropagation()">
            <span class="lb" id="tit-fichar">Confirmar fichaje</span>
            <div class="ficha">
              @if (c.foto) {
                <img class="cara" [src]="c.foto" alt="" />
              } @else if (c.escudo) {
                <img class="cara esc" [src]="c.escudo" alt="" />
              } @else {
                <span class="cara sin">{{ c.nombre.charAt(0) }}</span>
              }
              <div class="datos">
                <strong>{{ c.nombre }}</strong>
                <span class="meta">
                  <span class="pos" [class]="abr(c.posicion)">{{ abr(c.posicion) }}</span>
                  {{ c.club }}
                </span>
              </div>
            </div>
            <p class="aviso-mod">
              Se añade a tu plantilla y el turno pasa al siguiente equipo. Esto no se puede
              deshacer salvo por un administrador.
            </p>
            <div class="acciones">
              <button class="btn-sec" (click)="confirmando.set(null)">Cancelar</button>
              <button class="btn" [disabled]="fichando()" (click)="confirmarFichaje()">
                {{ fichando() ? 'Fichando…' : 'Fichar' }}
              </button>
            </div>
          </div>
        </div>
      }

      @if (corrigiendo(); as p) {
        <div class="velo" (click)="cerrarCambio()">
          <div class="dialogo ancho rise" role="dialog" aria-modal="true"
               aria-labelledby="tit-cambio" (click)="$event.stopPropagation()">
            <span class="lb" id="tit-cambio">Cambiar el pick {{ p.orden_seleccion }}</span>
            <p class="aviso-mod">
              {{ nombreEquipo(p.equipo_falm_id) }} eligió a <b>{{ p.nombre }}</b> en la ronda
              {{ p.ronda }}. Elige por quién lo cambias: el equipo y el turno se quedan como están.
            </p>
            <input class="buscar full" type="search" placeholder="Buscar jugador o club…"
                   [ngModel]="buscaCambio()" (ngModelChange)="buscaCambio.set($event)" />
            @if (msgCambio()) { <p class="nota mal">{{ msgCambio() }}</p> }
            <ul class="candidatos">
              @for (a of candidatosCambio(); track a.activo_id) {
                <li>
                  <span class="pos" [class]="abr(a.posicion)">{{ abr(a.posicion) }}</span>
                  <span class="nom">{{ a.nombre }}</span>
                  <span class="club">
                    @if (a.escudo) { <img [src]="a.escudo" alt="" loading="lazy" /> }
                    <span class="cl-txt">{{ a.club }}</span>
                  </span>
                  <button class="mini-btn" [disabled]="guardando()"
                          (click)="confirmarCambio(a)">Poner</button>
                </li>
              } @empty {
                <li class="muted mini">Ningún jugador libre para esa búsqueda.</li>
              }
            </ul>
            <div class="acciones">
              <button class="btn-sec" (click)="cerrarCambio()">Cerrar</button>
            </div>
          </div>
        </div>
      }

      @if (anulando(); as p) {
        <div class="velo" (click)="anulando.set(null)">
          <div class="dialogo rise" role="dialog" aria-modal="true"
               aria-labelledby="tit-anular" (click)="$event.stopPropagation()">
            <span class="lb" id="tit-anular">Anular el pick {{ p.orden_seleccion }}</span>
            <p class="aviso-mod">
              Se borra el fichaje de <b>{{ p.nombre }}</b> por
              {{ nombreEquipo(p.equipo_falm_id) }} y ese turno vuelve a quedar abierto.
              @if (p.orden_seleccion < ultimoPick()) {
                <br /><b>Cuidado:</b> no es el último, así que el turno retrocede hasta la
                ronda {{ p.ronda }} y {{ nombreEquipo(p.equipo_falm_id) }} tendrá que volver a
                elegir antes de que siga el resto.
              }
            </p>
            <div class="acciones">
              <button class="btn-sec" (click)="anulando.set(null)">Cancelar</button>
              <button class="btn" [disabled]="guardando()" (click)="confirmarAnular()">
                {{ guardando() ? 'Anulando…' : 'Anular' }}
              </button>
            </div>
          </div>
        </div>
      }

      <div class="pie">
        <span class="muted">
          <b class="num">{{ mostrados() }}</b> de <b class="num">{{ visibles().length }}</b> jugadores ·
          <b class="num">{{ d.draft()!.picks_hechos }}</b> fichados en total
        </span>
        @if (visibles().length > limite()) {
          <button class="btn-sec" (click)="limite.set(limite() + 30)">Ver 30 más</button>
        }
      </div>
    }
  `,
  styles: [`
    /* Cabecera y tira de turno centradas: es lo que todos miran a la vez. */
    /* El título va donde el de todas las demás pantallas: arriba a la izquierda,
       y la explicación en una sola línea: tres líneas empujaban el draft entero
       fuera de la pantalla. */
    .phead { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
    .phead .sub { max-width: none; }
    .tv { flex: 0 0 auto; padding: 8px 15px; border-radius: var(--pill);
      border: 1px solid var(--line); background: var(--surface); color: var(--text2);
      font-family: var(--fb); font-size: var(--t-sm); font-weight: 600; white-space: nowrap; }
    .tv:hover { color: var(--accent); border-color: var(--accent); }
    .tv .sm { display: none; }

    .tira { position: sticky; top: 0; z-index: 6; display: flex; align-items: center; gap: 12px;
      flex-wrap: wrap; justify-content: center; padding: 12px 18px; margin-bottom: 16px;
      background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); }
    .tira strong { font-family: var(--fh); font-weight: 600; font-size: var(--t-xl);
      line-height: 1; text-transform: uppercase; }
    .tira .ronda { font-size: var(--t-sm); color: var(--text2); font-family: var(--fb); }
    .tira .lb, .tira .chip { font-family: var(--fb); }
    .tira.mio { background: var(--accent-soft); border-color: var(--accent-line); }
    .tira.mio strong { color: var(--accent); }

    .kpis { justify-content: center; }
    .kpi .v.falta { color: var(--bad); }

    .nota { padding: 11px 16px; margin: 0 0 12px; font-size: var(--t-sm);
      border-radius: var(--r-sm); background: var(--surface); border: 1px solid var(--accent-line); }
    .nota.mal { border-color: var(--bad); color: var(--bad); cursor: pointer; }

    .cols { display: grid; grid-template-columns: 1fr 300px; gap: 16px; align-items: start; }

    .barra { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      padding: 13px 18px; border-bottom: 1px solid var(--line); }
    .barra .lb { margin-right: 2px; }
    .barra button { background: var(--surface); border: 1px solid var(--line); color: var(--text2);
      border-radius: var(--pill); padding: 6px 14px; cursor: pointer; font-weight: 600;
      font-size: var(--t-sm); font-family: var(--fb); }
    .barra button.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
    .barra button:disabled { opacity: .45; cursor: not-allowed; }
    .barra button.pos-f.on.POR { background: var(--por); border-color: var(--por); }
    .barra button.pos-f.on.DEF { background: var(--def); border-color: var(--def); }
    .barra button.pos-f.on.MED { background: var(--med); border-color: var(--med); }
    .barra button.pos-f.on.DEL { background: var(--del); border-color: var(--del); }
    /* Una columna por equipo mientras quepan; en el teléfono, una debajo de
       otra. Cada tarjeta lleva sus 23 en el orden en que las cantó. */
    .equipos { display: grid; grid-template-columns: repeat(auto-fill, minmax(258px, 1fr));
      gap: 12px; padding: 14px 16px 16px; }
    .eqc { border: 1px solid var(--line); border-radius: var(--r); padding: 12px 13px;
      background: var(--surface); min-width: 0; }
    .eqc.mio { border-color: var(--accent); }
    .eqc h4 { margin: 0 0 9px; font-family: var(--fb); font-size: var(--t-xs);
      font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--text2); }
    .eqc.mio h4 { color: var(--accent); }
    .eqc ol { list-style: none; margin: 0; padding: 0; }
    .eqc li { display: grid; grid-template-columns: 20px 34px 1fr 16px; gap: 7px;
      align-items: center; padding: 4px 0; font-size: var(--t-sm); }
    .eqc li + li { border-top: 1px solid var(--line); }
    .eqc .rd { color: var(--text2); font-size: var(--t-xs); text-align: right; }
    .eqc .nom { font-weight: 600; min-width: 0; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis; }
    .eqc img { width: 16px; height: 16px; object-fit: contain; }

    .export .barra { gap: 10px; }
    .export .barra .btn-sec { padding: 6px 14px; font-size: var(--t-sm); }
    .export .barra .btn-sec:first-of-type { margin-left: auto; }
    .barra .buscar { margin-left: auto; flex: 0 1 210px; padding: 7px 13px;
      font-size: var(--t-sm); border-radius: var(--pill); }

    .fila { display: grid; align-items: center; gap: 10px;
      grid-template-columns: 28px 46px 1.6fr 140px 66px 94px;
      padding: 8px 18px; border-bottom: 1px solid var(--line); font-size: var(--t-sm); }
    .fila:last-child { border-bottom: none; }
    .fila:not(.cab):hover { background: var(--surface2); }
    .fila.cab { padding: 11px 18px; }
    .fila.cab > span { font-size: var(--t-xs); font-weight: 700; letter-spacing: .16em;
      text-transform: uppercase; color: var(--text2); }
    .fila.tomado { color: var(--text2); }
    .fila.tomado .nom { text-decoration: line-through; font-weight: 600; }
    .fila.tomado .pos { opacity: .5; }
    .nom { font-weight: 700; min-width: 0; display: flex; align-items: center; gap: 9px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cola .nom, .orden .nom { display: block; text-overflow: ellipsis; }
    .ret { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex: 0 0 auto;
      background: var(--surface2); border: 1px solid var(--line); }
    .ret.esc { object-fit: contain; padding: 4px; background: var(--surface); }
    .ret.sin { display: flex; align-items: center; justify-content: center;
      font-size: var(--t-xs); color: var(--text2); font-weight: 700; }

    .club { display: flex; align-items: center; gap: 6px; color: var(--text2);
      font-size: var(--t-xs); letter-spacing: .06em; text-transform: uppercase;
      min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .club img { width: 16px; height: 16px; object-fit: contain; flex: 0 0 auto; }
    .cl-txt { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .cupo { color: var(--text2); font-size: var(--t-xs); }
    .cupo.lleno { color: var(--bad); font-weight: 700; }
    .fila .btn { padding: 6px 12px; font-size: var(--t-sm); }
    .fila .chip { justify-self: start; min-width: 0; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
    .estrella { background: none; border: none; padding: 0; cursor: pointer;
      font-size: var(--t-md); color: var(--text2); line-height: 1; }
    .estrella.on { color: var(--por); }
    .vacio { padding: 22px 18px; margin: 0; font-size: var(--t-sm); }

    .lat { display: flex; flex-direction: column; gap: 14px; }
    .lat .card { padding: 14px 16px; }
    .lat h3 { margin-bottom: 10px; }
    .mini { font-size: var(--t-xs); margin: 0; }
    .prepick { display: flex; gap: 7px; align-items: flex-start; margin-bottom: 10px;
      font-size: var(--t-xs); color: var(--text2); line-height: 1.35; cursor: pointer; }
    .prepick input { margin: 1px 0 0; }

    .cola, .orden { list-style: none; padding: 0; margin: 9px 0 0; }
    .cola li, .orden li { display: grid; align-items: center; gap: 8px;
      padding: 6px 7px; border-bottom: 1px solid var(--line); font-size: var(--t-sm);
      border-radius: var(--r-xs); }
    .cola li { grid-template-columns: 14px 34px 1fr 22px 22px 22px; }
    .orden li { grid-template-columns: 16px 1fr 30px; }
    .cola li:last-child, .orden li:last-child { border-bottom: none; }
    .cola li.tomado { color: var(--text2); }
    .cola li.tomado .nom { text-decoration: line-through; }
    .cola .p, .orden .p { color: var(--text2); font-size: var(--t-xs); }
    .cola .pos { font-size: 8.5px; padding: 2px 0; }
    .mv { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-xs);
      color: var(--text2); cursor: pointer; font-size: var(--t-xs); line-height: 1; padding: 3px 0; }
    .mv:hover { border-color: var(--accent); color: var(--accent); }
    .orden li.ahora { background: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent);
      border-bottom-color: transparent; }
    .orden li.ahora .nom { font-weight: 800; color: var(--accent); }
    .orden li.ahora .p { color: var(--accent); }

    .orden li.yo .nom { color: var(--accent); }
    .orden li.yo:not(.ahora) .nom { font-style: italic; }

    /* Diálogo de confirmación: centrado y usable con el pulgar en el móvil. */
    .velo { position: fixed; inset: 0; z-index: 50; background: rgba(22, 19, 15, .5);
      display: grid; place-items: center; padding: 18px; }
    .dialogo { width: 100%; max-width: 380px; background: var(--surface);
      border: 1px solid var(--line); border-radius: var(--r); padding: 18px;
      box-shadow: 0 18px 48px rgba(22, 19, 15, .22); }
    .dialogo .lb { display: block; margin-bottom: 12px; }
    .ficha { display: flex; align-items: center; gap: 13px; margin-bottom: 14px; }
    .cara { width: 54px; height: 54px; border-radius: 50%; object-fit: cover; flex: 0 0 auto;
      background: var(--surface2); border: 1px solid var(--line); }
    .cara.esc { object-fit: contain; padding: 8px; background: var(--surface); }
    .cara.sin { display: flex; align-items: center; justify-content: center;
      font-family: var(--fh); font-size: 22px; color: var(--text2); }
    .datos { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
    .datos strong { font-family: var(--fh); font-weight: 600; font-size: var(--t-lg);
      line-height: 1.1; text-transform: uppercase; }
    .datos .meta { display: flex; align-items: center; gap: 7px; font-size: var(--t-xs);
      color: var(--text2); text-transform: uppercase; letter-spacing: .06em; }
    .aviso-mod { margin: 0 0 16px; font-size: var(--t-xs); color: var(--text2); line-height: 1.45; }
    .acciones { display: flex; gap: 9px; }
    .acciones .btn, .acciones .btn-sec { flex: 1; padding: 12px; font-size: var(--t-sm); }
    @media (max-width: 480px) { .acciones { flex-direction: column-reverse; } }

    .global { margin-top: 16px; }
    .global .plegar { margin-left: auto; background: var(--surface); border: 1px solid var(--line);
      color: var(--text2); border-radius: var(--pill); padding: 5px 12px; cursor: pointer;
      font-size: var(--t-xs); font-weight: 700; font-family: var(--fb); }
    .fila.gl { grid-template-columns: 1.4fr 54px 54px 40px 40px 40px 40px 1.3fr; }
    .fila.gl .num.falta { color: var(--bad); font-weight: 700; }
    .fila.gl.turno-de { background: var(--accent-soft); }
    .fila.gl.turno-de .nom { color: var(--accent); }
    .fila.gl.miequipo .nom { text-decoration: underline; text-underline-offset: 3px; }
    .fila.gl .ult { font-size: var(--t-xs); white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis; }
    .orden .r { text-align: right; color: var(--text2); font-size: var(--t-xs); }

    /* Picks del admin: corregir o anular una elección suelta. */
    .fila.pk { grid-template-columns: 42px 1.1fr 46px 1.5fr 1fr 152px; }
    .fila.pk .eq { font-size: var(--t-xs); text-transform: uppercase; letter-spacing: .05em;
      color: var(--text2); }
    .ops { display: flex; gap: 6px; justify-content: flex-end; }
    .mini-btn { background: var(--surface); border: 1px solid var(--line); color: var(--text);
      border-radius: var(--pill); padding: 5px 11px; cursor: pointer; font-size: var(--t-xs);
      font-weight: 700; font-family: var(--fb); white-space: nowrap; }
    .mini-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .mini-btn:disabled { opacity: .45; cursor: default; }
    .mini-btn.peligro:hover { border-color: var(--bad); color: var(--bad); }

    .dialogo.ancho { max-width: 460px; }
    .buscar.full { width: 100%; margin-bottom: 12px; }
    .candidatos { list-style: none; margin: 0 0 14px; padding: 0; max-height: 46vh;
      overflow-y: auto; border: 1px solid var(--line); border-radius: var(--r); }
    .candidatos li { display: grid; grid-template-columns: 46px 1.4fr 1fr 62px; gap: 9px;
      align-items: center; padding: 8px 11px; border-bottom: 1px solid var(--line); }
    .candidatos li:last-child { border-bottom: 0; }
    .candidatos .club { font-size: var(--t-xs); color: var(--text2); white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis; }

    @media (max-width: 900px) {
      .cols { grid-template-columns: 1fr; }
      /* Solo el catálogo: la vista general y el resumen tienen otras columnas. */
      .cat .fila { grid-template-columns: 26px 40px 1.4fr 24px 56px 88px; padding: 8px 12px; }
      /* El club se queda en el escudo: el nombre no cabe y el escudo se lee igual. */
      .cl-txt { display: none; }
      .cat .fila .club, .fila.pk .club, .candidatos .club { justify-content: center; }
      .cat .fila .club img, .fila.pk .club img, .candidatos .club img {
        width: 18px; height: 18px; }
      /* Vista general: en el móvil se queda en equipo, picks y porterías. */
      .fila.gl { grid-template-columns: 1.6fr 52px 52px; }
      .fila.gl > :nth-child(n+4) { display: none; }
      /* Picks: turno, jugador, escudo y los dos botones; el equipo se cae. */
      .fila.pk { grid-template-columns: 34px 46px 1fr 24px 140px; }
      .fila.pk > :nth-child(2) { display: none; }
      .candidatos li { grid-template-columns: 46px 1fr 24px 62px; }
      /* En el móvil el enlace al tablero se queda en una palabra. */
      .tv { padding: 7px 12px; font-size: var(--t-xs); }
      .tv .lg { display: none; } .tv .sm { display: inline; }
      .barra { padding: 11px 12px; gap: 7px; }
      /* El rótulo se va: son 70px que le faltaban a los filtros para caber. */
      .barra .lb { display: none; }
      /* El club y la búsqueda se reparten la última línea en vez de una cada uno. */
      .barra .club-f, .barra .buscar { flex: 1 1 calc(50% - 4px); min-width: 0;
        margin-left: 0; height: 34px; padding: 0 12px; font-size: var(--t-sm);
        border-radius: var(--pill); }
      .tira { padding: 10px 12px; }
    }

    /* En un teléfono, el catálogo se queda con lo imprescindible: al nombre le
       quedaban 50px entre el cupo, la estrella y el botón de fichar. */
    @media (max-width: 620px) {
      .cat .fila { grid-template-columns: 24px 34px 1fr 22px 74px; gap: 8px; padding: 8px 10px; }
      .cat .fila > :nth-child(5) { display: none; }
      .cat .fila .ret { width: 28px; height: 28px; }
      .fila.pk { grid-template-columns: 28px 38px 1fr 22px 100px; gap: 8px; padding: 8px 10px; }
      .fila.pk .ops { gap: 5px; }
      .mini-btn { padding: 6px 8px; font-size: var(--t-xs); }
      .candidatos li { grid-template-columns: 40px 1fr 22px 58px; gap: 8px; }
      .cola li { grid-template-columns: 14px 30px 1fr 22px 22px 22px; gap: 5px; }
    }
  `],
})
export class DraftComponent implements OnInit, OnDestroy {
  pos = POS;
  minPorterias = MIN_PORTERIAS;
  texto = signal('');
  posFiltro = signal('');
  soloLibres = signal(true);
  clubFiltro = signal('');
  soloCola = signal(false);
  limite = signal(30);
  msg = signal('');

  /**
   * Del catálogo solo se pintan 30 filas de golpe: son 494 jugadores con foto y
   * escudo. El botón de "Ver 30 más" queda al final de esas 30 filas, que en un
   * teléfono son dos pantallas y media de recorrido, así que parecía que la
   * lista se acababa ahí. Ahora, al acercarse al final, entran solas.
   */
  @HostListener('window:scroll')
  alDesplazar() {
    if (this.visibles().length <= this.limite()) return;
    const e = document.documentElement;
    if (e.scrollHeight - e.scrollTop - e.clientHeight < 700) this.limite.update((n) => n + 30);
  }
  prePick = signal(false);
  verGlobal = signal(true);
  /** Jugador pendiente de confirmar. El confirm() nativo no se puede maquetar. */
  confirmando = signal<ActivoLibre | null>(null);
  fichando = signal(false);

  // Correcciones del admin sobre un pick concreto.
  verPicks = signal(false);
  corrigiendo = signal<PickDetalle | null>(null);
  anulando = signal<PickDetalle | null>(null);
  buscaCambio = signal('');
  msgCambio = signal('');
  guardando = signal(false);

  private eraMiTurno = false;
  private tituloBase = document.title;
  private parpadeo: ReturnType<typeof setInterval> | null = null;

  constructor(public d: DraftService) {
    // En una quedada estás hablando con la gente: el aviso es lo que evita el
    // "¿me toca a mí?" cada dos minutos.
    effect(() => {
      const mio = this.d.esMiTurno();
      if (mio && !this.eraMiTurno) {
        this.avisar();
        this.intentarPrePick();
      }
      if (!mio && this.eraMiTurno) this.pararAviso();
      this.eraMiTurno = mio;
    });
  }

  async ngOnInit() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    await this.d.cargar();
    this.d.suscribir();
    document.addEventListener('visibilitychange', this.alVolver);
    document.addEventListener('keydown', this.alEscape);
  }

  ngOnDestroy() {
    document.removeEventListener('visibilitychange', this.alVolver);
    document.removeEventListener('keydown', this.alEscape);
    this.pararAviso();
    this.d.desuscribir();
  }

  /** Al volver a la pestaña puede haber picks que no llegaron: reconciliar. */
  private alVolver = () => {
    if (!document.hidden) this.d.refrescarPicks();
  };

  private alEscape = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    this.confirmando.set(null);
    this.anulando.set(null);
    this.cerrarCambio();
  };

  private avisar() {
    try {
      const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gan = ctx.createGain();
      osc.connect(gan);
      gan.connect(ctx.destination);
      osc.frequency.value = 880;
      gan.gain.value = 0.15;
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // Sin audio (permisos del navegador, móvil en silencio): no pasa nada.
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('FALM — te toca', { body: 'Es tu turno en el draft.' });
    }

    let on = false;
    this.parpadeo = setInterval(() => {
      document.title = (on = !on) ? '¡TE TOCA! · Draft' : this.tituloBase;
    }, 1000);
  }

  private pararAviso() {
    if (this.parpadeo) {
      clearInterval(this.parpadeo);
      this.parpadeo = null;
    }
    document.title = this.tituloBase;
  }

  abr(p: string) { return ABR[p] ?? p; }
  togglePos(p: string) { this.posFiltro.set(this.posFiltro() === p ? '' : p); this.limite.set(30); }
  nombreEquipo(id?: string | null) { return id ? this.d.equipoPorId().get(id) ?? '—' : '—'; }
  tomado(a: ActivoLibre) { return this.d.tomadoPor().get(a.activo_id) ?? null; }
  enCola(a: ActivoLibre) { return this.d.cola().some((c) => c.activo_id === a.activo_id); }

  /**
   * Un gestor ficha por el equipo al que le toca: en la quedada presencial hay
   * quien dicta su elección en voz alta. El cupo de porterías solo se comprueba
   * en cliente para mi propio equipo; para el resto lo valida el servidor.
   */
  /** El equipo que se llevaría el pick: siempre el mío. */
  equipoObjetivo(): string | null {
    return this.d.miEquipoId();
  }

  /** Cuántos de ese club lleva ya el equipo que va a fichar. */
  cupoUsado(a: ActivoLibre): number {
    const eq = this.equipoObjetivo();
    if (!eq || !a.club_id) return 0;
    return this.d.cupoPorEquipo().get(eq)?.get(a.club_id) ?? 0;
  }

  clubLleno(a: ActivoLibre): boolean {
    return this.cupoUsado(a) >= (a.limite_club ?? 3);
  }

  /**
   * Cada uno ficha solo en su turno, admin incluido. Meter el pick de otro se
   * hace desde el panel de administración, para que nadie fiche por error en
   * nombre de un rival.
   */
  puedeFichar(a: ActivoLibre) {
    if (this.tomado(a) || !this.d.turno() || !this.d.esMiTurno()) return false;
    if (this.clubLleno(a)) return false;
    return !this.d.debeElegirPorteria() || a.tipo === 'DEFENSA';
  }

  /** Los clubes del catálogo, con cuántos les quedan sin fichar. */
  readonly clubes = computed(() => {
    const tom = this.d.tomadoPor();
    const m = new Map<string, number>();
    for (const a of this.d.catalogo()) {
      if (!a.club) continue;
      m.set(a.club, (m.get(a.club) ?? 0) + (tom.has(a.activo_id) ? 0 : 1));
    }
    return [...m.entries()].map(([nombre, libres]) => ({ nombre, libres }))
      .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
  });

  /** Cuántos se están pintando de verdad, para que el pie no prometa 494. */
  readonly mostrados = computed(() => Math.min(this.limite(), this.visibles().length));

  readonly visibles = computed(() => {
    const t = this.texto().trim().toLowerCase();
    const p = this.posFiltro();
    const soloL = this.soloLibres();
    const soloC = this.soloCola();
    const cola = new Set(this.d.cola().map((c) => c.activo_id));
    const tom = this.d.tomadoPor();
    const club = this.clubFiltro();
    return this.d.catalogo().filter((a) => {
      if (p && a.posicion !== p) return false;
      if (club && a.club !== club) return false;
      if (soloL && tom.has(a.activo_id)) return false;
      if (soloC && !cola.has(a.activo_id)) return false;
      if (t && !`${a.nombre} ${a.club}`.toLowerCase().includes(t)) return false;
      return true;
    });
  });

  readonly colaVisible = computed(() => {
    const cat = new Map(this.d.catalogo().map((a) => [a.activo_id, a]));
    return this.d.cola()
      .map((c) => cat.get(c.activo_id))
      .filter((a): a is ActivoLibre => !!a);
  });

  /**
   * Mi plantilla al terminar. Sale del detalle leído de la BD y no del catálogo,
   * porque al consolidar los jugadores salen de v_activo_libre.
   */
  /** Lo que se llevó cada equipo, por orden de ronda. */
  readonly reparto = computed(() => {
    const picks = this.d.detalle();
    return this.d.equipos()
      .map((e) => ({
        id: e.id,
        nombre: e.nombre,
        picks: picks.filter((p) => p.equipo_falm_id === e.id).sort((a, b) => a.ronda - b.ronda),
      }))
      .filter((e) => e.picks.length > 0)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  });

  readonly terminado = computed(() => {
    const e = this.d.draft()?.estado;
    return e === 'COMPLETADO' || e === 'CONSOLIDADO';
  });

  /**
   * El resultado del draft en un fichero, para guardarlo fuera de la aplicación.
   * Se compone aquí con lo que ya está en pantalla: no hace falta pedir nada.
   *
   * El CSV lleva BOM y separador de punto y coma porque el destino real es
   * abrirlo con Excel en español: sin eso, los acentos salen rotos y todo cae
   * en una sola columna.
   */
  descargar(tipo: 'csv' | 'md') {
    const filas = [...this.d.detalle()].sort((a, b) => a.orden_seleccion - b.orden_seleccion);
    if (filas.length === 0) return;
    const equipos = this.d.equipos();
    const hoy = new Date().toISOString().slice(0, 10);
    const nombre = (id: string) => this.nombreEquipo(id);

    let texto: string;
    if (tipo === 'csv') {
      const esc = (v: string | number) => {
        const s = String(v ?? '');
        return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      texto = '﻿' + ['Equipo;Ronda;Pick;Jugador;Posicion;Club']
        .concat(filas.map((p) => [
          esc(nombre(p.equipo_falm_id)), p.ronda, p.orden_seleccion,
          esc(p.nombre), esc(this.abr(p.posicion)), esc(p.club),
        ].join(';')))
        .join('\r\n');
    } else {
      const l: string[] = [`# Draft ${this.d.draft()?.nombre ?? ''} · ${hoy}`, ''];
      l.push(`${filas.length} elecciones · ${equipos.length} equipos`, '');
      for (const e of [...equipos].sort((a, b) => a.nombre.localeCompare(b.nombre))) {
        const suyos = filas.filter((p) => p.equipo_falm_id === e.id);
        l.push(`## ${e.nombre}`, '');
        l.push(`_${suyos.length} elecciones · ${suyos.filter((p) => p.es_porteria).length} porterías_`, '');
        l.push('| Ronda | Pos | Jugador | Club |', '| ---: | :--- | :--- | :--- |');
        for (const p of suyos) {
          l.push(`| ${p.ronda} | ${this.abr(p.posicion)} | ${p.nombre} | ${p.club} |`);
        }
        l.push('');
      }
      l.push('## Orden de elección', '');
      l.push('| Pick | Ronda | Equipo | Jugador |', '| ---: | ---: | :--- | :--- |');
      for (const p of filas) {
        l.push(`| ${p.orden_seleccion} | ${p.ronda} | ${nombre(p.equipo_falm_id)} | ${p.nombre} |`);
      }
      texto = l.join('\n');
    }

    const tipos = { csv: 'text/csv;charset=utf-8', md: 'text/markdown;charset=utf-8' };
    const url = URL.createObjectURL(new Blob([texto], { type: tipos[tipo] }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `draft-falm-${hoy}.${tipo}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Primer elemento de la cola que sigue libre y vale según el cupo de porterías. */
  candidatoPrePick(): ActivoLibre | null {
    const cat = new Map(this.d.catalogo().map((a) => [a.activo_id, a]));
    const tom = this.d.tomadoPor();
    const soloPorteria = this.d.debeElegirPorteria();
    for (const c of this.d.cola()) {
      const a = cat.get(c.activo_id);
      if (!a || tom.has(a.activo_id)) continue;
      if (soloPorteria && a.tipo !== 'DEFENSA') continue;
      if (this.clubLleno(a)) continue;   // el cupo del club también manda en el pre-pick
      return a;
    }
    return null;
  }

  /** Con pre-pick activo, ficha solo al llegar mi turno. Sin candidato, no hace nada. */
  private async intentarPrePick() {
    if (!this.prePick()) return;
    const a = this.candidatoPrePick();
    if (!a) {
      this.msg.set('Pre-pick activo, pero ningún jugador de tu cola sirve. Elige a mano.');
      return;
    }
    try {
      await this.d.fichar(a.activo_id);
      this.msg.set(`Pre-pick: fichado ${a.nombre}.`);
    } catch (e: any) {
      this.msg.set(e?.message ?? 'El pre-pick no pudo completarse.');
    }
  }

  readonly colaFichados = computed(() => {
    const tom = this.d.tomadoPor();
    return this.d.cola().filter((c) => tom.has(c.activo_id)).length;
  });

  /**
   * Estado de los diez equipos, en el orden del sorteo. Solo lo ve el admin:
   * durante la quedada hace falta una foto del conjunto, no solo tu plantilla.
   */
  readonly resumenEquipos = computed(() => {
    // El orden de la primera ronda es el del sorteo: seguir el draft por ahí.
    const orden = this.d.orden()
      .filter((o) => o.ronda === 1)
      .sort((a, b) => a.posicion_en_ronda - b.posicion_en_ronda)
      .map((o) => o.equipo_falm_id);

    return orden.map((id) => {
      const suyos = this.d.detalle().filter((p) => p.equipo_falm_id === id);
      const cuenta = (pos: string) =>
        suyos.filter((p) => !p.es_porteria && this.abr(p.posicion) === pos).length;
      return {
        id,
        nombre: this.nombreEquipo(id),
        picks: suyos.length,
        porterias: suyos.filter((p) => p.es_porteria).length,
        PT: cuenta('POR'), DF: cuenta('DEF'), MC: cuenta('MED'), DL: cuenta('DEL'),
        ultimo: suyos.length ? suyos[suyos.length - 1].nombre : '—',
      };
    });
  });

  /** Los 12 próximos turnos, para el panel lateral. */
  readonly proximosTurnos = computed(() => this.d.orden().filter((o) => !o.completado).slice(0, 12));

  async alternarCola(a: ActivoLibre) {
    try {
      if (this.enCola(a)) await this.d.quitarCola(a.activo_id);
      else await this.d.agregarCola(a.activo_id);
    } catch (e: any) {
      this.msg.set(e?.message ?? 'No se pudo actualizar la cola.');
    }
  }

  fichar(a: ActivoLibre) {
    this.msg.set('');
    this.confirmando.set(a);
  }

  async confirmarFichaje() {
    const a = this.confirmando();
    if (!a || this.fichando()) return;
    this.fichando.set(true);
    try {
      await this.d.fichar(a.activo_id);
      this.confirmando.set(null);
    } catch (e: any) {
      this.confirmando.set(null);
      this.msg.set(e?.message ?? 'No se pudo fichar.');
    } finally {
      this.fichando.set(false);
    }
  }

  // --- Correcciones del admin -------------------------------------------------
  // En la quedada se dictan los nombres en voz alta y alguno se apunta mal. Esto
  // arregla un pick suelto sin tener que deshacer todos los posteriores.

  /** Lo último elegido, arriba: el error casi siempre es reciente. */
  readonly picksRecientes = computed(() => [...this.d.detalle()].reverse());

  /** Turno del último pick, para avisar cuando se anula uno del medio. */
  ultimoPick(): number {
    return this.d.detalle().at(-1)?.orden_seleccion ?? 0;
  }

  /** Jugadores libres que pueden ocupar el pick que se está corrigiendo. */
  readonly candidatosCambio = computed(() => {
    const t = this.buscaCambio().trim().toLowerCase();
    const tom = this.d.tomadoPor();
    return this.d.catalogo()
      .filter((a) => !tom.has(a.activo_id))
      .filter((a) => !t || `${a.nombre} ${a.club}`.toLowerCase().includes(t))
      .slice(0, 40);
  });

  abrirCambio(p: PickDetalle) {
    this.buscaCambio.set('');
    this.msgCambio.set('');
    this.corrigiendo.set(p);
  }

  cerrarCambio() {
    this.corrigiendo.set(null);
    this.msgCambio.set('');
  }

  async confirmarCambio(a: ActivoLibre) {
    const p = this.corrigiendo();
    if (!p || this.guardando()) return;
    this.guardando.set(true);
    this.msgCambio.set('');
    try {
      await this.d.corregirPick(p.id, a.activo_id);
      this.cerrarCambio();
      this.msg.set(`Pick ${p.orden_seleccion}: ${p.nombre} → ${a.nombre}.`);
    } catch (e: any) {
      // El error se queda dentro del diálogo: casi siempre es el tope por club
      // o las porterías, y hay que poder probar con otro sin volver a abrirlo.
      this.msgCambio.set(e?.message ?? 'No se pudo cambiar el pick.');
    } finally {
      this.guardando.set(false);
    }
  }

  async confirmarAnular() {
    const p = this.anulando();
    if (!p || this.guardando()) return;
    this.guardando.set(true);
    try {
      await this.d.anularPick(p.id);
      this.anulando.set(null);
      this.msg.set(`Anulado el pick ${p.orden_seleccion} (${p.nombre}): su turno vuelve a estar abierto.`);
    } catch (e: any) {
      this.anulando.set(null);
      this.msg.set(e?.message ?? 'No se pudo anular el pick.');
    } finally {
      this.guardando.set(false);
    }
  }
}
