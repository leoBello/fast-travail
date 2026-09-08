import type { DbClient } from './db.ts';
import type { NormalizedOffer } from './types.ts';

export interface UpsertResult {
  new: number;
  updated: number;
}

/** Provenance d'un lot : quelle requête l'a ramené. */
export interface UpsertProvenance {
  /** Requête qui a ramené ce lot, ou null si la provenance est inconnue. */
  queryId: number | null;
}

/**
 * Forme des lignes relues avant écriture. Elle doit rester le miroir exact de
 * la liste de colonnes du `.select(...)` ci-dessous : `DbClient` n'est pas
 * typé sur le schéma, supabase-js rend donc `any`, et cette interface est une
 * **affirmation, pas une vérification**. Les tests ne rattraperaient pas une
 * divergence non plus — le faux client y est construit sur la même hypothèse.
 * Ce qui la valide réellement est la collecte réelle exigée en fin de tâche.
 */
interface KnownOfferRow {
  external_id: string;
  seen_count: number | null;
  found_by_query_ids: number[] | null;
}

/**
 * Insère ou met à jour un lot d'offres et renvoie le comptage new/updated.
 *
 * Le dédoublonnage repose sur la contrainte unique (source, external_id).
 * Postgres ne dit pas quelles lignes préexistaient : on lit donc les
 * external_id déjà connus avant d'écrire, puis on compte par différence.
 *
 * `provenance` est requis et non optionnel : un appelant qui l'oublie doit
 * échouer à la compilation plutôt qu'écrire silencieusement des offres sans
 * origine — c'est tout le point de la confiance par requête (voir la
 * migration `20260908033042_query_provenance_and_trust.sql`).
 *
 * ## Deux colonnes que l'upsert ne sait pas calculer, et pourquoi
 *
 * Un upsert supabase-js **écrase** les colonnes qu'on lui passe : il ne sait
 * exprimer ni un `seen_count = seen_count + 1`, ni une union de tableaux, côté
 * SQL. Les deux se calculent donc en JavaScript à partir de la valeur relue.
 * Le `SELECT` existait déjà pour compter new/updated : les deux colonnes
 * supplémentaires ne coûtent **pas** un aller-retour de plus.
 *
 * **`seen_count` — attention à la sémantique, mesurée et non supposée.** Ce
 * n'est PAS un compteur de collectes. `runCollection` appelle `upsertOffers`
 * après CHAQUE requête, donc une offre que cinq requêtes de la matrice
 * ramènent dans le même run est comptée cinq fois : constaté au premier run
 * réel, des offres à `seen_count = 5` après une seule collecte. Le signal
 * reste utile — un compte élevé veut dire « largement diffusée, ou en ligne
 * depuis longtemps », deux indices d'un poste difficile à pourvoir — mais qui
 * voudra « depuis combien de jours » devra passer par `first_seen_at` et
 * `last_seen_at`, pas par ce compteur.
 *
 * **`found_by_query_ids` — une union, jamais une concaténation.** Une offre
 * ramenée dix fois par la même requête garde un tableau à un élément, là où
 * `seen_count` compte bien chaque passage : les deux colonnes mesurent des
 * choses différentes. L'ensemble s'accumule collecte après collecte et
 * n'oublie rien — une requête désactivée plus tard laisse sa trace, et c'est
 * voulu : « cette requête a trouvé cette offre » reste vrai même si elle ne
 * tourne plus. La confiance, elle, se retire : la vue `offers_ranked` ne
 * compte comme dignes de confiance que les requêtes encore `enabled` (voir la
 * migration `20260908080000`).
 *
 * ## Non atomique, et pourquoi c'est sans danger ici
 *
 * Les deux colonnes se lisent puis s'écrivent. Ce qui protège n'est pas
 * l'espacement des crons mais la **disjonction des lignes** : le `SELECT`
 * filtre sur `source` et l'écriture porte sur la clé `(source, external_id)`,
 * donc deux sources différentes ne peuvent jamais se disputer une ligne.
 * France Travail et Adzuna sont disjoints par construction, et toute source
 * ajoutée ensuite le sera aussi.
 *
 * Reste le cas d'une source collectée en parallèle d'elle-même — un run
 * manuel par-dessus un cron. Là, les deux colonnes ne se valent pas :
 * `found_by_query_ids` est **auto-réparant**, un id perdu revenant au
 * prochain passage de cette requête sur cette offre, alors qu'un incrément de
 * `seen_count` perdu l'est pour toujours.
 */
export async function upsertOffers(
  db: DbClient,
  offers: NormalizedOffer[],
  provenance: UpsertProvenance,
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
    .select('external_id, seen_count, found_by_query_ids')
    .eq('source', source)
    .in('external_id', ids);

  if (selectError) throw new Error(`lecture des offres connues : ${selectError.message}`);

  const known = new Map(
    (existing ?? []).map((r: KnownOfferRow) => [r.external_id, {
      seenCount: r.seen_count ?? 1,
      foundByQueryIds: r.found_by_query_ids ?? [],
    }]),
  );

  const payload = rows.map((offer) => {
    const prior = known.get(offer.external_id);

    // Union : Set élimine le doublon, le tri rend le résultat déterministe.
    // `queryId` null laisse le tableau existant inchangé plutôt que d'y
    // ajouter une entrée creuse.
    const foundByQueryIds = new Set(prior?.foundByQueryIds ?? []);
    if (provenance.queryId !== null) foundByQueryIds.add(provenance.queryId);

    return {
      ...offer,
      // La colonne offers.raw est NOT NULL et le type `unknown` accepte null :
      // on garantit ici que le contrat SQL est respecté quel que soit le mapper.
      raw: offer.raw ?? {},
      last_seen_at: new Date().toISOString(),
      // Compte les passages de requête, pas les collectes — lire l'exposé en
      // tête de fonction avant de s'en servir comme d'une ancienneté.
      seen_count: (prior?.seenCount ?? 0) + 1,
      found_by_query_ids: [...foundByQueryIds].sort((a, b) => a - b),
    };
  });

  const { error: upsertError } = await db
    .from('offers')
    .upsert(payload, { onConflict: 'source,external_id' });

  if (upsertError) throw new Error(`upsert des offres : ${upsertError.message}`);

  const updated = ids.filter((id) => known.has(id)).length;
  return { new: rows.length - updated, updated };
}
