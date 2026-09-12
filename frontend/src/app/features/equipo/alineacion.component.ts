import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Alineado, AlineacionGuardada, Competicion, ContextoActivo, Equipo, FalmService, FORMACIONES,
  ItemPlantilla, JornadaFalm, PartidoDeJornada,
} from '../../core/falm.service';
import { FutCardComponent } from '../../shared/fut-card.component';

const ETI: Record<string, string> = { PORTERO: 'Portero', DEFENSA: 'Defensa', MEDIO: 'Medio', DELANTERO: 'Delantero' };
const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };
const LINEAS = ['DEFENSA', 'MEDIO', 'DELANTERO'];

/** Once: campo por huecos de formación (toca el hueco → elige) + banquillo multi-línea. */
@Component({
  selector: 'app-alineacion',
  standalone: true,
  imports: [FormsModule, FutCardComponent],
  template: `
    @if (cargando()) {
      <p class="muted">Cargando…</p>
    } @else if (!equipo()) {
      <p class="muted">No tienes equipo en esta temporada.</p>
    } @else {
      <header class="phead">
        <h1>Alineación</h1>
      </header>

      @if (competiciones().length > 1) {
        <div class="comps">
          @for (c of competiciones(); track c.id) {
            <button class="comp" [class.on]="c.id === competicionId()" (click)="seleccionarCompeticion(c.id)">
              {{ etiqueta(c.tipo) }}
            </button>
          }
        </div>
      }

      <!-- Jornada: se abre en la que toca y se pasa de una en una. -->
      @if (jornada(); as j) {
        <div class="jnav">
          <button class="jb" (click)="irJornada(-1)" [disabled]="!jAnterior()">
            @if (jAnterior(); as a) { ‹ Jornada {{ a.numero }} } @else { ‹ }
          </button>
          <div class="jc">
            <h2 class="jt">Jornada {{ j.numero }}</h2>
            @if (j.fecha) { <span class="jf">{{ fechaCorta(j.fecha) }}</span> }
            @if (esDoble(j.id)) {
              <span class="jdoble" title="Cada equipo juega dos partidos y cada uno lleva su propio once">Jornada doble ×2</span>
            }
            @if (!esJornadaPorDefecto()) {
              <button class="jhoy" (click)="irAJornadaActual()">Ir a la actual</button>
            }
          </div>
          <button class="jb" (click)="irJornada(1)" [disabled]="!jSiguiente()">
            @if (jSiguiente(); as b) { Jornada {{ b.numero }} › } @else { › }
          </button>
        </div>
      }

      <!-- En una jornada doble se juega dos veces con dos onces distintos: aqui
           se elige cual se esta montando. En una normal no aparece. -->
      @if (partidosJornada().length > 1) {
        <div class="pdoble">
          <p class="pd-t">Esta jornada juegas dos partidos y puedes mandar <b>un once distinto para cada uno</b>.</p>
          <div class="pd-tabs">
            @for (p of partidosJornada(); track p.id) {
              <button class="pd" [class.on]="p.id === partidoSel()" (click)="elegirPartido(p.id)">
                <span class="pd-r">{{ p.es_local ? 'vs' : '@' }} {{ p.rival }}</span>
                <span class="pd-e">{{ estadoPartido(p) }}</span>
              </button>
            }
          </div>
          <!-- Solo cuando el otro ya tiene once propio: mientras no lo tenga,
               el envio normal lo manda a los dos y esto sobraria. -->
          @if (otroConOnce(); as otro) {
            <button class="pd-copia" (click)="copiarAlOtro()" [disabled]="guardando() || cerrada()">
              Enviar este mismo once también contra {{ otro.rival }}
            </button>
          }
        </div>
      }

      @if (!esLiga()) {
        <div class="atajos">
          <button class="atajo" (click)="copiarDeLiga()">Copiar de Liga</button>
        </div>
      }

      <!-- Lo primero que se mira al entrar: cuánto queda de plazo. Va contando solo, y
           cuando llega a cero la pantalla se bloquea sin tener que recargar. -->
      @if (jornada(); as j) {
        @if (j.fecha) {
          @if (cerrada()) {
            <p class="plazo fin">
              <b>Jornada cerrada.</b> El plazo terminó el {{ fechaCorta(j.fecha) }}.
              El once que tuvieras puesto es el que puntúa.
            </p>
          } @else {
            <p class="plazo" [class.ya]="apura()">
              <b>@if (apura()) { Última hora: } @else { Quedan }</b>
              {{ cuentaAtras() }} para mandar o cambiar el once · cierra el {{ fechaCorta(j.fecha) }}
            </p>
          }
        }
      }

      <!-- Lo que se ve puede ser el once ya mandado o una copia del anterior.
           Sin decirlo, parecía que ya estaba enviado y no lo estaba. -->
      @if (jornada()) {
        @if (enviada()) {
          <p class="estado ok">
            @if (rivalSel(); as r) { Once enviado para el partido contra {{ r }}. }
            @else { Once enviado para esta jornada. }
          </p>
        } @else if (copiadaDe() !== null) {
          <p class="estado borrador">
            <b>Sin enviar.</b>
            Copia del once de la jornada {{ copiadaDe() }}: revísala y dale a guardar.
          </p>
        } @else {
          <p class="estado borrador">
            <b>Todavía no has mandado once para esta jornada.</b>
            Móntalo, o usa «Repetir última» para partir del anterior.
          </p>
        }
      }
      @if (aviso()) { <p class="aviso">{{ aviso() }}</p> }

      <!-- Lo que uno querría saber antes de darle a guardar: a quién tienes
           puesto que no está para jugar. -->
      @if (tocados().length) {
        <p class="tocados">
          <b>Ojo:</b>
          @for (t of tocados(); track t.id) {
            <span class="tj">{{ t.nombre }} <b [class]="t.clase">{{ t.eti }}</b>@if (t.detalle) { <i>· {{ t.detalle }}</i> }</span>
          }
        </p>
      }

      <!-- CAMPO: huecos por formación. Cerrada la jornada se queda para mirarlo, pero
           inerte: ni se abre el selector ni se mueve nadie. -->
      <div class="zona" [class.bloqueada]="cerrada()" [attr.inert]="cerrada() ? '' : null">
        <div class="lado-campo">
          <div class="pitch" [style.--nl]="maxPorLinea()">
            <span class="lineas" aria-hidden="true"></span>
            <label class="fsel">
              <span class="lb">Formación</span>
              <select [ngModel]="formacion()" (ngModelChange)="cambiarFormacion($event)">
                @for (f of formaciones; track f) { <option [value]="f">{{ f }}</option> }
              </select>
            </label>
        @for (pos of ['PORTERO','DEFENSA','MEDIO','DELANTERO']; track pos) {
          <div class="fila" [attr.data-linea]="abr(pos)">
            @for (j of enLinea(pos); track j.activo_id) {
              <!-- Puesto en el once, el rival dejaba de verse: solo estaba en el
                   selector, y para consultarlo habia que abrirlo y cerrarlo. -->
              <button class="slot" (click)="abrirLinea(pos, j.activo_id)"
                      [title]="conQuienJuega(j.activo_id)">
                <!-- Sin cifra: aquí era el total de la temporada, y al lado del partido
                     de la jornada se leía como los puntos de esta. Está en Plantilla. -->
                <falm-fut-card [nombre]="j.nombre" [posicion]="j.posicion" [foto]="j.foto ?? null"
                  [escudo]="j.escudo ?? null" [campo]="true" />
              </button>
            }
            @for (h of huecos(pos); track h) {
              <button class="slot vacio" (click)="abrirLinea(pos)" [attr.data-pos]="abr(pos)">
                <span class="hueco">
                  <span class="mas">
                    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7 1h2v6h6v2H9v6H7V9H1V7h6z" /></svg>
                  </span>
                  <span class="col">
                    <span class="fig">
                      <svg viewBox="0 0 24 23" aria-hidden="true">
                        <path d="M9.1 1 3 4.2l1.7 4.6 2.1-.8V22h10.4V8l2.1.8L21 4.2 14.9 1a3 3 0 0 1-5.8 0z" />
                      </svg>
                      <span class="q">{{ iniciales() }}</span>
                    </span>
                    <span class="lb">{{ abr(pos) }}</span>
                  </span>
                </span>
              </button>
            }
          </div>
        }
          </div>
        </div>

        <!-- BANQUILLO: se compone por zonas, no en global. La pregunta que se
             hace uno es "si me falla un medio, ¿quién entra?". -->
        <div class="banco">
          <div class="bh">
            <h3>Banquillo</h3>
            <span class="bn">{{ banca().length }} suplente@if (banca().length !== 1) { s }</span>
          </div>

          @for (l of lineas; track l) {
            <div class="bloque">
              <div class="bt">
                <span class="btit">Si falla un {{ etiquetaPos(l).toLowerCase() }}</span>
                <button class="add" [class]="abr(l)" (click)="abrirBanca(l)"
                        [disabled]="cubren(l) >= 2"
                        [title]="cubren(l) >= 2 ? 'Ya tienes 2, el máximo por zona' : 'Añadir suplente para esta zona'">+ Añadir</button>
              </div>
              @if (colaDe(l); as cola) {
                @for (b of cola; track b.id; let i = $index) {
                  <div class="bfila" [title]="conQuienJuega(b.id)">
                    <span class="prio num">{{ i + 1 }}</span>
                    <span class="bav">
                      @if (fotoDe(b.id); as f) { <img [src]="f" alt="" loading="lazy" /> }
                      @else { <span class="bini">{{ nombreDe(b.id).charAt(0) }}</span> }
                    </span>
                    <span class="bnm">
                      {{ nombreDe(b.id) }}
                      <!-- Un delantero puede tapar el hueco de un medio, pero juega
                           de delantero: por eso se avisa de su posición real. -->
                      @if (posDe(b.id) !== l) { <b class="cpos" [class]="abr(posDe(b.id))">{{ abr(posDe(b.id)) }}</b> }
                    </span>
                    <button class="mv" (click)="subirEn(l, i)" [disabled]="i === 0" title="Que entre antes">▲</button>
                    <button class="mv" (click)="bajarEn(l, i)" [disabled]="i === cola.length - 1" title="Que entre después">▼</button>
                    <button class="rm" (click)="quitarLinea(b, l)" title="Quitar de esta zona">✕</button>
                  </div>
                }
              } @else {
                <p class="bnadie">Nadie lo cubre.</p>
              }
            </div>
          }

          <!-- Siempre a la vista: quién está en el banquillo y qué tapa cada uno.
               Estaba plegado y nadie lo abría, así que no se veía el reparto. -->
          @if (banca().length) {
            <div class="bloque otros">
              <span class="btit">Qué cubre cada uno</span>
              @for (b of banca(); track b.id) {
                <div class="bfila">
                  <span class="bnm">{{ nombreDe(b.id) }}</span>
                  <div class="chips">
                    @for (l of lineas; track l) {
                      <button class="ch" [class.on]="b.lineas.includes(l)" [class]="abr(l)"
                              (click)="toggleLinea(b, l)" [title]="'Cubre ' + etiquetaPos(l).toLowerCase()">{{ abr(l) }}</button>
                    }
                  </div>
                  <button class="rm" (click)="fueraId(b.id)" title="Sacar del banquillo">✕</button>
                </div>
              }
            </div>
          }
        </div>
      </div>

      <!-- Barra de envío: lo último de la pantalla y siempre a la vista. -->
      <div class="envio">
        @if (cerrada()) {
          <span class="est cerr">Jornada cerrada · el once ya no se puede cambiar</span>
        } @else {
          <span class="est" [class.ok]="titulares().length === 11">
            {{ titulares().length }} de 11 titulares@if (banca().length) { · {{ banca().length }} en el banquillo }
          </span>
          <button class="btn-sec" (click)="repetirUltima()">Repetir última</button>
          <button class="btn" (click)="guardar()" [disabled]="guardando()"
                  [title]="problema() ?? 'Enviar la alineación'">{{ guardando() ? 'Enviando…' : textoEnviar() }}</button>
        }
      </div>
    }

    <!-- SELECTOR (bottom sheet) -->
    @if (picker(); as p) {
      <div class="back" (click)="picker.set(null)">
        <div class="sheet rise" (click)="$event.stopPropagation()">
          <div class="sh">
            <span class="st">{{ tituloPicker(p) }}</span>
            @if (p.reemplazar) { <button class="quitar" (click)="quitarReemplazo()">Quitar</button> }
            <button class="x" (click)="picker.set(null)">✕</button>
          </div>
          <div class="cands">
            @for (j of candidatos(); track j.activo_id) {
              <button class="cand" [class.sel]="seleccionado(j)" (click)="elegir(j)">
                <span class="cav" [class]="abr(j.posicion)">
                  @if (j.foto) { <img [src]="j.foto" alt="" loading="lazy" (error)="j.foto=null" /> }
                  @else if (j.escudo) { <img class="esc" [src]="j.escudo" alt="" /> }
                  @else { {{ j.nombre.charAt(0) }} }
                </span>
                <span class="cw">
                  <span class="cn">
                    {{ j.nombre }}
                    <!-- La posición de cada uno, siempre: es lo primero que se
                         mira al elegir suplente. Quien no es de la zona que se
                         está cubriendo la lleva en sólido, porque entra en el
                         hueco pero juega y puntúa en la suya. -->
                    @if (posCand(j); as o) { <b class="cpos" [class]="o.eti" [class.suave]="!o.distinta">{{ o.eti }}</b> }
                    <!-- Solo avisa. Nadie te impide alinear a un tocado. -->
                    @if (parte(j.activo_id); as e) {
                      <b class="parte" [class]="e.clase" [title]="e.title">{{ e.eti }}</b>
                    }
                  </span>
                  <span class="cc">
                    @if (j.escudo) { <img [src]="j.escudo" alt="" loading="lazy" /> }
                    {{ j.club }}
                  </span>
                  <!-- Contra quién y dónde: en las dobles salen los dos partidos. -->
                  @for (p of partidos(j.activo_id); track $index) {
                    <span class="cvs">
                      @if (p.casa) {
                        <!-- Dibujada, no el carácter ⌂: según el teléfono salía
                             torcido, diminuto o directamente como un cuadro. -->
                        <svg class="casa" viewBox="0 0 24 24" role="img" aria-label="En casa">
                          <title>En casa</title>
                          <path d="M12 3.3 2.6 11.4h2.6V20h5.1v-5.2h3.4V20h5.1v-8.6h2.6z" />
                        </svg>
                      } @else {
                        <span class="dnd" title="Fuera">✈</span>
                      }
                      @if (p.escudo) { <img [src]="p.escudo" alt="" loading="lazy" /> }
                      <span class="cri">{{ p.rival }}</span>
                      <span class="cfe">{{ fechaCorta(p.fecha) }}</span>
                    </span>
                  }
                </span>
                <span class="ck">{{ seleccionado(j) ? '✓' : '' }}</span>
              </button>
            }
            @if (candidatos().length === 0) { <p class="muted sm" style="padding:14px">No hay jugadores disponibles para esta línea.</p> }
          </div>
          <button class="listo" (click)="picker.set(null)">Listo</button>
        </div>
      </div>
    }
  `,
  styles: [`
    .comps { display: flex; gap: 8px; margin-bottom: 12px; overflow-x: auto; padding-bottom: 4px; }
    .comp { flex: 0 0 auto; padding: 7px 16px; border-radius: var(--pill); border: 1px solid var(--line);
      background: var(--surface); color: var(--text2); cursor: pointer; font-family: var(--fb);
      font-weight: 600; font-size: var(--t-sm); white-space: nowrap; }
    .comp.on { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
    /* Navegador de jornada: la abierta en el centro, y a los lados la de
       antes y la de después, con su número, para saber a dónde vas. */
    .jnav { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
      gap: 12px; margin-bottom: 12px; }
    .jb { justify-self: end; padding: 9px 15px; border: 1px solid var(--line);
      background: var(--surface); color: var(--text2); border-radius: var(--pill); cursor: pointer;
      font-family: var(--fb); font-size: var(--t-sm); font-weight: 600; white-space: nowrap; }
    .jnav .jb:last-child { justify-self: start; }
    .jb:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .jb:disabled { opacity: .3; cursor: not-allowed; }
    /* Jornada y fecha en la misma línea: dos renglones ahí arriba le quitaban
       altura al campo, que es lo que se quiere ver. */
    .jc { display: flex; align-items: baseline; justify-content: center;
      gap: 10px; flex-wrap: wrap; text-align: center; }
    .jt { margin: 0; font-family: var(--fh); font-size: var(--t-xl); font-weight: 600;
      letter-spacing: -.01em; }
    .jf { font-size: var(--t-sm); color: var(--text2); text-transform: capitalize; }
    /* En una jornada doble se juegan dos partidos, cada uno con su once. */
    .jdoble { font-size: var(--t-xs); font-weight: 700; letter-spacing: .06em;
      color: var(--por); border: 1px solid color-mix(in oklab, var(--por) 34%, var(--line));
      border-radius: var(--pill); padding: 3px 9px; }
    .jhoy { background: none; border: none; cursor: pointer; padding: 0;
      font-family: var(--fb); font-size: var(--t-sm); color: var(--text2);
      text-decoration: underline; text-underline-offset: 3px; }
    .jhoy:hover { color: var(--accent); }

    /* El partido que se esta alineando, en jornada doble. Van los dos a la
       vista y cada uno dice como esta, que es lo unico que evita mandar uno y
       creerse que has mandado los dos. */
    .pdoble { margin-bottom: 14px; }
    .pd-t { margin: 0 0 8px; text-align: center; font-size: var(--t-sm); color: var(--text2); }
    .pd-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .pd { display: flex; flex-direction: column; align-items: center; gap: 2px;
      padding: 9px 10px; cursor: pointer; min-width: 0;
      background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-sm);
      font-family: var(--fb); color: var(--text2); }
    .pd:hover { border-color: var(--accent-line); }
    .pd.on { background: var(--accent-soft); border-color: var(--accent); color: var(--text); }
    .pd-r { font-weight: 700; font-size: var(--t-sm); min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
    .pd-e { font-size: var(--t-xs); color: var(--text2); }
    .pd.on .pd-e { color: var(--accent); }
    .pd-copia { display: block; width: 100%; margin-top: 8px; padding: 8px;
      background: none; border: 1px dashed var(--line); border-radius: var(--r-sm);
      cursor: pointer; font-family: var(--fb); font-size: var(--t-sm); color: var(--text2); }
    .pd-copia:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .pd-copia:disabled { opacity: .4; cursor: not-allowed; }

    .phead { margin-bottom: 14px; }
    .comps { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-bottom: 12px; }

    /* Se compone arriba y se envía abajo: la barra se queda pegada al fondo
       mientras editas, para no tener que subir a buscar el botón. */
    .envio { position: sticky; bottom: 0; z-index: 6;
      display: flex; align-items: center; justify-content: center; gap: 14px; flex-wrap: wrap;
      margin: 14px auto 0; max-width: 1120px; padding: 12px 16px;
      background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); }
    .envio .est { font-size: var(--t-sm); color: var(--bad); font-weight: 700; }
    .envio .est.ok { color: var(--good); }
    .envio .est.cerr { color: var(--text2); }
    /* Las dos acciones, juntas y de la misma altura: la de verdad en granate. */
    .envio .btn-sec, .envio .btn { padding: 11px 20px; font-size: var(--t-sm); }
    .envio .btn-sec { order: 2; }
    .envio .btn { order: 3; }

    @media (max-width: 620px) {
      .envio { gap: 8px; padding: 11px 13px; }
      .envio .est { flex: 1 1 100%; text-align: center; }
      .envio .btn-sec, .envio .btn { flex: 1 1 0; padding: 12px 10px; text-align: center; }
    }

    /* Formación y recuento de titulares, pegados al campo que gobiernan. */
    /* La formación se queda en el campo, en la esquina que nadie usa: se
       cambia mirando el once, y en el móvil no hay que ir hasta el pie. */
    .fsel { position: absolute; z-index: 2; top: 22px; left: 22px;
      display: flex; flex-direction: column; gap: 2px;
      background: var(--surface); border: 1px solid var(--line);
      border-radius: var(--r-xs); padding: 6px 8px; }
    .fsel select { padding: 2px 4px; border: none; background: none;
      font-size: var(--t-sm); font-weight: 700; }
    .fsel select:focus { outline: none; }

    .atajos { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .atajo { background: var(--surface); border: 1px solid var(--line); color: var(--text); border-radius: var(--r-xs);
      padding: 10px 15px; cursor: pointer; font-weight: 600; font-size: var(--t-sm); }
    .atajo:hover { border-color: var(--accent); }
    .aviso { background: var(--surface); border: 1px solid var(--accent); color: var(--accent);
      padding: 10px 15px; border-radius: var(--r-xs); margin-bottom: 12px; font-size: var(--t-sm); font-weight: 600; }

    /* El plazo. En la última hora se pone en rojo, que es cuando se mira de verdad. */
    .plazo { margin: 0 0 12px; padding: 9px 15px; border-radius: var(--r-xs);
      font-size: var(--t-sm); line-height: 1.5; color: var(--text);
      background: var(--surface2); border: 1px solid var(--accent-line); }
    .plazo b { color: var(--accent); }
    .plazo.ya { border-color: var(--bad); }
    .plazo.ya b { color: var(--bad); }
    .plazo.fin { border-color: var(--line); color: var(--text2); }
    .plazo.fin b { color: var(--text); }

    /* Cerrada la jornada, el campo se queda a la vista pero apagado. */
    .zona.bloqueada { opacity: .82; }

    /* Si el once está mandado o es solo un borrador copiado. */
    .estado { padding: 9px 15px; border-radius: var(--r-xs); margin: 0 0 12px;
      font-size: var(--t-sm); line-height: 1.5; border: 1px solid var(--line); }
    .estado.ok { color: var(--text2); background: var(--surface2); }
    .estado.borrador { color: var(--text); background: var(--surface2);
      border-color: var(--accent-line); }
    .estado.borrador b { color: var(--accent); }

    /* Campo de verdad: césped segado y líneas de cal dibujadas en CSS, sin
       imagen que cargar. La portería arriba, como se ha alineado siempre. */
    /* En pantalla ancha, el banquillo se pone al lado del campo en vez de
       obligar a bajar para verlo. */
    .zona { display: flex; align-items: flex-start; justify-content: center;
      gap: 18px; max-width: 1120px; margin: 0 auto; }
    .lado-campo { flex: 1 1 620px; min-width: 0; max-width: 760px; }

    .pitch { position: relative; overflow: hidden; max-width: 760px; margin: 0 auto;
      background: repeating-linear-gradient(180deg, #e3e9d8 0 52px, #dde4d0 52px 104px);
      border: 1px solid var(--line); border-radius: var(--r-sm);
      padding: 26px 14px; display: flex; flex-direction: column; gap: 6px;
      min-height: 660px; justify-content: space-between; }
    .lineas { position: absolute; inset: 14px; pointer-events: none; z-index: 0;
      border: 2px solid rgba(255,255,255,.8); border-radius: var(--r-2xs);
      background:
        linear-gradient(rgba(255,255,255,.8), rgba(255,255,255,.8)) center / 100% 2px no-repeat,
        radial-gradient(circle at 50% 50%, transparent 56px, rgba(255,255,255,.8) 56px,
                        rgba(255,255,255,.8) 58px, transparent 58px); }
    /* áreas grandes, arriba y abajo */
    .lineas::before, .lineas::after { content: ''; position: absolute; left: 50%;
      transform: translateX(-50%); width: 54%; height: 74px;
      border: 2px solid rgba(255,255,255,.8); }
    .lineas::before { top: -2px; border-top: none; border-radius: 0 0 var(--r-2xs) var(--r-2xs); }
    .lineas::after { bottom: -2px; border-bottom: none; border-radius: var(--r-2xs) var(--r-2xs) 0 0; }

    .fila { position: relative; z-index: 1; display: flex; justify-content: center;
      align-items: center; gap: 10px; flex-wrap: wrap; padding: 4px; }

    /* Todas las cartas miden lo mismo, se reparta como se reparta la formación:
       con "flex: 1 1 0" el portero y los dos delanteros se estiraban al máximo y
       salían un tercio más grandes que los cuatro medios. El ancho lo marca la
       línea más poblada de la formación puesta (--nl), así que ninguna se sale y
       se aprovecha el campo: en un 4-4-2 caben más anchas que en un 5-4-1. */
    .slot { background: none; border: none; cursor: pointer; padding: 0;
      flex: 0 0 auto; max-width: 136px;
      width: calc((100% - (var(--nl, 5) - 1) * 10px) / var(--nl, 5)); }
    /* La misma proporción que la carta (1/1.22): con una altura fija, el campo
       daba un salto al colocar a alguien. */
    .slot.vacio { aspect-ratio: 1 / 1.22; border-radius: var(--r-sm); display: flex;
      flex-direction: column; align-items: center; justify-content: center; gap: 6px;
      border: 1.5px dashed rgba(255,255,255,.9);
      background: rgba(255,255,255,.28); }
    .slot.vacio:hover { background: rgba(255,255,255,.5); }
    /* Un hueco se lee de un vistazo: el signo de añadir y la silueta de quien
       falta, con la posición debajo. */
    .hueco { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 0 10px; }
    .col { display: flex; flex-direction: column; align-items: center; gap: 1px; }
    /* La cruz va dibujada, no escrita: el glifo "+" nunca cae centrado en un
       círculo, le sobra hueco por debajo. */
    .slot.vacio .mas { display: flex; align-items: center; justify-content: center;
      width: 30px; height: 30px; border-radius: 50%; flex: 0 0 auto;
      background: var(--surface); border: 1px solid var(--line);
      transition: background .12s ease, border-color .12s ease; }
    .slot.vacio .mas svg { width: 12px; height: 12px; fill: var(--text2); }
    .slot.vacio:hover .mas { background: var(--accent); border-color: var(--accent); }
    .slot.vacio:hover .mas svg { fill: var(--accent-ink); }
    .fig { position: relative; display: flex; align-items: center; justify-content: center; }
    /* Una sola camiseta para todos los huecos: el color ya lo dice la etiqueta
       de debajo, y cuatro tonos en el campo eran ruido. */
    .fig svg { width: 46px; height: 44px; fill: var(--text2); opacity: .45; }
    .fig .q { position: absolute; top: 58%; left: 50%; transform: translate(-50%, -50%);
      font-family: var(--fb); font-size: var(--t-sm); font-weight: 700; letter-spacing: .02em;
      color: var(--surface); }
    /* El color de la posición vive aquí, en el hueco, no en franjas de fondo. */

    .slot.vacio .lb { font-family: var(--fb); font-size: var(--t-xs); font-weight: 700;
      letter-spacing: .08em; color: var(--text); }

    .banco { flex: 1 1 300px; min-width: 280px;
      background: var(--surface); border: 1px solid var(--line); border-radius: var(--r);
      padding: 16px; margin: 0; }
    .bh { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
    .bh .bn { font-size: var(--t-sm); color: var(--text2); }

    /* Un bloque por zona, y cada zona con su propio botón: se ficha suplente
       "para la defensa", no a un montón que luego hay que repartir. */
    .bloque { margin-bottom: 13px; }
    .bloque:last-child { margin-bottom: 0; }
    .bt { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
    /* Con el banquillo estrecho el rótulo cede antes que el botón: lo que hay
       que poder tocar siempre es el "+ Añadir". */
    .bt .btit { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .btit { display: block; font-size: var(--t-xs); font-weight: 700;
      letter-spacing: .1em; text-transform: uppercase; color: var(--text2); }
    .bnadie { margin: 0; font-size: var(--t-sm); color: var(--bad); }
    .bav { width: 26px; height: 26px; flex: 0 0 auto; border-radius: 50%; overflow: hidden;
      background: var(--surface); border: 1px solid var(--line);
      display: flex; align-items: center; justify-content: center; }
    .bav img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
    .bini { font-size: var(--t-xs); font-weight: 700; color: var(--text2); }
    /* El último bloque es el que reparte: quién está y qué zonas cubre. */
    .otros { margin-top: 14px; padding-top: 11px; border-top: 1px solid var(--line); }
    .otros .btit { margin-bottom: 4px; }
    .otros .bfila { background: transparent; border-color: transparent; padding: 5px 0; }
    .add { background: var(--surface); border: 1px solid var(--line); color: var(--text); border-radius: var(--pill);
      padding: 5px 12px; cursor: pointer; font-family: var(--fb); font-weight: 700; font-size: var(--t-xs);
      white-space: nowrap; }
    .add:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .add:disabled { opacity: .38; cursor: not-allowed; }
    .add.DEF:hover:not(:disabled) { border-color: var(--def); color: var(--def); }
    .add.MED:hover:not(:disabled) { border-color: var(--med); color: var(--med); }
    .add.DEL:hover:not(:disabled) { border-color: var(--del); color: var(--del); }
    .sm { font-size: var(--t-xs); } .faint { color: var(--text2); }
    .bfila { display: flex; align-items: center; gap: 8px; padding: 5px 9px; margin-top: 5px;
      background: var(--surface2); border: 1px solid var(--line); border-radius: var(--r-xs); }
    .prio { width: 20px; height: 20px; border-radius: 50%; background: var(--surface); border: 1px solid var(--line);
      display: flex; align-items: center; justify-content: center; font-family: var(--fm);
      font-weight: 700; font-size: var(--t-xs); flex: 0 0 auto; }
    .bnm { flex: 1; font-weight: 700; font-size: var(--t-sm); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    /* Cubre una zona que no es la suya: se dice cuál es la suya de verdad. */
    .cpos { display: inline-block; margin-left: 5px; padding: 1px 5px; border-radius: var(--r-2xs);
      font-family: var(--fb); font-size: var(--t-xs); font-weight: 700; letter-spacing: .04em;
      color: var(--accent-ink); vertical-align: 1px; }
    .cpos.POR { background: var(--por); } .cpos.DEF { background: var(--def); }
    .cpos.MED { background: var(--med); } .cpos.DEL { background: var(--del); }
    /* El que sí es de la zona que se está cubriendo la lleva en contorno: se
       ve la posición de todos, pero destaca el que va a jugar fuera de sitio. */
    .cpos.suave { background: none; border: 1px solid currentColor; padding: 0 4px; }
    .cpos.suave.POR { color: var(--por); } .cpos.suave.DEF { color: var(--def); }
    .cpos.suave.MED { color: var(--med); } .cpos.suave.DEL { color: var(--del); }
    .chips { display: flex; gap: 4px; }
    .ch { width: 28px; padding: 5px 0; border-radius: var(--r-2xs); border: 1px solid var(--line); background: transparent;
      color: var(--text2); font-weight: 700; font-size: var(--t-xs); cursor: pointer; }
    .ch.on.DEF { background: var(--def); color: var(--accent-ink); border-color: var(--def); }
    .ch.on.MED { background: var(--med); color: var(--accent-ink); border-color: var(--med); }
    .ch.on.DEL { background: var(--del); color: var(--accent-ink); border-color: var(--del); }
    .mv { width: 24px; padding: 3px 0; border: 1px solid var(--line); background: var(--surface); color: var(--text2);
      border-radius: var(--r-xs); cursor: pointer; font-size: var(--t-xs); }
    .mv:disabled { opacity: .3; }
    .rm { width: 24px; padding: 3px 0; border: 1px solid var(--line); background: var(--surface); color: var(--bad);
      border-radius: var(--r-xs); cursor: pointer; font-size: var(--t-xs); }

    /* bottom sheet selector */
    .back { position: fixed; inset: 0; z-index: 60; background: rgba(22,19,15,.42);
      display: flex; align-items: flex-end; justify-content: center; }
    .sheet { width: 100%; max-width: 520px; max-height: 82vh; display: flex; flex-direction: column;
      background: var(--surface); border: 1px solid var(--line);
      border-top: 3px solid var(--accent); border-radius: var(--r-lg) var(--r-lg) 0 0; padding: 16px; }
    @media (min-width: 621px) { .back { align-items: center; } .sheet { border-radius: var(--r-lg); } }

    /* En el teléfono el campo se estrecha para que la línea no se parta en dos. */
    /* Cuando el banquillo dejaría el campo demasiado estrecho, vuelve abajo. */
    @media (max-width: 1180px) {
      .zona { flex-direction: column; align-items: stretch; }
      .lado-campo, .banco { max-width: 760px; width: 100%; margin: 0 auto; }
    }

    @media (max-width: 760px) {
      .envio { bottom: calc(47px + env(safe-area-inset-bottom)); }
    }

    @media (max-width: 620px) {
      .pitch { padding: 14px 8px; min-height: 470px; gap: 8px; }
      .fila { gap: 6px; padding: 5px 2px 5px 18px; }
      .banda { width: 12px; font-size: var(--t-xs); letter-spacing: .14em; }
      .slot.vacio .mas { width: 28px; height: 28px; font-size: var(--t-md); }
      .slot.vacio .lb { font-size: var(--t-xs); }
      .formas { width: 100%; }
      .forma { flex: 1; padding: 10px 8px; }
      .atajo { flex: 1 1 auto; }
    }
    .sh { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .st { font-family: var(--fh); font-size: var(--t-md); font-weight: 600; text-transform: uppercase; }
    .quitar { background: transparent; border: 1px solid var(--bad); color: var(--bad);
      border-radius: var(--r-xs); padding: 6px 12px; cursor: pointer; font-family: var(--fb);
      font-weight: 600; font-size: var(--t-sm); margin-left: auto; margin-right: 8px; }
    .x { background: var(--surface2); border: 1px solid var(--line); color: var(--text2);
      width: 30px; height: 30px; border-radius: var(--r-xs); cursor: pointer; font-size: var(--t-sm); }
    .cands { overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
    .cand { display: grid; grid-template-columns: 40px 1fr 22px; align-items: center; gap: 10px; padding: 8px 10px;
      background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-xs); cursor: pointer; text-align: left; }
    .cand:hover { background: var(--surface2); }

    /* Contra quién juega y dónde, debajo del club. */
    /* El text-overflow de aqui no hacia nada: en un contenedor flex la elipsis
       no se aplica a los hijos, y el nombre del rival era un nodo de texto
       suelto. Se cortaba a hueso y "Real Madrid sab, 12 sept 21:00" perdia el
       ultimo digito de la hora. Ahora el que cede es el nombre, con puntos
       suspensivos, y la fecha se lee siempre entera. */
    .cvs { display: flex; align-items: center; gap: 5px; min-width: 0;
      font-size: var(--t-xs); color: var(--text2); white-space: nowrap;
      overflow: hidden; }
    .cvs .cri { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .cvs img { width: 13px; height: 13px; flex: 0 0 auto; object-fit: contain; }
    .cvs .dnd { font-size: var(--t-sm); line-height: 1; }
    .cvs .casa { width: 12px; height: 12px; flex: 0 0 auto; fill: currentColor;
      vertical-align: -1px; }
    .cvs .cfe { opacity: .75; flex: 0 0 auto; }

    .tocados { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px;
      margin: 0 0 14px; padding: 10px 14px; font-size: var(--t-sm);
      background: color-mix(in oklab, var(--bad) 7%, var(--surface));
      border: 1px solid color-mix(in oklab, var(--bad) 28%, var(--line));
      border-radius: var(--r); }
    .tocados .tj { display: inline-flex; align-items: center; gap: 5px; }
    .tocados .tj b { font-size: var(--t-xs); text-transform: uppercase; letter-spacing: .06em; }
    .tocados .tj b.lesionado, .tocados .tj b.sancionado { color: var(--bad); }
    .tocados .tj b.duda { color: var(--por); }
    .tocados .tj i { color: var(--text2); font-style: normal; }

    .cand.sel { border-color: var(--accent); background: var(--accent-soft); }
    .cav { width: 40px; height: 40px; border-radius: var(--r-xs); display: flex; align-items: center; justify-content: center;
      font-family: var(--fb); font-weight: 700; font-size: var(--t-md); color: var(--accent-ink); overflow: hidden; }
    .cav img { width: 100%; height: 100%; object-fit: cover; } .cav img.esc { object-fit: contain; padding: 5px; }
    .cav.POR { background: var(--por); } .cav.DEF { background: var(--def); }
    .cav.MED { background: var(--med); } .cav.DEL { background: var(--del); }
    .cw { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
    .cn { font-weight: 700; font-size: var(--t-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    /* De qué club es: decide tanto como el nombre a la hora de alinear. */
    .cc { display: flex; align-items: center; gap: 5px; min-width: 0;
      font-size: var(--t-xs); color: var(--text2); letter-spacing: .06em; text-transform: uppercase;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cc img { width: 14px; height: 14px; flex: 0 0 auto; object-fit: contain; }
    .ck { color: var(--accent); font-weight: 700; text-align: center; }
    .listo { margin-top: 12px; background: var(--accent); color: var(--accent-ink); border: none; border-radius: var(--r-xs);
      padding: 12px; cursor: pointer; font-family: var(--fb); font-weight: 700; font-size: var(--t-sm); }
    .muted { color: var(--text2); }
  `],
})
export class AlineacionComponent implements OnInit, OnDestroy {
  formaciones = FORMACIONES;
  lineas = LINEAS;
  formacion = signal('4-4-2');
  equipo = signal<Equipo | null>(null);
  competiciones = signal<Competicion[]>([]);
  competicionId = signal('');
  jornadasComp = signal<JornadaFalm[]>([]);
  /** Calendario de cada competición, ya consultado al arrancar. */
  private cacheJornadas = new Map<string, JornadaFalm[]>();
  jornada = signal<JornadaFalm | null>(null);

