import { assert, assertEquals } from '@std/assert';
import type { FetchedPage, PageFetcher } from '../../_shared/http.ts';
import type { SearchQueryRow } from '../../../_shared/types.ts';
import { fetchCollectiveOffers } from '../client.ts';

const page1 = await Deno.readTextFile(
  new URL('./fixtures/jobs-fr-page1.html', import.meta.url),
);

const QUERY: SearchQueryRow = {
  id: 7,
  source: 'collective',
  label: 'collective:all',
  keywords: null,
  commune_insee: null,
  radius_km: null,
  extra_params: {},
  published_since_days: 3,
  priority: 10,
  enabled: true,
};

const BASE = 'https://www.collective.work';

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

Deno.test('la page réelle rend 30 missions et le total du site', async () => {
  const result = await fetchCollectiveOffers({
    fetcher: fetcherFor(new Map([[`${BASE}/jobs/fr`, page1]])),
    baseUrl: BASE,
    maxPages: 1,
    windowDays: 3,
    now: () => new Date('2026-09-08T12:00:00Z'),
  }, QUERY);

  assertEquals(result.offers.length, 30);
  assertEquals(result.totalAvailable, 6544);
  assertEquals(result.httpStatus, 200);
});

Deno.test('la première page n’emporte pas de paramètre page', async () => {
  const seen: string[] = [];
  await fetchCollectiveOffers({
    fetcher: fetcherFor(new Map([[`${BASE}/jobs/fr`, page1]]), seen),
    baseUrl: BASE,
    maxPages: 1,
    windowDays: 3,
    now: () => new Date('2026-09-08T12:00:00Z'),
  }, QUERY);

  assertEquals(seen, [`${BASE}/jobs/fr`]);
});

Deno.test('le parcours s’arrête quand la page entière est hors fenêtre', async () => {
  const seen: string[] = [];
  const result = await fetchCollectiveOffers({
    fetcher: fetcherFor(new Map([[`${BASE}/jobs/fr`, page1]]), seen),
    baseUrl: BASE,
    maxPages: 10,
    windowDays: 3,
    now: () => new Date('2026-11-01T12:00:00Z'),
  }, QUERY);

  // La page est lue — c'est ce qui permet de conclure — mais rien ne suit.
  assertEquals(seen.length, 1);
  assertEquals(result.offers.length, 30);
  assertEquals(result.truncated, false);
});

Deno.test('le plafond de pages marque le résultat comme tronqué', async () => {
  const pages = new Map([
    [`${BASE}/jobs/fr`, page1],
    [`${BASE}/jobs/fr?page=2`, page1],
  ]);
  const result = await fetchCollectiveOffers({
    fetcher: fetcherFor(pages),
    baseUrl: BASE,
    maxPages: 2,
    windowDays: 3,
    now: () => new Date('2026-09-08T12:00:00Z'),
  }, QUERY);

  assertEquals(result.truncated, true);
});

Deno.test('une page sans payload exploitable remonte une erreur explicite', async () => {
  const pages = new Map([[`${BASE}/jobs/fr`, '<html><body>rien</body></html>']]);
  let message = '';
  try {
    await fetchCollectiveOffers({
      fetcher: fetcherFor(pages),
      baseUrl: BASE,
      maxPages: 1,
      windowDays: 3,
    }, QUERY);
  } catch (e) {
    message = e instanceof Error ? e.message : String(e);
  }
  assert(message.includes('__NEXT_DATA__'), `message inattendu : ${message}`);
});
