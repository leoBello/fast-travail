import { type CollectionMode, type SearchQueryRow, WINDOW_DAYS } from '../_shared/types.ts';
import { IMPLIES_REMOTE_KEY } from './mapper.ts';

const BASE = 'https://api.adzuna.com/v1/api/jobs/fr/search';

/** Maximum accepté par l'API Adzuna. */
export const ADZUNA_PAGE_SIZE = 50;
/** Garde-fou : Adzuna ne documente pas de plafond, on ne descend pas plus loin. */
const MAX_PAGES = 10;
/** Au-delà, une requête est tronquée sans qu'on l'ait demandé : voir fetchAllAdzunaPages. */
const MAX_FETCHABLE = MAX_PAGES * ADZUNA_PAGE_SIZE;

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

// --- Liste blanche des clés admises dans extra_params ---
//
// Mesuré contre l'API réelle : un paramètre inconnu ne dégrade pas la requête Adzuna,
// il la fait échouer en HTTP 400 (constaté avec `implies_remote` transmis tel quel).
// Une liste blanche échoue fermée — un paramètre oublié dans une liste noire serait,
// lui, transmis et casserait la requête en silence à la prochaine addition. Mais une
// liste blanche trop étroite re-verrouille en dur un axe que CLAUDE.md déclare réglable
// en base (« les trois axes réglables — rayon, matrice de requêtes, lexique — sont des
// lignes en base, jamais du code ») : elle doit donc couvrir tout le vocabulaire de
// recherche d'Adzuna, pas seulement ce qu'utilise la matrice du jour.
//
// Trois catégories, chacune avec sa raison d'être :
//
// 1. Paramètres d'URL Adzuna transmissibles librement — réglables par un simple
//    `UPDATE search_queries` sans toucher au code.
const ADZUNA_URL_PARAMS = new Set([
  'what',
  'what_or',
  'what_phrase',
  'what_exclude',
  'title_only',
  'category',
  'company',
  'salary_min',
  'salary_max',
  'salary_include_unknown',
  'full_time',
  'part_time',
  'contract',
  'permanent',
  'sort_by',
  'sort_dir',
]);
// 2. Paramètres possédés par le client (construits plus haut dans buildAdzunaUrl) ou par
//    une colonne dédiée de `search_queries` : les admettre depuis extra_params créerait
//    une deuxième source de vérité pour la même valeur, ou dupliquerait un axe déjà
//    réglable ailleurs. Interdits, avec le nom de ce qu'il faut utiliser à la place —
//    sinon celui qui règle la matrice en base ne saurait pas quoi corriger.
const OWNED_PARAM_HINTS: Readonly<Record<string, string>> = {
  app_id: 'porté par AdzunaConfig, pas par extra_params',
  app_key: 'porté par AdzunaConfig, pas par extra_params',
  results_per_page: 'fixé par ADZUNA_PAGE_SIZE, pas par extra_params',
  page: 'porté par le paramètre page de buildAdzunaUrl, pas par extra_params',
  what_and: 'colonne search_queries.keywords',
  where: 'colonne search_queries.commune_insee',
  distance: 'colonne search_queries.radius_km',
  max_days_old: 'dérivé du mode de collecte (WINDOW_DAYS), pas de extra_params',
};
// 3. Métadonnées destinées au mapper (provenanceOf dans mapper.ts), jamais transmises à
//    l'URL Adzuna.
const KNOWN_NON_URL_KEYS = new Set([IMPLIES_REMOTE_KEY]);

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

  // Trois catégories de clés dans extra_params, voir les constantes de module ci-dessus.
  for (const [key, value] of Object.entries(query.extra_params ?? {})) {
    // 3. Métadonnée pour le mapper : jamais transmise, jamais un échec.
    if (KNOWN_NON_URL_KEYS.has(key)) continue;

    // 2. Possédée par le client ou par une colonne dédiée : le message dit laquelle.
    const hint = OWNED_PARAM_HINTS[key];
    if (hint) {
      throw new Error(
        `extra_params contient "${key}" pour ${query.label}, qui n'est pas un paramètre ` +
          `libre — ${hint}.`,
      );
    }

    // 1. Paramètre d'URL transmissible ; toute autre clé est très probablement une faute
    // de frappe dans la matrice en base (colonne extra_params) : on échoue fort plutôt
    // que de l'ignorer en silence, pour qu'elle reste détectable sans lire le code.
    if (!ADZUNA_URL_PARAMS.has(key)) {
      throw new Error(
        `extra_params contient une clé inconnue "${key}" pour ${query.label} — ` +
          `paramètres d'URL admis : ${[...ADZUNA_URL_PARAMS].join(', ')} ; ` +
          `métadonnées admises : ${[...KNOWN_NON_URL_KEYS].join(', ')}`,
      );
    }
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
}): Promise<
  { offers: unknown[]; totalAvailable: number | null; truncated: boolean; httpStatus: number }
> {
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

    // Inatteignable : la boucle interne ne sort qu'en jetant, ou après avoir affecté
    // payload (`break`). Ce `throw` sert uniquement au narrowing du compilateur, qui ne
    // peut pas savoir que `payload` n'est plus `null` à ce point.
    if (!payload) throw new Error('Adzuna : boucle de retry épuisée');

    if (typeof payload.count === 'number') totalAvailable = payload.count;
    const results = payload.results ?? [];
    collected.push(...results);

    if (results.length === 0) break;
    if (totalAvailable !== null && collected.length >= totalAvailable) break;
  }

  return {
    offers: collected,
    totalAvailable,
    // Aligné sur la sémantique de collect-france-travail/client.ts : le vrai total
    // dépasse ce que MAX_PAGES permet de rapatrier, la requête a perdu des offres.
    truncated: totalAvailable !== null && totalAvailable > MAX_FETCHABLE,
    httpStatus,
  };
}