  /** Los partidos de ese activo en la jornada: dos si es doble. */
  partidos(activoId: string) {
    return this.ctx()[activoId]?.partidos ?? [];
  }

  /**
   * El aviso de estado, solo cuando hay algo que avisar: quien vuelve de una
   * lesión ya está disponible y no hace falta marcarlo.
   */
  parte(activoId: string): { eti: string; clase: string; title: string } | null {
    const c = this.ctx()[activoId];
    if (!c?.estado || c.estado === 'DISPONIBLE') return null;
    const eti = c.estado === 'SANCIONADO' ? 'Sancionado'
      : c.estado === 'DUDA' ? 'Duda' : 'Lesionado';
    return {
      eti,
      clase: c.estado.toLowerCase(),
      title: [c.detalle, c.vuelve].filter(Boolean).join(' · ') || eti,
    };
  }

  /** Titulares y suplentes que llegan tocados, para avisar antes de guardar. */
  readonly tocados = computed(() => {
    const ctx = this.ctx();
    const puestos = [...this.titulares(), ...this.banca().map((b) => b.id)];
    const vistos = new Set<string>();
    const out: { id: string; nombre: string; eti: string; clase: string; detalle: string }[] = [];
    for (const id of puestos) {
      if (vistos.has(id)) continue;
      vistos.add(id);
      const c = ctx[id];
      if (!c?.estado || c.estado === 'DISPONIBLE') continue;
      out.push({
        id,
        nombre: this.nombreDe(id),
        eti: c.estado === 'SANCIONADO' ? 'sancionado' : c.estado === 'DUDA' ? 'duda' : 'lesionado',
        clase: c.estado.toLowerCase(),
        detalle: c.detalle ?? '',
      });
    }
    return out;
  });


