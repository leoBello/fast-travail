import { assert, assertEquals, assertRejects } from '@std/assert';
import type { FetchedPage, PageFetcher } from '../../_shared/http.ts';
import type { SearchQueryRow } from '../../../_shared/types.ts';
import { externalIdFromPath, facetOf, fetchFreeWorkOffers } from '../client.ts';

const listing = await Deno.readTextFile(
  new URL('./fixtures/listing-react-sort-date-page1.html', import.meta.url),
);
const detail = await Deno.readTextFile(
  new URL('./fixtures/job-permanent-salary.html', import.meta.url),
);

function queryRow(extra: Record<string, unknown>): SearchQueryRow {
  return {
    id: 1,
    source: 'free_work',
    label: 'fw:skill:react',
    keywords: null,
    commune_insee: null,
    radius_km: null,
    extra_params: extra,
    published_since_days: 3,
    priority: 60,
    enabled: true,
  };
}

/** Double de PageFetcher : rend le listing pour toute URL de listing, le détail sinon. */
function fetcherFor(pages: Map<string, string>, seen: string[] = []): PageFetcher {
  return {
    get(url: string): Promise<FetchedPage> {
      seen.push(url);
      const body = pages.get(url);
      if (body === undefined) return Promise.reject(new Error(`HTTP 404 sur ${url}`));
      return Promise.resolve({ url, status: 200, body });
    },
  };
}

const BASE = 'https://www.free-work.com';
const LISTING_1 = `${BASE}/fr/tech-it/jobs/react?sort=date&page=1`;
const DETAIL_PATH =
  '/fr/tech-it/job-mission/developpeur-front-end-javascript-node-react-angular-vue/developpeur-net-react-h-f-59';

Deno.test('facetOf lit la facette dans extra_params', () => {
  assertEquals(facetOf(queryRow({ facet: 'react' })), 'react');
});

Deno.test('facetOf refuse bruyamment une requête sans facette', () => {
  // Le silence serait pire : la requête collecterait la mauvaise page sans le dire.
  let thrown: Error | null = null;
  try {
    facetOf(queryRow({}));
  } catch (e) {
    thrown = e instanceof Error ? e : new Error(String(e));
  }
  assert(thrown, 'aucune erreur levée');
  assert(thrown.message.includes('facet'));
});

Deno.test('externalIdFromPath garde le chemin sous /job-mission/', () => {
  assertEquals(
    externalIdFromPath('/fr/tech-it/job-mission/developpeur-python/x-1'),
    'developpeur-python/x-1',
  );
});

Deno.test('le listing réel donne 16 offres et une seule page suffit', async () => {
  const seen: string[] = [];
  const pages = new Map([[LISTING_1, listing], [`${BASE}${DETAIL_PATH}`, detail]]);
  // Toutes les offres sont connues sauf une : une seule page de détail doit être lue.
  const known = new Set(
    [...listing.matchAll(/href="\/fr\/tech-it\/job-mission\/([^"]+)"/g)].map((m) => m[1]),
  );
  known.delete(externalIdFromPath(DETAIL_PATH));

  const result = await fetchFreeWorkOffers({
    fetcher: fetcherFor(pages, seen),
    baseUrl: BASE,
    maxListingPages: 1,
    windowDays: 3,
    knownExternalIds: known,
    refetchKnown: false,
    now: () => new Date('2026-09-08T12:00:00Z'),
  }, queryRow({ facet: 'react' }));

  assertEquals(result.offers.length, 1);
  assertEquals(result.httpStatus, 200);
  assertEquals(result.totalAvailable, 196);
  assertEquals(seen.length, 2, 'une page de listing et une page de détail');
});

Deno.test('l’offre récoltée porte son chemin, son URL et son JobPosting', async () => {
  const pages = new Map([[LISTING_1, listing], [`${BASE}${DETAIL_PATH}`, detail]]);
  const known = new Set(
    [...listing.matchAll(/href="\/fr\/tech-it\/job-mission\/([^"]+)"/g)].map((m) => m[1]),
  );
  known.delete(externalIdFromPath(DETAIL_PATH));

  const result = await fetchFreeWorkOffers({
    fetcher: fetcherFor(pages),
    baseUrl: BASE,
    maxListingPages: 1,
    windowDays: 3,
    knownExternalIds: known,
    refetchKnown: false,
    now: () => new Date('2026-09-08T12:00:00Z'),
  }, queryRow({ facet: 'react' }));

  const raw = result.offers[0] as {
    path: string;
    url: string;
    jobPosting: Record<string, unknown>;
  };
  assertEquals(raw.path, externalIdFromPath(DETAIL_PATH));
  assertEquals(raw.url, `${BASE}${DETAIL_PATH}`);
  assertEquals(raw.jobPosting['@type'], 'JobPosting');
});

Deno.test('une fenêtre dépassée arrête le parcours, sans rien tronquer', async () => {
  // Les dates de la fixture vont du 06/09 au 07/09 ; au 2026-10-01, tout est hors
  // fenêtre : la page est lue, aucune offre n'est récupérée, et truncated reste faux.
  const seen: string[] = [];
  const result = await fetchFreeWorkOffers({
    fetcher: fetcherFor(new Map([[LISTING_1, listing]]), seen),
    baseUrl: BASE,
    maxListingPages: 5,
    windowDays: 3,
    knownExternalIds: new Set(),
    refetchKnown: false,
    now: () => new Date('2026-10-01T12:00:00Z'),
  }, queryRow({ facet: 'react' }));

  assertEquals(result.offers.length, 0);
  assertEquals(result.truncated, false);
  assertEquals(seen.length, 1, 'le parcours s’arrête après la première page');
});

