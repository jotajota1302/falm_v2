import { FalmService } from '../core/falm.service';

/** Lo mínimo para saber si a alguien le falta cara y de qué club es. */
export interface SinCara { foto?: string | null; club_id?: string | null }

/**
 * Un portero conocido por club, para las porterías de las listas de libres:
 * no tienen retrato propio, y al ficharlas fichas a quien pare ese día.
 * Lo usan Mercado, Fichajes e Intercambios, que enseñan las mismas fichas.
 */
export async function carasDePorterias(
  falm: FalmService,
  libres: SinCara[],
): Promise<Record<string, string>> {
  const clubes = libres.filter((a) => !a.foto && a.club_id).map((a) => a.club_id!);
  if (!clubes.length) return {};
  const porteros = await falm.porterosDeClubes(clubes).catch(() => ({}));
  const caras: Record<string, string> = {};
  for (const [club, ps] of Object.entries(porteros)) {
    const f = ps.find((p) => p.foto)?.foto;
    if (f) caras[club] = f;
  }
  return caras;
}