  /** Rival, casa o fuera, y estado físico de cada activo en esta jornada. */
  ctx = signal<Record<string, ContextoActivo>>({});
  /** ¿Hay alineación guardada para la jornada abierta? */
  /** Los partidos que juego esta jornada: uno de normal, dos si es doble. */
  partidosJornada = signal<PartidoDeJornada[]>([]);
  /** El partido cuyo once se esta montando. */
  partidoSel = signal<string | null>(null);
  /** Lo que hay guardado en cada partido, para saber si van iguales o no. */
  private guardadas = signal<Record<string, AlineacionGuardada | null>>({});
  /**
   * Lo que se lleva a medias en cada partido. Sin esto, cambiar de pestaña para
   * mirar el otro once se comia lo que llevaras tocado en este.
   */
  private borradores = new Map<string, { f: string; t: string[]; b: { id: string; lineas: string[] }[] }>();

  /** El otro partido de la jornada, si es doble. */
  otroPartido = computed<PartidoDeJornada | null>(() =>
    this.partidosJornada().find((p) => p.id !== this.partidoSel()) ?? null);
  /** Contra quien se esta alineando, solo cuando hay mas de un partido. */
  rivalSel = computed<string | null>(() => {
    const ps = this.partidosJornada();
    if (ps.length < 2) return null;
    return ps.find((p) => p.id === this.partidoSel())?.rival ?? null;
  });
  /** El otro partido, pero solo si ya tiene su propio once. */
  otroConOnce = computed<PartidoDeJornada | null>(() => {
    const otro = this.otroPartido();
    return otro && this.guardadas()[otro.id] ? otro : null;
  });
  /**
   * Lo que va a hacer el boton, dicho tal cual: mientras el otro partido no
   * tenga once, este envio vale para los dos.
   */
  textoEnviar = computed(() => {
    const r = this.rivalSel();
    if (!r) return 'Enviar alineación';
    return this.otroConOnce() ? `Enviar contra ${r}` : 'Enviar para los dos partidos';
  });

