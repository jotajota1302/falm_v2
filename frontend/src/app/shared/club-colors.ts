/** Colores de cada club LaLiga: [color1, color2, tinta]. Clave = slug del escudo de llt-services. */
const CLUB: Record<string, [string, string, string]> = {
  'athletic-club': ['#e2231a', '#9c0f12', '#fff'],
  'atletico-de-madrid': ['#cb3524', '#1c2b6b', '#fff'],
  'c-a-osasuna': ['#0a2e6d', '#b4173b', '#fff'],
  'rc-celta': ['#8ec9ee', '#4a90c2', '#0a2436'],
  'd-alaves': ['#1a4fa0', '#0d2e63', '#fff'],
  'elche-c-f': ['#00913f', '#055e2c', '#fff'],
  'fc-barcelona': ['#a50044', '#004d98', '#fff'],
  'getafe-cf': ['#0067b1', '#004074', '#fff'],
  'girona-fc': ['#c8102e', '#7a0a1d', '#fff'],
  'levante-ud': ['#1565c0', '#b4151f', '#fff'],
  'rayo-vallecano': ['#e53027', '#9c1d18', '#fff'],
  'rcd-espanyol': ['#0080c8', '#0a4f7a', '#fff'],
  'rcd-mallorca': ['#e30613', '#1a1a1a', '#fff'],
  'real-betis': ['#00954c', '#066b38', '#fff'],
  'real-madrid': ['#f5f6f8', '#dde3ec', '#16213b'],
  'real-oviedo': ['#0a4aa0', '#06306b', '#fff'],
  'real-sociedad': ['#0067b1', '#b4151f', '#fff'],
  'sevilla-fc': ['#d7141a', '#8c0d11', '#fff'],
  'valencia-cf': ['#f18e00', '#1a1a1a', '#fff'],
  'villarreal-cf': ['#ffd83c', '#e8b800', '#5a4500'],
};

/** Gradiente por posición (fallback cuando no se reconoce el club). */
const POS_GRAD: Record<string, string> = {
  POR: 'linear-gradient(155deg,#9be7c4,#49c08a 60%,#2f9c6e)',
  DEF: 'linear-gradient(155deg,#9ec9f5,#4f9be8 60%,#2f74c0)',
  MED: 'linear-gradient(155deg,#f2d27a,#e0b24e 60%,#bf9233)',
  DEL: 'linear-gradient(155deg,#f6b39c,#ec6f4d 60%,#c8482b)',
};

/** Extrae el slug del club desde la URL del escudo (…/t178_fc-barcelona.png → fc-barcelona). */
export function clubSlug(escudo?: string | null): string {
  const m = (escudo || '').match(/_([a-z0-9-]+)\.png(?:[?#].*)?$/i);
  return m ? m[1] : '';
}

/** Gradiente de fondo del club; si no se reconoce, usa el color de la posición. */
export function clubGrad(escudo?: string | null, posAbbr = 'MED'): string {
  const c = CLUB[clubSlug(escudo)];
  return c ? `linear-gradient(155deg, ${c[0]}, ${c[1]} 72%, ${c[1]})` : (POS_GRAD[posAbbr] ?? POS_GRAD['MED']);
}

/** Color de tinta (texto) legible sobre el fondo del club. */
export function clubInk(escudo?: string | null): string {
  return CLUB[clubSlug(escudo)]?.[2] ?? '#1a1206';
}
