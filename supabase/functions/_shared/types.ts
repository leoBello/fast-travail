// Runtime-neutre : aucun accès à l'environnement d'exécution dans ce fichier.
// Ce fichier est importé par les Edge Functions (Deno) ET par les scrapers (Node).

export type SourceKey =
  | 'france_travail'
  | 'adzuna'
  | 'free_work'
  | 'codeur'
  | 'collective'
  | 'kicklox';

export type CollectionMode = 'backfill' | 'delta';
export type RunTrigger = 'cron' | 'manual';
export type RunStatus = 'running' | 'success' | 'partial' | 'failed';

/** Contrat unique produit par toutes les sources. Les noms reflètent les colonnes de `offers`. */
export interface NormalizedOffer {
  source: SourceKey;
  external_id: string;
  url: string | null;
  title: string;
  description: string | null;
  company_name: string | null;
  contract_type: string | null;
  contract_label: string | null;
  city: string | null;
  postal_code: string | null;
  commune_insee: string | null;
  department: string | null;
  latitude: number | null;
  longitude: number | null;
  is_remote: boolean | null;
  remote_label: string | null;
  salary_raw: string | null;
  rate_raw: string | null;
  duration_raw: string | null;
  start_date_raw: string | null;
  experience_raw: string | null;
  /** ISO 8601, ou null si la source ne la fournit pas. */
  published_at: string | null;
  search_origin_insee: string | null;
  search_radius_km: number | null;
  raw: unknown;
}

/**
 * Forme canonique d'une ligne de `collection_query_results`.
 * Source de vérité unique : run-tracker.ts (écriture) et run-collection.ts
 * (construction pendant la boucle de collecte) importent ce type d'ici,
 * pour n'avoir qu'un seul endroit à corriger si la table évolue.
 */
export interface QueryReportLine {
  query_id: number | null;
  unit_label: string;
  http_status: number | null;
  total_available: number | null;
  fetched: number;
  new_offers: number;
  updated_offers: number;
  truncated: boolean;
  duration_ms: number;
  error: string | null;
}

export interface SearchQueryRow {
  id: number;
  source: string;
  label: string;
  keywords: string | null;
  commune_insee: string | null;
  radius_km: number | null;
  extra_params: Record<string, unknown>;
  published_since_days: number;
  priority: number;
  enabled: boolean;
}

/** Fenêtre de collecte en jours, selon le mode. */
export const WINDOW_DAYS: Record<CollectionMode, number> = {
  delta: 3,
  backfill: 31,
};

/**
 * Offre neutre : tous les champs optionnels à null.
 * Les mappers partent de là et ne renseignent que ce que leur source fournit,
 * ce qui garantit qu'aucun champ n'est oublié quand le type évolue.
 */
export function emptyOffer(
  source: SourceKey,
  externalId: string,
  title: string,
): NormalizedOffer {
  return {
    source,
    external_id: externalId,
    title,
    url: null,
    description: null,
    company_name: null,
    contract_type: null,
    contract_label: null,
    city: null,
    postal_code: null,
    commune_insee: null,
    department: null,
    latitude: null,
    longitude: null,
    is_remote: null,
    remote_label: null,
    salary_raw: null,
    rate_raw: null,
    duration_raw: null,
    start_date_raw: null,
    experience_raw: null,
    published_at: null,
    search_origin_insee: null,
    search_radius_km: null,
    raw: null,
  };
}