  /**
   * El once que hay puesto, resumido en una cadena: sirve para decir si lo que
   * se ve es exactamente lo guardado y si los dos partidos llevan lo mismo.
   */
  private firma(f: string, tit: string[], ban: { id: string; lineas: string[] }[]): string {
    return `${f}|${[...tit].sort().join(',')}|` +
      ban.map((b) => `${b.id}:${[...b.lineas].sort().join('/')}`).join(',');
  }
  private firmaDe(a: AlineacionGuardada | null | undefined): string {
    if (!a) return '';
    return this.firma(
      a.formacion || '4-4-2',
      a.jugadores.filter((j) => j.rol === 'TITULAR').map((j) => j.activo_id),
      a.jugadores.filter((j) => j.rol === 'SUPLENTE').sort((x, y) => x.orden - y.orden)
        .map((j) => ({ id: j.activo_id, lineas: j.lineas?.length ? j.lineas : ['MEDIO'] })));
  }
  private firmaActual(): string {
    return this.firma(this.formacion(), this.titulares(), this.banca());
  }

  /** Como esta cada pestaña: sin enviar, igual que la otra, o su formacion. */
  estadoPartido(p: PartidoDeJornada): string {
    const g = this.guardadas()[p.id];
    if (!g) return 'sin enviar';
    const otras = this.partidosJornada().filter((x) => x.id !== p.id).map((x) => this.guardadas()[x.id]);
    const yo = this.firmaDe(g);
    if (otras.length && otras.every((x) => x && this.firmaDe(x) === yo)) return 'el mismo once';
    return g.formacion;
  }