Deno.test('le plafond de pages marque le résultat comme tronqué', async () => {
  // La fixture est servie pour toutes les pages : la fenêtre n'est jamais atteinte,
  // donc c'est le plafond qui arrête — et cela doit se voir dans la télémétrie.
  const pages = new Map([
    [LISTING_1, listing],
    [`${BASE}/fr/tech-it/jobs/react?sort=date&page=2`, listing],
    [`${BASE}${DETAIL_PATH}`, detail],
  ]);
  const known = new Set(
    [...listing.matchAll(/href="\/fr\/tech-it\/job-mission\/([^"]+)"/g)].map((m) => m[1]),
  );

  const result = await fetchFreeWorkOffers({
    fetcher: fetcherFor(pages),
    baseUrl: BASE,
    maxListingPages: 2,
    windowDays: 3,
    knownExternalIds: known,
    refetchKnown: false,
    now: () => new Date('2026-09-08T12:00:00Z'),
  }, queryRow({ facet: 'react' }));

  assertEquals(result.truncated, true);
});

Deno.test('une offre vue sur deux pages ne coûte qu’une requête de détail', async () => {
  // Le listing est vivant et retrié entre deux pages paginées : la même offre
  // peut se retrouver à la fois en page 1 et en page 2. On sert ici la même
  // fixture pour les deux pages afin de le reproduire, et on vérifie que la
  // page de détail n'est demandée qu'une fois — pas deux.
  const seen: string[] = [];
  const pages = new Map([
    [LISTING_1, listing],
    [`${BASE}/fr/tech-it/jobs/react?sort=date&page=2`, listing],
    [`${BASE}${DETAIL_PATH}`, detail],
  ]);
  const known = new Set(
    [...listing.matchAll(/href="\/fr\/tech-it\/job-mission\/([^"]+)"/g)].map((m) => m[1]),
  );
  known.delete(externalIdFromPath(DETAIL_PATH));

  const result = await fetchFreeWorkOffers({
    fetcher: fetcherFor(pages, seen),
    baseUrl: BASE,
    maxListingPages: 2,
    windowDays: 3,
    knownExternalIds: known,
    refetchKnown: false,
    now: () => new Date('2026-09-08T12:00:00Z'),
  }, queryRow({ facet: 'react' }));

  assertEquals(result.offers.length, 1);
  const detailRequests = seen.filter((url) => url === `${BASE}${DETAIL_PATH}`);
  assertEquals(detailRequests.length, 1, 'la page de détail ne doit être demandée qu’une fois');
});

Deno.test('une page de listing absente remonte l’erreur', async () => {
  await assertRejects(
    () =>
      fetchFreeWorkOffers({
        fetcher: fetcherFor(new Map()),
        baseUrl: BASE,
        maxListingPages: 1,
        windowDays: 3,
        knownExternalIds: new Set(),
        refetchKnown: false,
      }, queryRow({ facet: 'react' })),
    Error,
    '404',
  );
});

Deno.test('page 1 sans aucun chemin d’offre est un changement de balisage, pas un résultat vide', async () => {
  // Une facette saine rend toujours une seizaine de chemins en page 1 : zéro
  // n'est jamais un « pas de résultat », c'est le balisage qui a bougé.
  const noOffers = '<html><body><p>Aucun résultat.</p></body></html>';
  const err = await assertRejects(
    () =>
      fetchFreeWorkOffers({
        fetcher: fetcherFor(new Map([[LISTING_1, noOffers]])),
        baseUrl: BASE,
        maxListingPages: 1,
        windowDays: 3,
        knownExternalIds: new Set(),
        refetchKnown: false,
        now: () => new Date('2026-09-08T12:00:00Z'),
      }, queryRow({ facet: 'react' })),
    Error,
  );
  assert(err.message.includes('react'), `le message doit nommer la facette : ${err.message}`);
  assert(err.message.includes(LISTING_1), `le message doit nommer l’URL : ${err.message}`);
});

Deno.test('une page suivante sans chemin d’offre arrête le parcours en silence', async () => {
  // Contrairement à la page 1, une page ultérieure vide est une fin de
  // parcours légitime (on a dépassé la dernière page de résultats) : pas
  // d’erreur, juste l’arrêt de la boucle avec ce qui a déjà été récolté.
  const noOffers = '<html><body><p>Aucun résultat.</p></body></html>';
  const seen: string[] = [];
  const pages = new Map([
    [LISTING_1, listing],
    [`${BASE}/fr/tech-it/jobs/react?sort=date&page=2`, noOffers],
    [`${BASE}${DETAIL_PATH}`, detail],
  ]);
  const known = new Set(
    [...listing.matchAll(/href="\/fr\/tech-it\/job-mission\/([^"]+)"/g)].map((m) => m[1]),
  );
  known.delete(externalIdFromPath(DETAIL_PATH));

  const result = await fetchFreeWorkOffers({
    fetcher: fetcherFor(pages, seen),
    baseUrl: BASE,
    maxListingPages: 5,
    windowDays: 3,
    knownExternalIds: known,
    refetchKnown: false,
    now: () => new Date('2026-09-08T12:00:00Z'),
  }, queryRow({ facet: 'react' }));

  assertEquals(result.offers.length, 1);
  assertEquals(result.truncated, false);
  assertEquals(
    seen.filter((url) => url === `${BASE}/fr/tech-it/jobs/react?sort=date&page=2`).length,
    1,
  );
});
