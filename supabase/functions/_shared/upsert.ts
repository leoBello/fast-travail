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

  // `seen_count` est lu ici, et pas seulement `external_id`, parce qu'un upsert
  // supabase-js écrase les colonnes qu'on lui donne : il ne sait pas exprimer un
  // `seen_count = seen_count + 1` côté SQL. On incrémente donc en JavaScript, à
  // partir de la valeur qu'on vient de relire. Le SELECT existait déjà pour
  // compter new/updated : la colonne supplémentaire ne coûte pas un aller-retour.
  const { data: existing, error: selectError } = await db
    .from('offers')
    .select('external_id, seen_count')
    .eq('source', source)
    .in('external_id', ids);

  if (selectError) throw new Error(`lecture des offres connues : ${selectError.message}`);

  const known = new Map(
    (existing ?? []).map((
      r: { external_id: string; seen_count: number | null },
    ) => [r.external_id, r.seen_count ?? 1]),
  );

  const payload = rows.map((offer) => ({
    ...offer,
    // La colonne offers.raw est NOT NULL et le type `unknown` accepte null :
    // on garantit ici que le contrat SQL est respecté quel que soit le mapper.
    raw: offer.raw ?? {},
    last_seen_at: new Date().toISOString(),
    // Nombre de fois qu'une requête a ramené cette offre. Le design le
    // promettait ; le code ne l'écrivait pas, et la colonne restait figée à 1.
    //
    // ATTENTION à la sémantique exacte, mesurée et non supposée : ce n'est PAS
    // un compteur de collectes. runCollection appelle upsertOffers après CHAQUE
    // requête, donc une offre que cinq requêtes de la matrice ramènent dans le
    // même run est comptée cinq fois. Constaté au premier run réel : des offres
    // à seen_count = 5 après une seule collecte.
    //
    // Le signal reste utile — un compte élevé veut dire « largement diffusée,
    // ou en ligne depuis longtemps », les deux étant des indices d'un poste
    // difficile à pourvoir. Mais qui voudra « depuis combien de jours » devra
    // passer par first_seen_at et last_seen_at, pas par ce compteur.
    //
    // Lecture puis écriture, donc non atomique : deux collectes simultanées sur
    // la même offre n'incrémenteraient que d'un. Les deux crons sont espacés
    // d'une demi-heure pour des exécutions de 11 et 17 secondes, et une source
    // ne se collecte jamais en parallèle d'elle-même — une sous-estimation
    // n'induirait donc personne en erreur.
    seen_count: (known.get(offer.external_id) ?? 0) + 1,
  }));

  const { error: upsertError } = await db
    .from('offers')
    .upsert(payload, { onConflict: 'source,external_id' });

  if (upsertError) throw new Error(`upsert des offres : ${upsertError.message}`);

  const updated = ids.filter((id) => known.has(id)).length;
  return { new: rows.length - updated, updated };
}