  /** Lo que se ve es exactamente lo que hay guardado para este partido. */
  enviada = computed(() => {
    const id = this.partidoSel();
    const g = id ? this.guardadas()[id] : null;
    return !!g && this.firmaDe(g) === this.firmaActual();
  });
  /** Si no la hay, de qué jornada se ha copiado el borrador que se está viendo. */
  copiadaDe = signal<number | null>(null);
  plantilla = signal<ItemPlantilla[]>([]);
  puntos = signal<Record<string, number>>({});
  titulares = signal<string[]>([]);
  banca = signal<{ id: string; lineas: string[] }[]>([]);
  picker = signal<{ pos?: string; banca?: boolean; reemplazar?: string } | null>(null);
  cargando = signal(true);
  guardando = signal(false);
  aviso = signal('');

  /** El dorsal de la camiseta del hueco: las iniciales de tu equipo. */
  iniciales = computed(() => {
    const p = (this.equipo()?.nombre ?? '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    return ((p[0][0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
  });

  compTipo = computed(() => this.competiciones().find((c) => c.id === this.competicionId())?.tipo ?? 'LIGA');
  esLiga = computed(() => this.compTipo() === 'LIGA');
  /**
   * El plazo. La hora de cierre es la del primer partido de la jornada, y a partir de ella
   * Postgres rechaza cualquier cambio (falm.guardar_alineacion y el trigger
   * solo_por_la_puerta). Aquí solo se avisa antes y se bloquea la pantalla al llegar, para
   * no dejar que alguien monte un once que después no se va a poder enviar.
   */
  ahora = signal(Date.now());
  private reloj?: ReturnType<typeof setInterval>;
  private msAlCierre = computed(() => {
    const f = this.jornada()?.fecha;
    return f ? new Date(f).getTime() - this.ahora() : null;
  });
  cerrada = computed(() => (this.msAlCierre() ?? 1) <= 0);
  /** Última hora de plazo: es cuando el aviso se pone en rojo y cuenta los segundos. */
  apura = computed(() => { const ms = this.msAlCierre(); return ms !== null && ms > 0 && ms <= 3600_000; });
  cuentaAtras = computed(() => {
    const ms = this.msAlCierre();
    if (ms === null || ms <= 0) return '';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60), sg = s % 60;
    if (d > 0) return `${d} d ${h} h`;
    if (h > 0) return `${h} h ${m} min`;
    if (m > 0) return `${m} min ${sg} s`;
    return `${sg} s`;
  });

