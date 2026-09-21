import { ErrorHandler, Injectable } from '@angular/core';

/**
 * Al publicar una versión nueva, los trozos de la anterior dejan de existir.
 * Quien tuviera la pestaña abierta pide un chunk que ya no está, el servidor le
 * responde el index.html —porque cualquier ruta desconocida devuelve la app— y
 * el navegador lo rechaza por el MIME: "Expected a JavaScript-or-Wasm module
 * script but the server responded with a MIME type of text/html". La pantalla
 * se queda muerta y nadie sabe que se arregla con Ctrl+F5.
 *
 * Así que se recarga sola, UNA vez: la recarga trae el index nuevo y con él los
 * nombres nuevos de los trozos. Si vuelve a fallar en el mismo minuto, el
 * problema es otro y se deja ver el error en vez de entrar en bucle.
 */
const MARCA = 'falm:recarga-por-version';
const TREGUA = 60_000;

export function esTrozoQueYaNoEsta(e: unknown): boolean {
  const msg = (e as any)?.message ?? String(e ?? '');
  return /dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported module/i
    .test(msg);
}

export function recargarUnaVez(): boolean {
  let ultima = 0;
  try { ultima = Number(sessionStorage.getItem(MARCA) ?? 0); } catch { /* sin sessionStorage, se recarga igual */ }
  if (Date.now() - ultima < TREGUA) return false;
  try { sessionStorage.setItem(MARCA, String(Date.now())); } catch { /* da igual */ }
  location.reload();
  return true;
}

@Injectable()
export class RecargaAlPublicar implements ErrorHandler {
  handleError(error: unknown): void {
    if (esTrozoQueYaNoEsta(error) && recargarUnaVez()) return;
    console.error(error);
  }
}
