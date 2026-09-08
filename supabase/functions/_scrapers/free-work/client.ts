// Client Free-Work. Deux surfaces, deux usages strictement séparés :
//
//  - le LISTING (/fr/tech-it/jobs/<facette>?sort=date&page=N) ne sert qu'à
//    récolter des URL et à savoir quand s'arrêter. C'est du Vue SSR à classes
//    data-v-* volatiles : en extraire un champ serait construire une dette.
//  - la page de DÉTAIL porte un JobPosting en JSON-LD, et c'est de là que vient
//    absolument tout ce qui sera stocké.
//
// Le tri par date est un vrai paramètre serveur, mesuré le 2026-09-08 :
// <option value="date" selected> revient dans la réponse et les 16 <time> de la
// page sont alors décroissants. Sans lui, ils vont du 27/08 au 07/09 et aucun
// arrêt anticipé n'est possible.

import type { PageFetcher } from '../_shared/http.ts';
import { extractJsonLd } from '../_shared/html.ts';
import { log } from '../../_shared/logger.ts';
import type { FetchResult } from '../../_shared/run-collection.ts';
import type { SearchQueryRow } from '../../_shared/types.ts';

const JOB_PATH = /href="(\/fr\/tech-it\/job-mission\/[^"]+)"/g;
/** Date de publication affichée sur une carte, au format MM/JJ/AAAA. */
const CARD_DATE = /<time>(\d{2})\/(\d{2})\/(\d{4})<\/time>/g;
/**
 * Nombre total d'offres de la facette, affiché par le site. Télémétrie seulement.
 *
 * Le nombre et le mot « résultats » sont séparés par du balisage — mesuré sur la
 * page réelle : `<strong class="font-semibold">196</strong><!--]--> résultats.`
 * Un `\s*` seul entre les deux ne matcherait pas ; il faut tolérer les balises et
 * commentaires HTML intercalés.
 */
const TOTAL = /(\d[\d\s ]*)(?:<[^>]*>|\s)*résultats?/i;
const PATH_PREFIX = '/fr/tech-it/job-mission/';
const MS_PER_DAY = 86_400_000;

export interface FreeWorkRawOffer {
  /** Chemin sous /job-mission/ : c'est l'external_id. */
  path: string;
  url: string;
  jobPosting: Record<string, unknown>;
}

export interface FreeWorkClientConfig {
  fetcher: PageFetcher;
  baseUrl: string;
  maxListingPages: number;
  windowDays: number;
  /** external_id déjà en base pour free_work : on ne repaie pas leur page de détail. */
  knownExternalIds: ReadonlySet<string>;
  /** backfill : on relit le détail de TOUTES les offres, pour corriger un mapper. */
  refetchKnown: boolean;
  now?: () => Date;
}

/** La facette est un segment de chemin, et `extra_params.facet` en est la seule source. */
export function facetOf(query: SearchQueryRow): string {
  const facet = query.extra_params?.facet;
  if (typeof facet !== 'string' || facet.length === 0) {
    throw new Error(`requête ${query.label} : extra_params.facet manquant ou invalide`);
  }
  return facet;
}

export function externalIdFromPath(path: string): string {
  if (!path.startsWith(PATH_PREFIX)) {
    throw new Error(`chemin d'offre inattendu : ${path}`);
  }
  return path.slice(PATH_PREFIX.length);
}