  /** Posición de la jornada abierta dentro de la competición. */
  idxJornada = computed(() => this.jornadasComp().findIndex((j) => j.id === this.jornada()?.id));

  /** La jornada que toca: la primera por jugar, o la última si ya pasaron todas. */
  private porDefecto(): JornadaFalm | null {
    const js = this.jornadasComp();
    if (!js.length) return null;
    const ahora = Date.now();
    return js.find((j) => j.fecha && new Date(j.fecha).getTime() > ahora) ?? js[js.length - 1];
  }
  esJornadaPorDefecto = computed(() => {
    const js = this.jornadasComp();
    if (!js.length) return true;
    const ahora = Date.now();
    const def = js.find((j) => j.fecha && new Date(j.fecha).getTime() > ahora) ?? js[js.length - 1];
    return def?.id === this.jornada()?.id;
  });

  /** Las jornadas vecinas, para enseñar a dónde lleva cada flecha. */
  jAnterior = computed(() => this.jornadasComp()[this.idxJornada() - 1] ?? null);
  jSiguiente = computed(() => this.jornadasComp()[this.idxJornada() + 1] ?? null);

  async irJornada(paso: number) {
    const js = this.jornadasComp();
    const i = this.idxJornada() + paso;
    if (i >= 0 && i < js.length) await this.seleccionarJornada(js[i]);
  }
  async irAJornadaActual() {
    const j = this.porDefecto();
    if (j) await this.seleccionarJornada(j);
  }

  /** Cupos por línea según la formación (POR siempre 1). */
  cupos = computed(() => {
    const p = this.formacion().split('-').map(Number);
    return { PORTERO: 1, DEFENSA: p[0] || 0, MEDIO: p[1] || 0, DELANTERO: p[2] || 0 } as Record<string, number>;
  });

  /** Cuántas cartas tiene la línea más poblada: marca el ancho de todas. */
  maxPorLinea = computed(() => Math.max(1, ...Object.values(this.cupos())));

  candidatos = computed(() => {
    const p = this.picker();
    if (!p) return [] as ItemPlantilla[];
    // Suplente para una zona concreta: puede valer cualquiera que no sea
    // portero ni titular, pero delante van los de esa posición, que es lo
    // normal, y detrás el resto por media.
    if (p.banca) {
      const l = p.pos!;
      const yaCubre = new Set(this.banca().filter((b) => b.lineas.includes(l)).map((b) => b.id));
      return this.plantilla()
        .filter((j) => j.posicion !== 'PORTERO' && !this.esTitular(j.activo_id) && !yaCubre.has(j.activo_id))
        .sort((a, b) => (Number(b.posicion === l) - Number(a.posicion === l)) || (this.media(b) - this.media(a)));
    }
    // sustituir: candidatos = jugadores de esa línea que NO están ya de titulares
    if (p.reemplazar) {
      return this.plantilla().filter((j) => j.posicion === p.pos && !this.esTitular(j.activo_id));
    }
    return this.plantilla().filter((j) => j.posicion === p.pos);
  });

  constructor(private falm: FalmService) {}

  etiqueta(t: string) { return t === 'CHAMPIONS' ? 'Champions' : t === 'CLAUSURA' ? 'Clausura' : 'Liga'; }
  etiquetaPos(p: string) { return ETI[p] ?? p; }
  abr(p: string) { return ABR[p] ?? p; }
  dobles = signal<Set<string>>(new Set());
  esDoble(id: string) { return this.dobles().has(id); }

  /**
   * Contra quien juega, donde y cuando: el tooltip del campo y del banquillo.
   * En las jornadas dobles van los dos partidos, uno por linea, y si llega
   * tocado se dice tambien, que es lo que se mira antes de dejarlo puesto.
   */
  conQuienJuega(activoId: string): string {
    const l = this.partidos(activoId).map(
      (p) => `${p.casa ? 'En casa' : 'Fuera'} vs ${p.rival} · ${this.fechaCorta(p.fecha)}`);
    const e = this.parte(activoId);
    if (e) l.push(e.title && e.title !== e.eti ? `${e.eti} · ${e.title}` : e.eti);
    return l.join('\n') || 'Sin partido esta jornada';
  }

