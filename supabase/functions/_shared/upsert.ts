import type { DbClient } from './db.ts';
import type { NormalizedOffer } from './types.ts';

export interface UpsertResult {
  new: number;
  updated: number;
}

/**
 * Insère ou met à jour un lot d'offres et renvoie le comptage new/updated.
 *
 * Le dédoublonnage repose sur la contrainte unique (source, external_id).
 * Postgres ne dit pas quelles lignes préexistaient : on lit donc les
 * external_id déjà connus avant d'écrire, puis on compte par différence.
 */
export async function upsertOffers(
  db: DbClient,
  offers: NormalizedOffer[],
): Promise<UpsertResult> {
  if (offers.length === 0) return { new: 0, updated: 0 };

  // Un même lot peut contenir deux fois la même offre (deux mots-clés qui la
  // remontent tous les deux). Postgres refuse un upsert avec clé dupliquée.
  const deduped = new Map<string, NormalizedOffer>();
  for (const offer of offers) {
    deduped.set(`${offer.source}::${offer.external_id}`, offer);
  }
  const rows = [...deduped.values()];
  const source = rows[0].source;
  const ids = rows.map((r) => r.external_id);

  const { data: existing, error: selectError } = await db
    .from('offers')
    .select('external_id')
    .eq('source', source)
    .in('external_id', ids);

  if (selectError) throw new Error(`lecture des offres connues : ${selectError.message}`);

  const known = new Set((existing ?? []).map((r: { external_id: string }) => r.external_id));

  const payload = rows.map((offer) => ({
    ...offer,
    // La colonne offers.raw est NOT NULL et le type `unknown` accepte null :
    // on garantit ici que le contrat SQL est respecté quel que soit le mapper.
    raw: offer.raw ?? {},
    last_seen_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await db
    .from('offers')
    .upsert(payload, { onConflict: 'source,external_id' });

  if (upsertError) throw new Error(`upsert des offres : ${upsertError.message}`);

  const updated = ids.filter((id) => known.has(id)).length;
  return { new: rows.length - updated, updated };
}