function parseCardDates(html: string): Date[] {
  const dates: Date[] = [];
  for (const [, month, day, year] of html.matchAll(CARD_DATE)) {
    dates.push(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
  }
  return dates;
}

function harvestPaths(html: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const [, path] of html.matchAll(JOB_PATH)) {
    if (seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }
  return paths;
}

function parseTotal(html: string): number | null {
  const match = html.match(TOTAL);
  if (!match) return null;
  const digits = match[1].replace(/\D/g, '');
  return digits.length > 0 ? Number(digits) : null;
}

function jobPostingOf(html: string): Record<string, unknown> | null {
  for (const block of extractJsonLd(html)) {
    if (typeof block !== 'object' || block === null) continue;
    const record = block as Record<string, unknown>;
    if (record['@type'] === 'JobPosting') return record;
  }
  return null;
}

export async function fetchFreeWorkOffers(
  cfg: FreeWorkClientConfig,
  query: SearchQueryRow,
): Promise<FetchResult> {
  const facet = facetOf(query);
  const now = (cfg.now ?? (() => new Date()))();
  const windowStart = new Date(now.getTime() - cfg.windowDays * MS_PER_DAY);

  const paths: string[] = [];
  // Le listing est vivant et retrié entre deux fetchs paginés : une même offre
  // se retrouve couramment à cheval sur deux pages. `harvestPaths` ne déduplique
  // que dans une page ; ici on déduplique sur tout le parcours, en gardant le
  // premier passage de chaque chemin — sinon sa page de détail est payée deux fois.
  const seenPaths = new Set<string>();
  let totalAvailable: number | null = null;
  let truncated = false;

  for (let page = 1; page <= cfg.maxListingPages; page++) {
    const url = `${cfg.baseUrl}/fr/tech-it/jobs/${facet}?sort=date&page=${page}`;
    const listing = await cfg.fetcher.get(url);

    if (page === 1) totalAvailable = parseTotal(listing.body);

    const pagePaths = harvestPaths(listing.body);
    if (pagePaths.length === 0) {
      // Zéro chemin en page 1 n'est jamais ambigu : les chemins sont récoltés
      // AVANT le filtre des identifiants connus, donc une facette saine en
      // rend toujours une seizaine. Zéro veut dire que le balisage a bougé,
      // pas qu'il n'y a rien à collecter — sans quoi le run se dirait un
      // succès avec fetched: 0 et aucune erreur. Une page ultérieure vide
      // reste, elle, une fin de parcours légitime : on a dépassé la dernière
      // page de résultats.
      if (page === 1) {
        throw new Error(
          `aucun chemin d'offre en page 1 de la facette « ${facet} » : le balisage a-t-il changé ? ${url}`,
        );
      }
      break;
    }

    // Règle unique, et elle vaut pour les deux scrapers : on ne paie jamais une
    // requête pour une offre qu'on sait déjà hors fenêtre, et on ne jette jamais
    // une offre déjà reçue. Ici chaque offre coûte une page de détail, donc une
    // page entièrement hors fenêtre est abandonnée AVANT d'être récoltée — et le
    // tri étant décroissant, les suivantes le sont aussi. Chez Collective, où la
    // page porte déjà les missions entières, la même règle conduit à l'inverse :
    // on garde ce qui est arrivé.
    //
    // Sans <time> exploitable on ne conclut pas : le parcours ira au plafond,
    // dégradé mais jamais faux.
    const dates = parseCardDates(listing.body);
    const newest = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null;
    if (newest !== null && newest < windowStart) break;

    for (const path of pagePaths) {
      if (seenPaths.has(path)) continue;
      seenPaths.add(path);
      paths.push(path);
    }

    if (page === cfg.maxListingPages) truncated = true;
  }

  const offers: FreeWorkRawOffer[] = [];
  for (const path of paths) {
    const externalId = externalIdFromPath(path);
    if (!cfg.refetchKnown && cfg.knownExternalIds.has(externalId)) continue;

    const url = `${cfg.baseUrl}${path}`;
    const detail = await cfg.fetcher.get(url);
    const jobPosting = jobPostingOf(detail.body);
    if (!jobPosting) {
      // Ni silence ni interruption : la page est signalée et le parcours continue.
      log('warn', 'page d’offre sans JobPosting', { source: 'free_work', url });
      continue;
    }
    offers.push({ path: externalId, url, jobPosting });
  }

  return { offers, totalAvailable, truncated, httpStatus: 200 };
}
