// Runtime-neutre : la configuration vient de la BASE, pas de l'environnement.
// Les huit colonnes de politesse de `sources` ont été créées au plan A et n'ont
// jamais servi. Elles servent ici : ralentir une source ou la suspendre est un
// UPDATE, jamais un redéploiement.

import type { DbClient } from '../../_shared/db.ts';
import type { RunStatus, SourceKey } from '../../_shared/types.ts';

export interface SourceSettings {
  key: SourceKey;
  baseUrl: string;
  minDelayMs: number;
  maxPagesPerRun: number;
  userAgent: string;
  enabled: boolean;
}

export async function loadSourceSettings(db: DbClient, key: SourceKey): Promise<SourceSettings> {
  const { data, error } = await db
    .from('sources')
    .select('base_url, min_delay_ms, max_pages_per_run, user_agent, enabled')
    .eq('key', key)
    .maybeSingle();

  if (error) throw new Error(`lecture de la source ${key} : ${error.message}`);
  if (!data) throw new Error(`source inconnue en base : ${key}`);
  if (!data.base_url) throw new Error(`source ${key} : base_url manquant`);
  if (!data.user_agent) throw new Error(`source ${key} : user_agent manquant`);

  return {
    key,
    baseUrl: data.base_url,
    minDelayMs: data.min_delay_ms,
    maxPagesPerRun: data.max_pages_per_run,
    userAgent: data.user_agent,
    enabled: data.enabled,
  };
}

/** Consigne le verdict de robots.txt du jour. Une autorisation ancienne ne vaut rien. */
export async function recordRobotsCheck(
  db: DbClient,
  key: SourceKey,
  allows: boolean,
): Promise<void> {
  const { error } = await db
    .from('sources')
    .update({ robots_allows: allows, robots_checked_at: new Date().toISOString() })
    .eq('key', key);
  if (error) throw new Error(`écriture du verdict robots pour ${key} : ${error.message}`);
}

export async function markSourceRun(
  db: DbClient,
  key: SourceKey,
  status: RunStatus,
): Promise<void> {
  const { error } = await db
    .from('sources')
    .update({ last_run_at: new Date().toISOString(), last_status: status })
    .eq('key', key);
  if (error) throw new Error(`marquage du run de ${key} : ${error.message}`);
}

/** Taille de lot : c'est aussi le plafond par défaut d'une réponse supabase-js. */
const PAGE_SIZE = 1000;

/**
 * Tous les `external_id` déjà en base pour une source.
 *
 * Sert au delta des sources scrapées : une offre déjà connue ne vaut pas qu'on
 * repaie sa page de détail. La pagination n'est pas facultative — supabase-js
 * plafonne une réponse à 1 000 lignes, et une source plus grosse verrait le
 * reste de ses offres traité comme inconnu à chaque passe.
 */
export async function loadKnownExternalIds(
  db: DbClient,
  source: SourceKey,
): Promise<Set<string>> {
  const known = new Set<string>();

  for (let from = 0;; from += PAGE_SIZE) {
    const { data, error } = await db
      .from('offers')
      .select('external_id')
      .eq('source', source)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`lecture des offres connues de ${source} : ${error.message}`);

    const rows = (data ?? []) as { external_id: string }[];
    for (const row of rows) known.add(row.external_id);
    if (rows.length < PAGE_SIZE) return known;
  }
}
