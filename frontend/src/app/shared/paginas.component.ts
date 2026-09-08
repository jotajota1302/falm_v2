import { Component, ElementRef, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Lista } from './lista';

/**
 * Los controles de página. Van dos veces en cada lista: arriba, en la barra de
 * filtros (`compacto`), y abajo con el recuento y el tamaño de página. Lo de
 * arriba es lo que de verdad quita scroll: no hay que bajar al fondo para
 * pasar de página.
 */
@Component({
  selector: 'falm-paginas',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (l.paginas() > 1 || !compacto) {
      <div class="pg" [class.mini]="compacto">
        @if (!compacto) {
          <span class="cnt">
            {{ l.total() }} {{ unidad }}@if (l.total()) { <i> · {{ l.desde() + 1 }}–{{ l.hasta() }}</i> }
          </span>
        }
        @if (l.paginas() > 1) {
          <div class="ctrl">
            <button (click)="ir(1)" [disabled]="l.actual() === 1" title="Primera página" aria-label="Primera página">«</button>
            <button (click)="ir(l.actual() - 1)" [disabled]="l.actual() === 1" title="Anterior" aria-label="Página anterior">‹</button>
            <span class="np">{{ l.actual() }} <i>de</i> {{ l.paginas() }}</span>
            <button (click)="ir(l.actual() + 1)" [disabled]="l.actual() === l.paginas()" title="Siguiente" aria-label="Página siguiente">›</button>
            <button (click)="ir(l.paginas())" [disabled]="l.actual() === l.paginas()" title="Última página" aria-label="Última página">»</button>
          </div>
        }
        @if (!compacto) {
          <label class="tam">
            <span>Por página</span>
            <select [ngModel]="l.porPagina()" (ngModelChange)="l.tamano(+$event)">
              @for (n of tamanos; track n) { <option [value]="n">{{ n }}</option> }
            </select>
          </label>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .pg { display: flex; align-items: center; justify-content: space-between;
      gap: 12px; flex-wrap: wrap; margin-top: 14px; }
    .pg.mini { margin: 0; margin-left: auto; }
    .cnt { font-size: var(--t-sm); color: var(--text2); }
    .cnt i { font-style: normal; }
    .ctrl { display: flex; align-items: center; gap: 4px; }
    .ctrl button { min-width: 32px; padding: 6px 8px; border: 1px solid var(--line);
      background: var(--surface); color: var(--text2); border-radius: var(--r-xs); cursor: pointer;
      font-family: var(--fb); font-size: var(--t-sm); font-weight: 700; line-height: 1; }
    .ctrl button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .ctrl button:disabled { opacity: .32; cursor: not-allowed; }
    .np { padding: 0 8px; font-family: var(--fm); font-size: var(--t-sm); font-weight: 700; white-space: nowrap; }
    /* Las cifras van en mono; el "de" que las separa es una palabra. */
    .np i { font-style: normal; font-weight: 400; color: var(--text2); font-family: var(--fb); }
    .tam { display: flex; align-items: center; gap: 7px; font-size: var(--t-sm); color: var(--text2); }
    .tam select { padding: 5px 8px; border: 1px solid var(--line); background: var(--surface);
      border-radius: var(--r-xs); font-family: var(--fb); font-size: var(--t-sm); }

    @media (max-width: 620px) {
      .pg { justify-content: center; }
      .pg .cnt { flex: 1 1 100%; text-align: center; }
      /* En el teléfono el de la barra de filtros cae en su propia línea: que
         vaya centrado y no descolgado bajo el buscador. El ancho lo manda el
         :host, que es quien hace de celda en el flex de la barra. */
      :host { flex: 1 1 100%; }
      .pg.mini { margin-left: 0; justify-content: center; }
      /* Cuatro flechas de 28px seguidas son el peor blanco de la aplicación en
         un teléfono; el resto de píldoras miden 40. */
      .ctrl { gap: 6px; }
      .ctrl button { min-width: 40px; min-height: 40px; padding: 6px 10px; }
      .tam { display: none; }
    }
  `],
})
export class PaginasComponent {
  @Input({ required: true }) l!: Lista<any>;
  /** Qué se cuenta: «264 jugadores». */
  @Input() unidad = 'filas';
  /** El de la barra de filtros: solo las flechas. */
  @Input() compacto = false;
  tamanos = [25, 50, 100];

  constructor(private el: ElementRef<HTMLElement>) {}

  /**
   * Cambiar de página y volver al principio de la lista: si no, la página
   * nueva empieza donde te habías quedado y parece que no ha pasado nada.
   */
  ir(p: number) {
    this.l.ir(p);
    const doc = this.el.nativeElement.ownerDocument;
    const tabla = doc.querySelector('.tabla');
    if (!tabla) return;
    const y = tabla.getBoundingClientRect().top + (doc.defaultView?.scrollY ?? 0) - 80;
    doc.defaultView?.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }
}
