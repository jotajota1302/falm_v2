import { Component, Input } from '@angular/core';

const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/**
 * El acta de un reparto semanal: quien ficho a quien, que habia pedido cada
 * uno y como se resolvieron los jugadores que pidio mas de un equipo.
 *
 * Vive en shared porque la cuentan dos pantallas -Inicio, como nota de prensa
 * del ultimo reparto, y Fichajes, con el historico- y no pueden decir cosas
 * distintas.
 */
@Component({
  selector: 'falm-acta-fichajes',
  standalone: true,
  template: `
    @if (acta?.ventana) {
      <div class="acta">
        @if (cabecera) {
          <p class="cab">
            <b>Mercado · jornada {{ acta.jornada }}</b>
            <span class="fe">{{ cuando(acta.fecha) }} · {{ acta.fichajes }} de {{ acta.peticiones }}
              {{ acta.peticiones === 1 ? 'petición' : 'peticiones' }} con fichaje</span>
          </p>
        }

        @for (e of acta.equipos; track e.equipo) {
          <article class="fi" [class.sin]="!e.ficho">
            <p class="tt">
              <b>{{ e.equipo }}</b>
              @if (e.ficho) {
                ficha a <b>{{ e.ficha.nombre }}</b>
                <span class="cl">{{ e.ficha.club }} · {{ abr(e.ficha.posicion) }}</span>@if (e.baja) {
                  y deja salir a <b>{{ e.baja.nombre }}</b>
                }.
              } @else {
                se queda sin fichar.
              }
            </p>
            <!-- Lo que habia mandado, con un visto en el que se llevo: sin esto no
                 se entiende por que a uno le entra la segunda opcion. -->
            <p class="pd">
              <span class="lb">Pidió</span>
              @for (o of e.pidio ?? []; track o.prioridad) {
                <span class="op" [class.si]="o.suyo">{{ o.prioridad }}ª {{ o.nombre }}
                  <i>{{ o.club }}</i>@if (o.suyo) { <b class="ok">✓</b> }</span>
              }
              @if (!(e.pidio ?? []).length) { <span class="op">nada</span> }
            </p>
            @if (!e.ficho && e.motivo) { <p class="mt">{{ e.motivo }}</p> }
          </article>
        }

        @if ((acta.disputas ?? []).length) {
          <div class="disp">
            <p class="dt">Los que pidió más de un equipo</p>
            @for (d of acta.disputas; track d.jugador) {
              <p class="dl">
                <b>{{ d.jugador }}</b> <i>{{ d.club }}</i>:
                @for (q of d.lo_pidieron ?? []; track q.equipo) {
                  <span class="q" [class.gana]="q.se_lo_lleva">{{ q.equipo }} <i>{{ q.prioridad }}ª</i></span>
                }
                <span class="fl">se lo lleva <b>{{ d.se_lo_lleva }}</b>{{ porQue(d) }}.</span>
              </p>
            }
          </div>
        }

        <p class="reglas">Primero se reparten las primeras opciones y después las segundas.
          Si dos equipos piden al mismo con la misma prioridad, se lo lleva quien no fichó la
          semana anterior; si siguen empatados, el peor clasificado (menos puntos y, si también
          empatan, menos puntos a favor).</p>
      </div>
    }
  `,
  styles: [`
    .acta { font-size: var(--t-sm); }
    .cab { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin: 0 0 10px; }
    .cab b { font-family: var(--fh); text-transform: uppercase; font-size: var(--t-md); }
    .cab .fe { color: var(--text2); font-size: var(--t-xs); }

    /* Cada fichaje es una entradilla: titular arriba y lo que pidio debajo. */
    .fi { padding: 9px 0; border-top: 1px solid var(--line); }
    .fi:first-of-type { border-top: 0; }
    .fi.sin { color: var(--text2); }
    .tt { margin: 0; line-height: 1.5; }
    .tt b { font-weight: 700; }
    .tt .cl { color: var(--text2); font-size: var(--t-xs); text-transform: uppercase;
      letter-spacing: .04em; margin-left: 4px; }
    .pd { margin: 4px 0 0; display: flex; flex-wrap: wrap; gap: 5px; align-items: baseline;
      font-size: var(--t-xs); color: var(--text2); }
    .pd .lb { font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
    .op { padding: 2px 7px; border: 1px solid var(--line); border-radius: var(--pill);
      background: var(--surface2); }
    .op i { font-style: normal; opacity: .75; }
    .op.si { border-color: var(--accent); color: var(--accent); }
    .op .ok { margin-left: 3px; }
    .mt { margin: 4px 0 0; font-size: var(--t-xs); color: var(--text2); }

    /* Las disputas: es lo que mas se discute y va aparte, no escondido. */
    .disp { margin-top: 12px; padding: 10px 12px; border-radius: var(--r-sm);
      background: var(--surface2); border: 1px solid var(--line); }
    .dt { margin: 0 0 6px; font-size: var(--t-xs); font-weight: 700; letter-spacing: .1em;
      text-transform: uppercase; color: var(--text2); }
    .dl { margin: 0 0 6px; line-height: 1.6; font-size: var(--t-xs); }
    .dl:last-child { margin-bottom: 0; }
    .dl > i { font-style: normal; color: var(--text2); }
    .q { display: inline-block; margin: 0 4px; padding: 1px 6px; border-radius: var(--pill);
      border: 1px solid var(--line); background: var(--surface); }
    .q i { font-style: normal; opacity: .7; }
    .q.gana { border-color: var(--good); color: var(--good); font-weight: 700; }
    .fl { display: inline; }

    .reglas { margin: 10px 0 0; font-size: var(--t-xs); line-height: 1.5; color: var(--text2); }
  `],
})
export class ActaFichajesComponent {
  /** Lo que devuelve falm.acta_fichajes(). */
  @Input() acta: any = null;
  /** En el histórico la cabecera la pone la propia pantalla. */
  @Input() cabecera = true;

  abr(p: string) { return ABR[p] ?? p; }

  cuando(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  /**
   * Por qué se lo lleva ese equipo, con el mismo criterio que aplica el reparto:
   * antes la prioridad, luego no haber fichado la semana pasada y al final la
   * clasificación.
   */
  porQue(d: any): string {
    const piden = d?.lo_pidieron ?? [];
    const gana = piden.find((q: any) => q.se_lo_lleva);
    const otros = piden.filter((q: any) => !q.se_lo_lleva);
    if (!gana || !otros.length) return '';
    const mismaPrioridad = otros.filter((q: any) => q.prioridad === gana.prioridad);
    if (!mismaPrioridad.length) {
      return `, el único que lo pedía de ${gana.prioridad}ª`;
    }
    if (!gana.ficho_semana_previa && mismaPrioridad.every((q: any) => q.ficho_semana_previa)) {
      return ', que no fichó la semana pasada';
    }
    return `, por ir peor clasificado (${gana.puntos} pts)`;
  }
}