  fechaCorta(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) +
      ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }
  /**
   * Lo que lleva sumado en la temporada. Ya NO se pinta en esta pantalla: es el total de
   * todo lo jugado -- incluidas las jornadas 1-4 de LaLiga, que no cuentan para la liga --
   * y puesto al lado del partido de la jornada se leia como los puntos de esa jornada. Se
   * queda solo para ordenar: los que mas rinden, arriba en el selector.
   */
  media(j: ItemPlantilla) { return this.puntos()[j.activo_id] ?? 0; }
  nombreDe(id: string) { return this.plantilla().find((p) => p.activo_id === id)?.nombre ?? '?'; }
  esTitular(id: string) { return this.titulares().includes(id); }
  cupo(pos: string) { return this.cupos()[pos] ?? 0; }

  enLinea(pos: string): ItemPlantilla[] {
    const set = new Set(this.titulares());
    return this.plantilla().filter((j) => set.has(j.activo_id) && j.posicion === pos);
  }
  huecos(pos: string): number[] {
    const n = Math.max(0, this.cupo(pos) - this.enLinea(pos).length);
    return Array.from({ length: n }, (_, i) => i);
  }

  abrirLinea(pos: string, reemplazar?: string) { this.picker.set({ pos, reemplazar }); }
  abrirBanca(linea: string) { this.picker.set({ banca: true, pos: linea }); }
  tituloPicker(p: { pos?: string; banca?: boolean; reemplazar?: string }) {
    if (p.banca) return 'Si falla un ' + this.etiquetaPos(p.pos!).toLowerCase() + ', entra…';
    if (p.reemplazar) return 'Cambiar ' + this.nombreDe(p.reemplazar);
    return 'Elegir ' + this.etiquetaPos(p.pos!) + ' · ' + this.enLinea(p.pos!).length + '/' + this.cupo(p.pos!);
  }
  quitarReemplazo() {
    const id = this.picker()?.reemplazar;
    if (id) this.titulares.update((t) => t.filter((x) => x !== id));
    this.picker.set(null);
  }

  /** Cambia formación y recorta cada línea a su nuevo cupo (quedan los de mayor media). */
  cambiarFormacion(f: string) {
    this.formacion.set(f);
    const p = f.split('-').map(Number);
    const cupos: Record<string, number> = { PORTERO: 1, DEFENSA: p[0] || 0, MEDIO: p[1] || 0, DELANTERO: p[2] || 0 };
    const set = new Set(this.titulares());
    const keep: string[] = [];
    for (const pos of ['PORTERO', 'DEFENSA', 'MEDIO', 'DELANTERO']) {
      this.plantilla()
        .filter((j) => set.has(j.activo_id) && j.posicion === pos)
        .sort((a, b) => this.media(b) - this.media(a))
        .slice(0, cupos[pos])
        .forEach((j) => keep.push(j.activo_id));
    }
    this.titulares.set(keep);
  }

  seleccionado(j: ItemPlantilla) {
    const p = this.picker();
    return p?.banca ? false : this.esTitular(j.activo_id);
  }
  elegir(j: ItemPlantilla) {
    const p = this.picker();
    if (!p) return;
    if (p.banca) {
      const l = p.pos!;
      if (this.cubren(l) >= 2) {
        this.aviso.set(`Ya tienes 2 suplentes para ${this.abr(l)} (máximo por zona).`);
        this.picker.set(null);
        return;
      }
      // Si ya estaba en el banquillo cubriendo otra zona, se le suma esta en
      // vez de duplicarlo: un mismo suplente puede tapar dos huecos distintos.
      const ya = this.banca().some((x) => x.id === j.activo_id);
      this.banca.update((b) => ya
        ? b.map((x) => x.id === j.activo_id ? { ...x, lineas: [...x.lineas, l] } : x)
        : [...b, { id: j.activo_id, lineas: [l] }]);
      this.aviso.set('');
      this.picker.set(null);
      return;
    }
    // sustituir: saca al jugador tocado y mete al elegido (misma línea)
    if (p.reemplazar) {
      const sale = p.reemplazar;
      this.banca.update((b) => b.filter((x) => x.id !== j.activo_id));
      this.titulares.update((t) => [...t.filter((x) => x !== sale && x !== j.activo_id), j.activo_id]);
      this.aviso.set('');
      this.picker.set(null);
      return;
    }
    // titular: toggle (sin pasar del cupo de la línea)
    if (this.esTitular(j.activo_id)) {
      this.titulares.update((t) => t.filter((x) => x !== j.activo_id));
      this.aviso.set('');
    } else if (this.enLinea(j.posicion).length >= this.cupo(j.posicion)) {
      this.aviso.set(`Línea ${this.abr(j.posicion)} completa (${this.cupo(j.posicion)}). Quita uno o cambia la formación.`);
    } else {
      this.banca.update((b) => b.filter((x) => x.id !== j.activo_id));
      this.titulares.update((t) => [...t, j.activo_id]);
      this.aviso.set('');
    }
  }

  fueraId(id: string) {
    this.titulares.update((t) => t.filter((x) => x !== id));
    this.banca.update((b) => b.filter((x) => x.id !== id));
  }
  /** Quién cubre una línea, en el orden en que entrarían. */
  colaDe(l: string) {
    const c = this.banca().filter((b) => b.lineas.includes(l));
    return c.length ? c : null;
  }
  fotoDe(id: string) { return this.plantilla().find((p) => p.activo_id === id)?.foto ?? null; }
  posDe(id: string) { return this.plantilla().find((p) => p.activo_id === id)?.posicion ?? ''; }
  /** La posición del candidato, solo al elegir suplente (en el campo sobra:
   *  ahí todos son de la línea que se está llenando). */
  posCand(j: ItemPlantilla) {
    const p = this.picker();
    if (!p?.banca) return null;
    return { eti: this.abr(j.posicion), distinta: j.posicion !== p.pos };
  }

  /** Mover dentro de una línea mueve al suplente en la lista general, que es
   *  donde vive el orden: basta con intercambiarlo con su vecino en esa cola. */
  private moverEn(l: string, i: number, paso: number) {
    const cola = this.banca().filter((b) => b.lineas.includes(l));
    const a = cola[i], b = cola[i + paso];
    if (!a || !b) return;
    const lista = [...this.banca()];
    const ia = lista.findIndex((x) => x.id === a.id);
    const ib = lista.findIndex((x) => x.id === b.id);
    [lista[ia], lista[ib]] = [lista[ib], lista[ia]];
    this.banca.set(lista);
  }
  subirEn(l: string, i: number) { this.moverEn(l, i, -1); }
  bajarEn(l: string, i: number) { this.moverEn(l, i, 1); }

  /**
   * Dejar de cubrir una zona. Si esa era la única que cubría, se va del
   * banquillo entero: un suplente que no tapa ningún hueco no entra nunca.
   * (Antes esto pasaba por toggleLinea, que se negaba a dejar a nadie sin
   * líneas y salía sin hacer nada: el aspa no borraba.)
   */
  quitarLinea(b: { id: string; lineas: string[] }, l: string) {
    const next = b.lineas.filter((x) => x !== l);
    this.aviso.set('');
    if (!next.length) { this.fueraId(b.id); return; }
    this.banca.update((arr) => arr.map((x) => x.id === b.id ? { ...x, lineas: next } : x));
  }

  cubren(l: string) { return this.banca().filter((b) => b.lineas.includes(l)).length; }
  toggleLinea(b: { id: string; lineas: string[] }, l: string) {
    if (b.lineas.includes(l)) { this.quitarLinea(b, l); return; }
    if (this.cubren(l) >= 2) {
      this.aviso.set(`Ya hay 2 suplentes cubriendo ${this.abr(l)} (máximo por zona).`);
      return;
    }
    this.aviso.set('');
    this.banca.update((arr) => arr.map((x) => x.id === b.id ? { ...x, lineas: [...x.lineas, l] } : x));
  }

  ngOnDestroy() { clearInterval(this.reloj); }

  async ngOnInit() {
    this.reloj = setInterval(() => this.ahora.set(Date.now()), 1000);
    try {
      const eq = await this.falm.miEquipo();
      this.equipo.set(eq);
      if (!eq) { this.cargando.set(false); return; }
      const [comps, plant, pts] = await Promise.all([
        this.falm.competiciones(), this.falm.miPlantilla(eq.id), this.falm.puntosEquipo(eq.id),
      ]);
      this.plantilla.set(plant); this.puntos.set(pts);
      const orden = { LIGA: 0, CHAMPIONS: 1, CLAUSURA: 2 } as Record<string, number>;
      comps.sort((a, b) => (orden[a.tipo] ?? 9) - (orden[b.tipo] ?? 9));
      // La Champions y la Clausura empiezan a mitad de temporada: hasta que no
      // tienen jornadas no hay nada que alinear, así que ni se ofrecen.
      const calendarios = await Promise.all(comps.map((c) => this.falm.jornadas(c.id).catch(() => [])));
      comps.forEach((c, i) => this.cacheJornadas.set(c.id, calendarios[i]));
      const conCalendario = comps.filter((c, i) => calendarios[i].length > 0);
      this.competiciones.set(conCalendario.length ? conCalendario : comps);
      const liga = this.competiciones().find((c) => c.tipo === 'LIGA') ?? this.competiciones()[0];
      if (liga) await this.seleccionarCompeticion(liga.id);
    } catch (e: any) { this.aviso.set(e?.message ?? 'Error'); }
    finally { this.cargando.set(false); }
  }

  async seleccionarCompeticion(compId: string) {
    this.competicionId.set(compId);
    const js = this.cacheJornadas.get(compId) ?? await this.falm.jornadas(compId);
    this.cacheJornadas.set(compId, js);
    this.jornadasComp.set(js);
    this.falm.jornadasDobles(js.map((x) => x.id))
      .then((d) => this.dobles.set(d)).catch(() => {});
    const proxima = this.porDefecto();
    if (proxima) await this.seleccionarJornada(proxima);
    else { this.jornada.set(null); this.limpiar(); }
  }
  async seleccionarJornada(j: JornadaFalm) {
    this.jornada.set(j); this.aviso.set('');
    // Contra quién juega cada uno esa jornada y quién llega tocado. Es un
    // apaño de ayuda: si falla, la pantalla sigue funcionando igual.
    this.ctx.set({});
    this.falm.contextoJornada(j.id).then((c) => this.ctx.set(c)).catch(() => {});
    this.copiadaDe.set(null);
    this.borradores.clear();
    const eq = this.equipo(); if (!eq) return;

    // Los partidos de la jornada y el once que ya haya en cada uno. En una
    // doble son dos, y son independientes.
    const ps = await this.falm.misPartidos(eq.id, j.id).catch(() => [] as PartidoDeJornada[]);
    this.partidosJornada.set(ps);
    const guard: Record<string, AlineacionGuardada | null> = {};
    await Promise.all(ps.map(async (p) => {
      guard[p.id] = await this.falm.getAlineacion(eq.id, j.id, p.id).catch(() => null);
    }));
    this.guardadas.set(guard);
    this.partidoSel.set(ps[0]?.id ?? null);
    this.cargarPartido(ps[0]?.id ?? null);
  }

  /** Cambiar de partido sin perder lo que llevases puesto en el otro. */
  elegirPartido(enfId: string) {
    if (enfId === this.partidoSel()) return;
    this.apuntarBorrador();
    this.partidoSel.set(enfId);
    this.cargarPartido(enfId);
  }
  private apuntarBorrador() {
    const id = this.partidoSel(); if (!id) return;
    this.borradores.set(id, {
      f: this.formacion(), t: [...this.titulares()],
      b: this.banca().map((x) => ({ id: x.id, lineas: [...x.lineas] })),
    });
  }
  /** Lo que se enseña de un partido: lo que llevabas a medias, o lo guardado. */
  private cargarPartido(enfId: string | null) {
    this.aviso.set(''); this.copiadaDe.set(null);
    const bor = enfId ? this.borradores.get(enfId) : null;
    if (bor) {
      this.formacion.set(bor.f); this.titulares.set(bor.t);
      this.banca.set(bor.b.map((x) => ({ id: x.id, lineas: [...x.lineas] })));
      return;
    }
    const ali = enfId ? this.guardadas()[enfId] : null;
    // Cada partido empieza en blanco si no hay nada suyo. Antes se precargaba el
    // once de la jornada anterior y parecia enviado sin estarlo; si se quiere
    // repetir, esta el boton.
    if (ali) this.aplicar(ali); else this.limpiar();
  }
  private limpiar() { this.titulares.set([]); this.banca.set([]); this.formacion.set('4-4-2'); }
  private aplicar(ali: AlineacionGuardada) {
    const enP = new Set(this.plantilla().map((p) => p.activo_id));
    this.formacion.set(ali.formacion || '4-4-2');
    this.titulares.set(ali.jugadores.filter((j) => j.rol === 'TITULAR' && enP.has(j.activo_id)).map((j) => j.activo_id));
    this.banca.set(ali.jugadores.filter((j) => j.rol === 'SUPLENTE' && enP.has(j.activo_id))
      .sort((a, b) => a.orden - b.orden).map((j) => ({ id: j.activo_id, lineas: j.lineas?.length ? j.lineas : ['MEDIO'] })));
  }

  async repetirUltima() {
    const eq = this.equipo(); const j = this.jornada(); if (!eq || !j) return;
    const prev = await this.falm.ultimaAlineacion(eq.id, this.competicionId(), j.numero);
    if (prev) { this.aplicar(prev);
                this.copiadaDe.set(prev.desdeJornada ?? null);
                this.aviso.set('↩︎ Cargada tu última. Revisa y guarda.'); }
    else this.aviso.set('No hay alineación anterior en esta competición.');
  }
  async copiarDeLiga() {
    const eq = this.equipo(); const j = this.jornada(); if (!eq || !j) return;
    const liga = await this.falm.copiarDesdeLiga(eq.id, j.fecha);
    if (liga) { this.aplicar(liga); this.copiadaDe.set(null);
                this.aviso.set('Copiada de Liga. Revisa y guarda.'); }
    else this.aviso.set('No hay alineación de Liga de ese fin de semana.');
  }

  /**
   * Un suplente ocupa el hueco del titular que falló, pero juega con su
   * posición de verdad: si un delantero cubre la línea de medio, el equipo
   * acaba con un medio menos y un delantero más. Con dos de esas en un 4-4-2
   * se sale un 4-2-4, que no es formación legal y luego da problemas.
   *
   * Aquí se recorren todas las combinaciones de bajas y entradas posibles y se
   * comprueba que ninguna deje al equipo, ya completo, en una formación que no
   * existe. Devuelve un ejemplo del problema, o null si no lo hay.
   */
  private formacionImposible(): string | null {
    const cupos = this.cupos();
    const base: Record<string, number> = {
      DEFENSA: cupos['DEFENSA'], MEDIO: cupos['MEDIO'], DELANTERO: cupos['DELANTERO'],
    };
    const supl = this.banca().map((b) => ({
      nombre: this.nombreDe(b.id),
      pos: this.plantilla().find((p) => p.activo_id === b.id)?.posicion ?? 'MEDIO',
      lineas: b.lineas,
    }));
    if (!supl.length) return null;

    const legales = new Set(FORMACIONES);
    let fallo: string | null = null;

    // Cada combinación de bajas por línea: cuántos defensas, medios y
    // delanteros del once podrían no llegar a jugar.
    for (let bd = 0; bd <= base['DEFENSA'] && !fallo; bd++) {
      for (let bm = 0; bm <= base['MEDIO'] && !fallo; bm++) {
        for (let bl = 0; bl <= base['DELANTERO'] && !fallo; bl++) {
          const huecos = [
            ...Array(bd).fill('DEFENSA'), ...Array(bm).fill('MEDIO'), ...Array(bl).fill('DELANTERO'),
          ];
          if (!huecos.length || huecos.length > supl.length) continue;

          // Todas las formas en que los suplentes pueden tapar esos huecos.
          const probar = (i: number, libres: string[], dentro: typeof supl): void => {
            if (fallo) return;
            if (!libres.length) {
              // Equipo completo otra vez: ¿en qué formación queda?
              const real = {
                DEFENSA: base['DEFENSA'] - bd, MEDIO: base['MEDIO'] - bm, DELANTERO: base['DELANTERO'] - bl,
              } as Record<string, number>;
              for (const e of dentro) real[e.pos] = (real[e.pos] ?? 0) + 1;
              const f = `${real['DEFENSA']}-${real['MEDIO']}-${real['DELANTERO']}`;
              if (!legales.has(f)) {
                const quien = dentro.map((e) => e.nombre).join(' y ');
                fallo = `Si te fallan ${huecos.length} y entra${dentro.length > 1 ? 'n' : ''} ${quien},`
                      + ` el equipo queda en ${f}, que no es una formación permitida.`
                      + ` Revisa qué líneas cubre${dentro.length > 1 ? 'n' : ''}.`;
              }
              return;
            }
            if (i >= supl.length) return;   // quedan huecos sin tapar: eso sí vale
            probar(i + 1, libres, dentro);  // este suplente no entra
            const j = libres.findIndex((l) => supl[i].lineas.includes(l));
            if (j >= 0) {
              probar(i + 1, libres.filter((_, k) => k !== j), [...dentro, supl[i]]);
            }
          };
          probar(0, huecos, []);
        }
      }
    }
    return fallo;
  }

  /**
   * Qué falta para poder enviar. Devuelve null si la alineación es válida.
   * Se comprueba por líneas y no solo el total, porque al cambiar de formación
   * puede quedar el número correcto de jugadores mal repartido.
   */
  problema(): string | null {
    const t = this.titulares().length;
    if (t !== 11) {
      const faltan = 11 - t;
      return faltan > 0
        ? `Te falta${faltan === 1 ? '' : 'n'} ${faltan} titular${faltan === 1 ? '' : 'es'}: llevas ${t} de 11.`
        : `Llevas ${t} titulares y solo pueden jugar 11.`;
    }
    const cupos = this.cupos();
    for (const pos of ['PORTERO', 'DEFENSA', 'MEDIO', 'DELANTERO']) {
      const puestos = this.enLinea(pos).length;
      if (puestos !== cupos[pos]) {
        const n = cupos[pos];
        const linea = this.etiquetaPos(pos).toLowerCase() + (n === 1 ? '' : 's');
        return `La formación ${this.formacion()} pide ${n} ${linea} y tienes ${puestos}.`;
      }
    }
    const sinLinea = this.banca().filter((b) => !b.lineas.length).length;
    if (sinLinea) {
      return sinLinea === 1
        ? 'Hay un suplente sin ninguna línea marcada: no entraría nunca.'
        : `Hay ${sinLinea} suplentes sin ninguna línea marcada: no entrarían nunca.`;
    }
    return this.formacionImposible();
  }

  /**
   * Manda el once al partido que toca. Si el otro partido de una doble todavia
   * no tiene ninguno, va tambien ahi: quien manda uno y no vuelve no puede
   * quedarse sin once en el segundo, y para diferenciarlos ya esta la pestaña.
   */
  async guardar() { await this.enviar(false); }
  /** El mismo once en los dos partidos, a proposito. */
  async copiarAlOtro() { await this.enviar(true); }

  private async enviar(aLosDos: boolean) {
    this.aviso.set('');
    if (this.cerrada()) {
      this.aviso.set('La jornada ya está cerrada: el once no se puede cambiar.');
      return;
    }
    const falla = this.problema();
    if (falla) { this.aviso.set(falla); return; }
    const eq = this.equipo(); const jor = this.jornada(); if (!eq || !jor) return;
    const jugadores: Alineado[] = [
      ...this.titulares().map((id) => ({ activo_id: id, rol: 'TITULAR' as const, lineas: [], orden: 0 })),
      ...this.banca().map((b, i) => ({ activo_id: b.id, rol: 'SUPLENTE' as const, lineas: b.lineas, orden: i + 1 })),
    ];

    // Sin partido, Postgres lo escribe en todos los de la jornada.
    const sel = this.partidoSel();
    const otro = this.otroPartido();
    const faltaElOtro = !!otro && !this.guardadas()[otro.id];
    const enTodos = aLosDos || faltaElOtro || !sel;
    const destino = enTodos ? null : sel;

    this.guardando.set(true);
    try {
      await this.falm.guardarAlineacion(eq.id, jor.id, this.formacion(), jugadores, destino);
      this.copiadaDe.set(null);
      this.borradores.clear();
      await this.refrescarGuardadas(eq.id, jor.id);
      const contra = this.rivalSel();
      this.aviso.set(
        !otro ? 'Alineación guardada.'
        : enTodos ? `Alineación guardada para los dos partidos.`
        : `Alineación guardada para el partido contra ${contra}. El otro se queda como estaba.`);
      try { await this.falm.recalcular(); } catch { /* la tabla se rehará sola */ }
    } catch (e: any) { this.aviso.set(e?.message ?? 'Error al guardar'); }
    finally { this.guardando.set(false); }
  }

  /** Vuelve a leer lo que hay guardado en cada partido, que es lo que dicen las pestañas. */
  private async refrescarGuardadas(equipoId: string, jornadaId: string) {
    const guard: Record<string, AlineacionGuardada | null> = {};
    await Promise.all(this.partidosJornada().map(async (p) => {
      guard[p.id] = await this.falm.getAlineacion(equipoId, jornadaId, p.id).catch(() => null);
    }));
    this.guardadas.set(guard);
  }
}
