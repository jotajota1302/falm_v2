import { Component, Input } from '@angular/core';

const ABR: Record<string, string> = { PORTERO: 'POR', DEFENSA: 'DEF', MEDIO: 'MED', DELANTERO: 'DEL' };

/**
 * El acta de un reparto semanal: quien ficho a quien, que habia pedido cada
 * uno y como se resolvieron los jugadores que pidio mas de un equipo.
 *
 * Vive en shared porque la cuentan tres pantallas -Inicio, como nota de prensa
 * del ultimo reparto; Fichajes, con el historico; y Admin, al previsualizar- y
 * no pueden decir cosas distintas.
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
            <!-- La cara del fichado, con su escudo colgando: es lo que hace que
                 esto se lea como una noticia y no como una tabla. -->
            <span class="av">
              @if (e.ficha?.foto) {
                <img class="cara" [src]="e.ficha.foto" alt="" loading="lazy" (error)="e.ficha.foto = null" />
              } @else if (e.ficha?.escudo) {
                <img class="cara es" [src]="e.ficha.escudo" alt="" loading="lazy" />
              } @else {
                <span class="cara vacia">{{ e.ficho ? '?' : '—' }}</span>
              }
              @if (e.ficha?.foto && e.ficha?.escudo) {
                <img class="cl" [src]="e.ficha.escudo" alt="" loading="lazy" />
              }
            </span>

            <div class="tx">
              @if (e.ficho) {
                <p class="tt"><b class="eq">{{ e.equipo }}</b> ficha a <b class="jg">{{ e.ficha.nombre }}</b></p>
                <p class="sub">
                  <span class="pos" [class]="abr(e.ficha.posicion)">{{ abr(e.ficha.posicion) }}</span>
                  <span class="club">{{ e.ficha.club }}</span>
                  @if (e.baja) { <span class="sale">sale {{ e.baja.nombre }}</span> }
                </p>
              } @else {
                <p class="tt"><b class="eq">{{ e.equipo }}</b> se queda sin fichar</p>
                @if (e.motivo) { <p class="sub"><span class="club">{{ e.motivo }}</span></p> }
              }
              <!-- Lo que habia mandado, con un visto en lo que se llevo: sin esto
                   no se entiende por que a uno le entra la segunda opcion. -->
              <p class="pd">
                <span class="lb">Pidió</span>
                @for (o of e.pidio ?? []; track o.prioridad) {
                  <span class="op" [class.si]="o.suyo">
                    <i class="pr">{{ o.prioridad }}ª</i>
                    @if (o.escudo) { <img [src]="o.escudo" alt="" loading="lazy" /> }
                    {{ o.nombre }}@if (o.suyo) { <b class="ok">✓</b> }
                  </span>
                }
                @if (!(e.pidio ?? []).length) { <span class="op">nada</span> }
              </p>
            </div>
          </article>
        }

        @if ((acta.disputas ?? []).length) {
          <div class="disp">
            <p class="dt">Los que pidió más de un equipo</p>
            @for (d of acta.disputas; track d.jugador) {
              <div class="dl">
                <span class="dav">
                  @if (d.foto) {
                    <img [src]="d.foto" alt="" loading="lazy" (error)="d.foto = null" />
                  } @else if (d.escudo) {
                    <img class="es" [src]="d.escudo" alt="" loading="lazy" />
                  }
                </span>
                <div class="dtx">
                  <p class="dn"><b>{{ d.jugador }}</b> <i>{{ d.club }}</i></p>
                  <p class="dq">
                    @for (q of d.lo_pidieron ?? []; track q.equipo) {
                      <span class="q" [class.gana]="q.se_lo_lleva">{{ q.equipo }} <i>{{ q.prioridad }}ª</i></span>
                    }
                  </p>
                  <p class="dr">Se lo lleva <b>{{ d.se_lo_lleva }}</b>{{ porQue(d) }}.</p>
                </div>
              </div>
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

    /* Cada fichaje, una entradilla con foto: titular, ficha del jugador y lo
       que habia pedido. */
    .fi { display: grid; grid-template-columns: 52px 1fr; gap: 12px; align-items: start;
      padding: 11px 0; border-top: 1px solid var(--line); }
    .fi:first-of-type { border-top: 0; }
    .fi.sin { opacity: .72; }

    .av { position: relative; width: 52px; height: 52px; }
    .cara { width: 52px; height: 52px; border-radius: 50%; object-fit: cover; object-position: top center;
      background: var(--surface2); border: 1px solid var(--line); }
    .cara.es { object-fit: contain; padding: 8px; }
    .cara.vacia { display: flex; align-items: center; justify-content: center; width: 52px; height: 52px;
      border-radius: 50%; background: var(--surface2); border: 1px dashed var(--line); color: var(--text2); }
    /* El escudo colgando de la cara, como en las fichas. */
    .av .cl { position: absolute; right: -2px; bottom: -2px; width: 22px; height: 22px;
      object-fit: contain; border-radius: 50%; background: var(--surface);
      border: 1px solid var(--line); padding: 2px; }

    .tx { min-width: 0; }
    .tt { margin: 0; line-height: 1.4; font-size: var(--t-md); }
    .tt .eq { font-family: var(--fh); text-transform: uppercase; }
    .tt .jg { font-weight: 700; }
    .sub { margin: 3px 0 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
      font-size: var(--t-xs); color: var(--text2); }
    .sub .club { text-transform: uppercase; letter-spacing: .06em; }
    .sub .sale { padding: 1px 7px; border-radius: var(--pill); border: 1px solid var(--line);
      background: var(--surface2); }

    .pd { margin: 6px 0 0; display: flex; flex-wrap: wrap; gap: 5px; align-items: center;
      font-size: var(--t-xs); color: var(--text2); }
    .pd .lb { font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
    .op { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px;
      border: 1px solid var(--line); border-radius: var(--pill); background: var(--surface2); }
    .op img { width: 14px; height: 14px; object-fit: contain; }
    .op .pr { font-style: normal; opacity: .7; }
    .op.si { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .op .ok { margin-left: 3px; }

    /* Las disputas: es lo que mas se discute, asi que va aparte y con cara. */
    .disp { margin-top: 12px; padding: 11px 13px; border-radius: var(--r-sm);
      background: var(--surface2); border: 1px solid var(--line); }
    .dt { margin: 0 0 8px; font-size: var(--t-xs); font-weight: 700; letter-spacing: .1em;
      text-transform: uppercase; color: var(--text2); }
    .dl { display: grid; grid-template-columns: 38px 1fr; gap: 10px; align-items: start;
      margin-bottom: 10px; }
    .dl:last-child { margin-bottom: 0; }
    .dav img { width: 38px; height: 38px; border-radius: 50%; object-fit: cover;
      object-position: top center; background: var(--surface); border: 1px solid var(--line); }
    .dav img.es { object-fit: contain; padding: 5px; }
    .dtx { min-width: 0; }
    .dn { margin: 0; font-size: var(--t-sm); }
    .dn i { font-style: normal; color: var(--text2); font-size: var(--t-xs);
      text-transform: uppercase; letter-spacing: .06em; margin-left: 4px; }
    .dq { margin: 4px 0 0; display: flex; flex-wrap: wrap; gap: 4px; }
    .q { padding: 1px 7px; border-radius: var(--pill); font-size: var(--t-xs);
      border: 1px solid var(--line); background: var(--surface); }
    .q i { font-style: normal; opacity: .7; }
    .q.gana { border-color: var(--good); color: var(--good); font-weight: 700; }
    .dr { margin: 4px 0 0; font-size: var(--t-xs); color: var(--text2); }
    .dr b { color: var(--text); }

    .reglas { margin: 10px 0 0; font-size: var(--t-xs); line-height: 1.5; color: var(--text2); }

    @media (max-width: 520px) {
      .fi { grid-template-columns: 42px 1fr; gap: 10px; }
      .av, .cara, .cara.vacia { width: 42px; height: 42px; }
      .av .cl { width: 18px; height: 18px; }
      .tt { font-size: var(--t-sm); }
    }
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
