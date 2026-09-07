import { type CollectionMode, type SearchQueryRow, WINDOW_DAYS } from '../_shared/types.ts';

const SEARCH_URL = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';

/** Plafond dur de l'API : range ne dépasse pas 1000-1149. */
export const FT_MAX_RESULTS = 1150;
export const FT_PAGE_SIZE = 150;

/** Valeurs acceptées par publieeDepuis. La fenêtre demandée est arrondie à la borne supérieure. */
const ALLOWED_WINDOWS = [1, 3, 7, 14, 31];

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1_000;

export interface ContentRange {
  start: number;
  end: number;
  total: number;
}

export function parseContentRange(header: string | null): ContentRange | null {
  if (!header) return null;
  const match = header.match(/(\d+)\s*-\s*(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]), total: Number(match[3]) };
}

function windowFor(mode: CollectionMode): number {
  const wanted = WINDOW_DAYS[mode];
  return ALLOWED_WINDOWS.find((v) => v >= wanted) ?? 31;
}

export function buildSearchParams(
  query: SearchQueryRow,
  mode: CollectionMode,
  range: string,
): URLSearchParams {
  const params = new URLSearchParams();
  if (query.keywords) params.set('motsCles', query.keywords);
  if (query.commune_insee) params.set('commune', query.commune_insee);
  if (query.radius_km !== null) params.set('distance', String(query.radius_km));
  params.set('publieeDepuis', String(windowFor(mode)));
  params.set('range', range);

  for (const [key, value] of Object.entries(query.extra_params ?? {})) {
    if (value !== null && value !== undefined) params.set(key, String(value));
  }
  return params;
}

export interface FtPage {
  offers: unknown[];
  contentRange: ContentRange | null;
  httpStatus: number;
}

async function fetchPageOnce(
  query: SearchQueryRow,
  mode: CollectionMode,
  token: string,
  rangeStart: number,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const rangeEnd = rangeStart + FT_PAGE_SIZE - 1;
  const params = buildSearchParams(query, mode, `${rangeStart}-${rangeEnd}`);
  return await fetchImpl(`${SEARCH_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
}

export async function fetchPage(args: {
  query: SearchQueryRow;
  mode: CollectionMode;
  token: string;
  rangeStart: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}): Promise<FtPage> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const sleep = args.sleepImpl ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetchPageOnce(
      args.query,
      args.mode,
      args.token,
      args.rangeStart,
      fetchImpl,
    );

    // 403 : refus, pas une erreur transitoire. Aucun retry.
    if (response.status === 403) {
      throw new Error(`France Travail a refusé la requête (403) — ${args.query.label}`);
    }

    if (response.status === 429) {
      if (attempt === MAX_RETRIES) {
        throw new Error(`France Travail : quota dépassé (429) après ${MAX_RETRIES} essais`);
      }
      await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt));
      continue;
    }

    // 204 : aucune offre pour ces critères. Cas normal, pas une erreur.
    if (response.status === 204) {
      return { offers: [], contentRange: null, httpStatus: 204 };
    }

    if (!response.ok) {
      throw new Error(`France Travail a répondu ${response.status} — ${args.query.label}`);
    }

    const payload = await response.json() as { resultats?: unknown[] };
    return {
      offers: payload.resultats ?? [],
      contentRange: parseContentRange(response.headers.get('content-range')),
      httpStatus: response.status,
    };
  }

  throw new Error('France Travail : boucle de retry épuisée');
}

export async function fetchAllPages(args: {
  query: SearchQueryRow;
  mode: CollectionMode;
  token: string;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}): Promise<{
  offers: unknown[];
  totalAvailable: number | null;
  truncated: boolean;
  httpStatus: number;
}> {
  const collected: unknown[] = [];
  let totalAvailable: number | null = null;
  let httpStatus = 200;

  for (let start = 0; start < FT_MAX_RESULTS; start += FT_PAGE_SIZE) {
    // FT_MAX_RESULTS n'est pas un multiple de FT_PAGE_SIZE (1150 / 150) : la
    // dernière page est ramenée à 1000-1149 pour ne jamais demander au-delà
    // du plafond dur de l'API (range max 1000-1149).
    const rangeStart = Math.min(start, FT_MAX_RESULTS - FT_PAGE_SIZE);
    const page = await fetchPage({ ...args, rangeStart });
    httpStatus = page.httpStatus;

    if (page.contentRange) totalAvailable = page.contentRange.total;
    else if (page.httpStatus === 204 && totalAvailable === null) totalAvailable = 0;

    // Ce recadrage peut faire chevaucher la dernière page avec la précédente
    // (ex. 900-1049 puis 1000-1149) : on ne réinjecte que les offres neuves.
    const overlap = Math.max(0, collected.length - rangeStart);
    collected.push(...page.offers.slice(overlap));

    if (page.offers.length === 0) break;
    if (totalAvailable !== null && collected.length >= totalAvailable) break;
    if (rangeStart !== start) break;
  }

  return {
    offers: collected,
    totalAvailable,
    // Le vrai total dépasse ce que l'API veut bien paginer : la requête
    // doit être découpée ou sa fenêtre réduite.
    truncated: totalAvailable !== null && totalAvailable > FT_MAX_RESULTS,
    httpStatus,
  };
}
