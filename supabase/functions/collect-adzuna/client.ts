import { type CollectionMode, type SearchQueryRow, WINDOW_DAYS } from '../_shared/types.ts';

const BASE = 'https://api.adzuna.com/v1/api/jobs/fr/search';

/** Maximum accepté par l'API Adzuna. */
export const ADZUNA_PAGE_SIZE = 50;
/** Garde-fou : Adzuna ne documente pas de plafond, on ne descend pas plus loin. */
const MAX_PAGES = 10;

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1_000;

/**
 * Adzuna ne connaît pas les codes INSEE : on traduit vers un nom de localité.
 * Les codes utilisés dans search_queries doivent figurer ici.
 */
const INSEE_TO_PLACE: Record<string, string> = {
  '13055': 'Marseille',
  '13001': 'Aix-en-Provence',
};

export interface AdzunaConfig {
  appId: string;
  appKey: string;
}

export function buildAdzunaUrl(
  cfg: AdzunaConfig,
  query: SearchQueryRow,
  mode: CollectionMode,
  page: number,
): string {
  const params = new URLSearchParams({
    app_id: cfg.appId,
    app_key: cfg.appKey,
    results_per_page: String(ADZUNA_PAGE_SIZE),
    max_days_old: String(WINDOW_DAYS[mode]),
    'content-type': 'application/json',
  });

  // `what` n'est PAS un ET logique : `what=React télétravail` rend 1 offre la ou
  // `what_and` en rend 313. Sur un mot unique les deux sont strictement
  // identiques (React : 1481 dans les deux cas), donc on utilise `what_and`
  // partout, sans logique conditionnelle.
  if (query.keywords) params.set('what_and', query.keywords);

  if (query.commune_insee) {
    const place = INSEE_TO_PLACE[query.commune_insee];
    if (!place) {
      throw new Error(
        `code INSEE ${query.commune_insee} absent de INSEE_TO_PLACE — ajoute-le dans client.ts`,
      );
    }
    params.set('where', place);
    // Sans `distance`, Adzuna retombe sur un rayon d'environ 5 km : mesure a
    // 36 offres sans le parametre contre 60 avec distance=40.
    if (query.radius_km !== null) params.set('distance', String(query.radius_km));
  }

  // extra_params porte category (axe catégorie) et what_phrase (Résolution A : locution
  // exacte, complémentaire de what_and) — les deux se combinent avec what_and, jamais
  // de logique conditionnelle entre eux.
  for (const [key, value] of Object.entries(query.extra_params ?? {})) {
    if (value !== null && value !== undefined) params.set(key, String(value));
  }

  return `${BASE}/${page}?${params.toString()}`;
}

export async function fetchAllAdzunaPages(args: {
  cfg: AdzunaConfig;
  query: SearchQueryRow;
  mode: CollectionMode;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}): Promise<{ offers: unknown[]; totalAvailable: number | null; httpStatus: number }> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const sleep = args.sleepImpl ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const collected: unknown[] = [];
  let totalAvailable: number | null = null;
  let httpStatus = 200;

  for (let page = 1; page <= MAX_PAGES; page++) {
    let payload: { count?: number; results?: unknown[] } | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetchImpl(buildAdzunaUrl(args.cfg, args.query, args.mode, page));
      httpStatus = response.status;

      if (response.status === 429) {
        if (attempt === MAX_RETRIES) {
          throw new Error(`Adzuna : quota dépassé (429) après ${MAX_RETRIES} essais`);
        }
        await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt));
        continue;
      }
      if (!response.ok) {
        throw new Error(`Adzuna a répondu ${response.status} — ${args.query.label}`);
      }

      payload = await response.json() as { count?: number; results?: unknown[] };
      break;
    }

    if (!payload) throw new Error('Adzuna : boucle de retry épuisée');

    if (typeof payload.count === 'number') totalAvailable = payload.count;
    const results = payload.results ?? [];
    collected.push(...results);

    if (results.length === 0) break;
    if (totalAvailable !== null && collected.length >= totalAvailable) break;
  }

  return { offers: collected, totalAvailable, httpStatus };
}
