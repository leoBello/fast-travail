import { assertEquals } from '@std/assert';
import { buildSearchParams, fetchAllPages, FT_MAX_RESULTS, parseContentRange } from '../client.ts';
import type { SearchQueryRow } from '../../_shared/types.ts';

const localQuery: SearchQueryRow = {
  id: 1,
  source: 'france_travail',
  label: 'ft:local:react',
  keywords: 'React',
  commune_insee: '13055',
  radius_km: 40,
  extra_params: {},
  published_since_days: 3,
  priority: 10,
  enabled: true,
};

const remoteQuery: SearchQueryRow = {
  ...localQuery,
  id: 2,
  label: 'ft:remote:react',
  commune_insee: null,
  radius_km: null,
};

Deno.test('parseContentRange extrait début, fin et total', () => {
  assertEquals(parseContentRange('offres 0-49/287543'), { start: 0, end: 49, total: 287543 });
  assertEquals(parseContentRange('offres 150-299/1200'), { start: 150, end: 299, total: 1200 });
});

Deno.test('parseContentRange renvoie null sur en-tête absent ou illisible', () => {
  assertEquals(parseContentRange(null), null);
  assertEquals(parseContentRange(''), null);
  assertEquals(parseContentRange('nawak'), null);
});

Deno.test('buildSearchParams construit la passe locale avec commune et distance', () => {
  const params = buildSearchParams(localQuery, 'delta', '0-149');

  assertEquals(params.get('motsCles'), 'React');
  assertEquals(params.get('commune'), '13055');
  assertEquals(params.get('distance'), '40');
  assertEquals(params.get('publieeDepuis'), '3');
  assertEquals(params.get('range'), '0-149');
});

Deno.test('buildSearchParams omet commune et distance sur la passe nationale', () => {
  const params = buildSearchParams(remoteQuery, 'delta', '0-149');

  assertEquals(params.get('motsCles'), 'React');
  assertEquals(params.has('commune'), false);
  assertEquals(params.has('distance'), false);
});

Deno.test('buildSearchParams force la fenêtre à 31 jours en backfill', () => {
  // publieeDepuis de l'API n'accepte que 1, 3, 7, 14 ou 31.
  assertEquals(buildSearchParams(localQuery, 'backfill', '0-149').get('publieeDepuis'), '31');
});

Deno.test('buildSearchParams fusionne extra_params', () => {
  const withExtra: SearchQueryRow = { ...localQuery, extra_params: { typeContrat: 'CDI' } };
  assertEquals(buildSearchParams(withExtra, 'delta', '0-149').get('typeContrat'), 'CDI');
});

/** Construit un faux fetch renvoyant `total` offres, paginées comme l'API réelle. */
function pagedFetch(total: number, calls: { count: number; ranges: string[] }): typeof fetch {
  return ((url: string | URL) => {
    calls.count += 1;
    const range = new URL(String(url)).searchParams.get('range') ?? '';
    calls.ranges.push(range);

    const [startStr, endStr] = range.split('-');
    const start = Number(startStr);
    const end = Number(endStr);
    const count = Math.max(0, Math.min(end, total - 1) - start + 1);
    const offers = Array.from({ length: count }, (_, i) => ({ id: `OFFER-${start + i}` }));

    if (count === 0) return Promise.resolve(new Response(null, { status: 204 }));

    return Promise.resolve(
      new Response(JSON.stringify({ resultats: offers }), {
        status: 206,
        headers: {
          'content-type': 'application/json',
          'content-range': `offres ${start}-${start + count - 1}/${total}`,
        },
      }),
    );
  }) as unknown as typeof fetch;
}

const noSleep = () => Promise.resolve();

Deno.test('fetchAllPages ramène une page unique quand le total tient dedans', async () => {
  const calls = { count: 0, ranges: [] as string[] };
  const result = await fetchAllPages({
    query: localQuery,
    mode: 'delta',
    token: 'tok',
    fetchImpl: pagedFetch(42, calls),
    sleepImpl: noSleep,
  });

  assertEquals(result.offers.length, 42);
  assertEquals(result.totalAvailable, 42);
  assertEquals(result.truncated, false);
  assertEquals(calls.count, 1);
});

Deno.test("fetchAllPages pagine jusqu'à épuisement du total", async () => {
  const calls = { count: 0, ranges: [] as string[] };
  const result = await fetchAllPages({
    query: localQuery,
    mode: 'delta',
    token: 'tok',
    fetchImpl: pagedFetch(370, calls),
    sleepImpl: noSleep,
  });

  assertEquals(result.offers.length, 370);
  assertEquals(calls.ranges, ['0-149', '150-299', '300-449']);
  assertEquals(result.truncated, false);
});

Deno.test("fetchAllPages s'arrête au plafond et signale la troncature", async () => {
  const calls = { count: 0, ranges: [] as string[] };
  const result = await fetchAllPages({
    query: localQuery,
    mode: 'delta',
    token: 'tok',
    fetchImpl: pagedFetch(50_000, calls),
    sleepImpl: noSleep,
  });

  // Le plafond dur de l'API est 1150 : on ne demande jamais au-delà.
  assertEquals(result.offers.length, FT_MAX_RESULTS);
  assertEquals(result.totalAvailable, 50_000);
  assertEquals(result.truncated, true);
  assertEquals(calls.ranges.at(-1), '1000-1149');
});

Deno.test('fetchAllPages traite un 204 comme un résultat vide, sans erreur', async () => {
  const calls = { count: 0, ranges: [] as string[] };
  const result = await fetchAllPages({
    query: localQuery,
    mode: 'delta',
    token: 'tok',
    fetchImpl: pagedFetch(0, calls),
    sleepImpl: noSleep,
  });

  assertEquals(result.offers.length, 0);
  assertEquals(result.totalAvailable, 0);
  assertEquals(result.httpStatus, 204);
});

Deno.test('fetchAllPages réessaie après un 429 puis réussit', async () => {
  let seen = 0;
  const flaky = ((url: string | URL) => {
    seen += 1;
    if (seen === 1) {
      return Promise.resolve(new Response('trop de requêtes', { status: 429 }));
    }
    const range = new URL(String(url)).searchParams.get('range') ?? '';
    const [s] = range.split('-').map(Number);
    return Promise.resolve(
      new Response(JSON.stringify({ resultats: [{ id: 'OFFER-1' }] }), {
        status: 206,
        headers: { 'content-range': `offres ${s}-${s}/1` },
      }),
    );
  }) as unknown as typeof fetch;

  const result = await fetchAllPages({
    query: localQuery,
    mode: 'delta',
    token: 'tok',
    fetchImpl: flaky,
    sleepImpl: noSleep,
  });

  assertEquals(result.offers.length, 1);
  assertEquals(seen, 2);
});

Deno.test('fetchAllPages abandonne sur 403 sans réessayer', async () => {
  let seen = 0;
  const forbidden = (() => {
    seen += 1;
    return Promise.resolve(new Response('interdit', { status: 403 }));
  }) as unknown as typeof fetch;

  let message = '';
  try {
    await fetchAllPages({
      query: localQuery,
      mode: 'delta',
      token: 'tok',
      fetchImpl: forbidden,
      sleepImpl: noSleep,
    });
  } catch (e) {
    message = (e as Error).message;
  }

  // Un 403 est un refus, pas une erreur transitoire : aucun retry.
  assertEquals(seen, 1);
  assertEquals(message.includes('403'), true);
});
