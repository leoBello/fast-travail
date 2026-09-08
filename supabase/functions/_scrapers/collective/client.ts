// Client Collective.work.
//
// Le site est un Next.js dont chaque page de listing embarque son propre
// payload : props.pageProps.dehydratedState.queries[0].state.data.results porte
// 30 projets ENTIERS, description comprise. Il n'y a donc aucune page de détail
// à visiter — 30 missions pour une requête.
//
// Mesuré le 2026-09-08, et c'est ce qui dicte la stratégie : les filtres d'URL
// sont IGNORÉS par le serveur (?query=react, ?skills=REACT et
// ?workPreferences=REMOTE rendent tous les trois la page 1 non filtrée, total
// 6544 inchangé) — le filtrage est purement client. Seul ?page=N est honoré.
// L'ordre est décroissant par date malgré sort: "Relevance" : page 1 au
// 2026-09-07, page 50 au 2026-09-01, page 120 au 2026-07-07, page 219 en 2024.

import { extractNextData } from '../_shared/html.ts';
import type { PageFetcher } from '../_shared/http.ts';
import type { FetchResult } from '../../_shared/run-collection.ts';
import type { SearchQueryRow } from '../../_shared/types.ts';

const MS_PER_DAY = 86_400_000;

export interface CollectiveClientConfig {
  fetcher: PageFetcher;
  baseUrl: string;
  maxPages: number;
  windowDays: number;
  now?: () => Date;
}

interface SearchResults {
  projects: unknown[];
  total: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Descend jusqu'aux résultats. Chaque étape est vérifiée : un changement de
 * structure doit produire une erreur nette, écrite dans la télémétrie, et non
 * une collecte silencieusement vide.
 */
function readResults(html: string, url: string): SearchResults {
  const data = extractNextData(html);
  if (!isRecord(data)) throw new Error(`__NEXT_DATA__ absent ou illisible sur ${url}`);

  const props = isRecord(data.props) ? data.props : null;
  const pageProps = props && isRecord(props.pageProps) ? props.pageProps : null;
  const dehydrated = pageProps && isRecord(pageProps.dehydratedState)
    ? pageProps.dehydratedState
    : null;
  const queries = dehydrated && Array.isArray(dehydrated.queries) ? dehydrated.queries : null;
  const first = queries && queries.length > 0 && isRecord(queries[0]) ? queries[0] : null;
  const state = first && isRecord(first.state) ? first.state : null;
  const payload = state && isRecord(state.data) ? state.data : null;
  const results = payload && isRecord(payload.results) ? payload.results : null;

  if (!results || !Array.isArray(results.projects)) {
    throw new Error(`__NEXT_DATA__ sans liste de projets sur ${url}`);
  }

  const pagination = isRecord(results.pagination) ? results.pagination : null;
  const total = pagination && typeof pagination.total === 'number' ? pagination.total : null;

  return { projects: results.projects, total };
}

function newestPublication(projects: unknown[]): Date | null {
  let newest: Date | null = null;
  for (const project of projects) {
    if (!isRecord(project) || typeof project.publishedAt !== 'string') continue;
    const date = new Date(project.publishedAt);
    if (Number.isNaN(date.getTime())) continue;
    if (newest === null || date > newest) newest = date;
  }
  return newest;
}

export async function fetchCollectiveOffers(
  cfg: CollectiveClientConfig,
  _query: SearchQueryRow,
): Promise<FetchResult> {
  const now = (cfg.now ?? (() => new Date()))();
  const windowStart = new Date(now.getTime() - cfg.windowDays * MS_PER_DAY);

  const offers: unknown[] = [];
  let totalAvailable: number | null = null;
  let truncated = false;

  for (let page = 1; page <= cfg.maxPages; page++) {
    const url = page === 1 ? `${cfg.baseUrl}/jobs/fr` : `${cfg.baseUrl}/jobs/fr?page=${page}`;
    const listing = await cfg.fetcher.get(url);
    const { projects, total } = readResults(listing.body, url);

    if (page === 1) totalAvailable = total;
    if (projects.length === 0) break;
    offers.push(...projects);

    // Même règle que chez Free-Work, appliquée à un coût différent : on ne paie
    // jamais une requête pour une offre déjà connue hors fenêtre, et on ne jette
    // jamais une offre déjà reçue. Ici la page PORTE les missions entières : les
    // garder ne coûte rien, alors que chez Free-Work chacune vaudrait une page
    // de détail. L'ordre étant décroissant, aucune page suivante n'est utile.
    const newest = newestPublication(projects);
    if (newest !== null && newest < windowStart) break;

    if (page === cfg.maxPages) truncated = true;
  }

  return { offers, totalAvailable, truncated, httpStatus: 200 };
}
