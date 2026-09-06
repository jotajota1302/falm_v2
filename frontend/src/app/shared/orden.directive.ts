import { Directive, Input } from '@angular/core';
import { Lista } from './lista';

/**
 * Hace ordenable una celda de la cabecera: `<span falmOrd="pts" [l]="l">Pts</span>`.
 *
 * Es directiva y no componente a propósito. La cabecera es una fila del grid
 * de cada pantalla (`.fila.cab` con su grid-template-columns propio), y el CSS
 * encapsulado del padre no alcanzaría al contenido de un hijo: sacarla a un
 * componente rompería las columnas. La flecha la pone styles.css.
 */
@Directive({
  selector: '[falmOrd]',
  standalone: true,
  host: {
    'class': 'ord',
    'role': 'button',
    'tabindex': '0',
    '[class.ord-on]': 'l && l.campo() === campo',
    '[class.asc]': 'l && l.campo() === campo && l.dir() === "asc"',
    '[attr.aria-sort]': 'l && l.campo() === campo ? (l.dir() === "asc" ? "ascending" : "descending") : "none"',
    '(click)': 'l && l.ordenar(campo)',
    '(keydown.enter)': 'l && l.ordenar(campo)',
    '(keydown.space)': '$event.preventDefault(); l && l.ordenar(campo)',
  },
})
export class OrdDirective {
  @Input('falmOrd') campo = '';
  @Input({ required: true }) l!: Lista<any>;
}
