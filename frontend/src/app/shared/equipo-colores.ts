/**
 * Marca de color de cada equipo FALM. Tintas de prensa (nada de neones), y el
 * mismo nombre da siempre el mismo color en toda la app: clasificación,
 * partidos, detalle de enfrentamiento.
 */
const TINTAS = ['#a32b3f', '#1f6fa8', '#5c8a1f', '#b8791a', '#7b4f9d',
                '#2f7d4f', '#c05621', '#3b6ea5', '#8a2f6b', '#59606b'];

export function colorEquipo(nombre?: string): string {
  let h = 0;
  for (const ch of nombre || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTAS[h % TINTAS.length];
}
