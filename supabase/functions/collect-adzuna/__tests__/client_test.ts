import { assertEquals, assertMatch, assertThrows } from '@std/assert';
import { ADZUNA_PAGE_SIZE, buildAdzunaUrl, fetchAllAdzunaPages } from '../client.ts';
import type { SearchQueryRow } from '../../_shared/types.ts';

const cfg = { appId: 'app-1', appKey: 'key-1' };

const localQuery: SearchQueryRow = {
  id: 100,
  source: 'adzuna',
  label: 'adzuna:local:react',
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
  id: 101,
  label: 'adzuna:remote:react',
  commune_insee: null,
  radius_km: null,
};

Deno.test('buildAdzunaUrl cible la France et met la page dans le chemin', () => {
  const url = new URL(buildAdzunaUrl(cfg, localQuery, 'delta', 1));

  assertEquals(url.pathname, '/v1/api/jobs/fr/search/1');
  assertEquals(url.searchParams.get('app_id'), 'app-1');
  assertEquals(url.searchParams.get('app_key'), 'key-1');
  // what_and et non what : `what` n'est pas un ET logique.
  assertEquals(url.searchParams.get('what_and'), 'React');
  assertEquals(url.searchParams.has('what'), false);
  assertEquals(url.searchParams.get('results_per_page'), String(ADZUNA_PAGE_SIZE));
  assertEquals(url.searchParams.get('max_days_old'), '3');
});

Deno.test("buildAdzunaUrl traduit le code INSEE en localité connue d'Adzuna", () => {
  const url = new URL(buildAdzunaUrl(cfg, localQuery, 'delta', 1));
  assertEquals(url.searchParams.get('where'), 'Marseille');
  assertEquals(url.searchParams.get('distance'), '40');
});

Deno.test('buildAdzunaUrl omet where et distance sur la passe nationale', () => {
  const url = new URL(buildAdzunaUrl(cfg, remoteQuery, 'delta', 1));
  assertEquals(url.searchParams.has('where'), false);
  assertEquals(url.searchParams.has('distance'), false);
});

Deno.test('buildAdzunaUrl transmet la catégorie depuis extra_params', () => {
  // Axe catégorie et axe mot-clé sont deux requêtes distinctes : à Marseille,
  // React seul rend 60 offres, it-jobs 385, et leur intersection seulement 8.
  const catQuery: SearchQueryRow = {
    ...localQuery,
    id: 102,
    label: 'adzuna:local:it-jobs',
    keywords: null,
    extra_params: { category: 'it-jobs' },
  };
  const url = new URL(buildAdzunaUrl(cfg, catQuery, 'delta', 1));

  assertEquals(url.searchParams.get('category'), 'it-jobs');
  assertEquals(url.searchParams.has('what_and'), false);
  assertEquals(url.searchParams.get('where'), 'Marseille');
  assertEquals(url.searchParams.get('distance'), '40');
});

Deno.test('buildAdzunaUrl groupe les mots-clés multiples dans what_and', () => {
  const multi: SearchQueryRow = { ...remoteQuery, id: 103, keywords: 'React télétravail' };
  const url = new URL(buildAdzunaUrl(cfg, multi, 'delta', 1));

  // Le ET logique porte sur les deux mots : 313 offres, contre 1 avec `what`.
  assertEquals(url.searchParams.get('what_and'), 'React télétravail');
});

Deno.test('buildAdzunaUrl passe à 31 jours en backfill', () => {
  const url = new URL(buildAdzunaUrl(cfg, localQuery, 'backfill', 1));
  assertEquals(url.searchParams.get('max_days_old'), '31');
});

// --- Résolution A : what_phrase, lu depuis extra_params ---

Deno.test('buildAdzunaUrl transmet what_phrase depuis extra_params', () => {
  const phraseQuery: SearchQueryRow = {
    ...remoteQuery,
    id: 104,
    keywords: null,
    extra_params: { what_phrase: 'full remote' },
  };
  const url = new URL(buildAdzunaUrl(cfg, phraseQuery, 'delta', 1));

  assertEquals(url.searchParams.get('what_phrase'), 'full remote');
  assertEquals(url.searchParams.has('what_and'), false);
  assertEquals(url.searchParams.has('category'), false);
});

Deno.test('buildAdzunaUrl combine what_and, category et what_phrase sur une même requête', () => {
  const combinedQuery: SearchQueryRow = {
    ...localQuery,
    id: 105,
    keywords: 'TypeScript',
    extra_params: { category: 'it-jobs', what_phrase: 'full remote' },
  };
  const url = new URL(buildAdzunaUrl(cfg, combinedQuery, 'delta', 1));

  assertEquals(url.searchParams.get('what_and'), 'TypeScript');
  assertEquals(url.searchParams.get('category'), 'it-jobs');
  assertEquals(url.searchParams.get('what_phrase'), 'full remote');
});

// --- Liste blanche des clés d'extra_params, à trois catégories ---
//
// Mesuré contre l'API réelle : un paramètre inconnu ne dégrade pas la
// requête Adzuna, il la fait échouer en HTTP 400. `implies_remote` est une
// métadonnée pour provenanceOf (mapper.ts), jamais un paramètre d'URL — la
// transmettre a produit ce 400 en pratique.

Deno.test("buildAdzunaUrl transmet what_phrase depuis extra_params vers l'URL, encodé", () => {
  const phraseOnly: SearchQueryRow = {
    ...remoteQuery,
    id: 107,
    keywords: null,
    extra_params: { what_phrase: 'full remote' },
  };
  const url = new URL(buildAdzunaUrl(cfg, phraseOnly, 'delta', 1));
  assertEquals(url.searchParams.get('what_phrase'), 'full remote');
  // Encodage produit par URLSearchParams : l'espace devient `+` dans la query string brute.
  assertMatch(url.search, /what_phrase=full\+remote/);
});

Deno.test(
  'buildAdzunaUrl ne transmet JAMAIS implies_remote à Adzuna (régression du HTTP 400 mesuré)',
  () => {
    // implies_remote est une métadonnée pour provenanceOf (mapper.ts), pas un
    // paramètre Adzuna. La transmettre telle quelle a produit un HTTP 400
    // mesuré contre l'API réelle sur une requête par ailleurs valide
    // (what_phrase=full remote&what_and=TypeScript, 200 sans elle).
    const remoteAxisQuery: SearchQueryRow = {
      ...remoteQuery,
      id: 108,
      keywords: 'TypeScript',
      extra_params: { what_phrase: 'full remote', implies_remote: 'full' },
    };
    const url = new URL(buildAdzunaUrl(cfg, remoteAxisQuery, 'delta', 1));

    assertEquals(url.searchParams.get('what_phrase'), 'full remote');
    assertEquals(url.searchParams.get('what_and'), 'TypeScript');
    assertEquals(url.searchParams.has('implies_remote'), false);
  },
);

Deno.test(
  'buildAdzunaUrl transmet un nouveau paramètre transmissible (what_exclude) depuis extra_params',
  () => {
    // Catégorie 1 : paramètre d'URL Adzuna, réglable en base sans toucher au code.
    const excludeQuery: SearchQueryRow = {
      ...remoteQuery,
      id: 110,
      keywords: 'React',
      extra_params: { what_exclude: 'réacteur' },
    };
    const url = new URL(buildAdzunaUrl(cfg, excludeQuery, 'delta', 1));
    assertEquals(url.searchParams.get('what_exclude'), 'réacteur');
  },
);

Deno.test(
  'buildAdzunaUrl refuse une clé possédée par une colonne (where) et nomme la colonne dans le message',
  () => {
    // Catégorie 2 : `where` est possédé par la colonne search_queries.commune_insee
    // (traduite en localité par buildAdzunaUrl lui-même) — l'admettre depuis
    // extra_params créerait une seconde source de vérité pour la même valeur. Le
    // message doit nommer la colonne à utiliser, pas seulement rejeter la clé.
    const ownedQuery: SearchQueryRow = {
      ...remoteQuery,
      id: 111,
      keywords: null,
      extra_params: { where: 'Lyon' },
    };
    assertThrows(
      () => buildAdzunaUrl(cfg, ownedQuery, 'delta', 1),
      Error,
      'commune_insee',
    );
  },
);

Deno.test(
  'buildAdzunaUrl échoue fort sur une clé extra_params inconnue (faute de frappe détectable)',
  () => {
    // Ni un paramètre d'URL admis, ni une métadonnée connue du mapper : très
    // probablement une faute de frappe dans la matrice en base. On refuse de
    // choisir entre « l'ignorer » (la requête tourne, dégradée, en silence)
    // et « l'envoyer » (HTTP 400) : les deux masquent l'erreur à quelqu'un
    // qui ne lit pas ce fichier.
    const typoQuery: SearchQueryRow = {
      ...remoteQuery,
      id: 109,
      keywords: null,
      extra_params: { nimportequoi: 'x' },
    };
    assertThrows(
      () => buildAdzunaUrl(cfg, typoQuery, 'delta', 1),
      Error,
      'nimportequoi',
    );
  },
);

function pagedFetch(total: number, calls: { pages: number[] }): typeof fetch {
  return ((url: string | URL) => {
    const page = Number(new URL(String(url)).pathname.split('/').pop());
    calls.pages.push(page);
    const start = (page - 1) * ADZUNA_PAGE_SIZE;
    const count = Math.max(0, Math.min(ADZUNA_PAGE_SIZE, total - start));
    const results = Array.from({ length: count }, (_, i) => ({ id: `AD-${start + i}` }));
    return Promise.resolve(
      new Response(JSON.stringify({ count: total, results }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }) as unknown as typeof fetch;
}

const noSleep = () => Promise.resolve();

Deno.test("fetchAllAdzunaPages pagine jusqu'à épuisement de count", async () => {
  const calls = { pages: [] as number[] };
  const result = await fetchAllAdzunaPages({
    cfg,
    query: localQuery,
    mode: 'delta',
    fetchImpl: pagedFetch(120, calls),
    sleepImpl: noSleep,
  });

  assertEquals(result.offers.length, 120);
  assertEquals(result.totalAvailable, 120);
  assertEquals(calls.pages, [1, 2, 3]);
  assertEquals(result.truncated, false);
});

Deno.test('fetchAllAdzunaPages gère un résultat vide', async () => {
  const calls = { pages: [] as number[] };
  const result = await fetchAllAdzunaPages({
    cfg,
    query: localQuery,
    mode: 'delta',
    fetchImpl: pagedFetch(0, calls),
    sleepImpl: noSleep,
  });

  assertEquals(result.offers.length, 0);
  assertEquals(result.totalAvailable, 0);
  assertEquals(result.truncated, false);
});

Deno.test(
  "fetchAllAdzunaPages s'arrête au plafond MAX_PAGES et signale la troncature",
  async () => {
    // Aucun test avant celui-ci ne dépassait 3 pages : le plafond (10 pages × 50 =
    // 500 offres) n'était jamais atteint, donc jamais couvert.
    const calls = { pages: [] as number[] };
    const result = await fetchAllAdzunaPages({
      cfg,
      query: localQuery,
      mode: 'delta',
      fetchImpl: pagedFetch(50_000, calls),
      sleepImpl: noSleep,
    });

    assertEquals(result.offers.length, 500);
    assertEquals(result.totalAvailable, 50_000);
    assertEquals(result.truncated, true);
    assertEquals(calls.pages.length, 10);
    assertEquals(calls.pages.at(-1), 10);
  },
);

Deno.test('fetchAllAdzunaPages réessaie après un 429', async () => {
  let seen = 0;
  const flaky = ((url: string | URL) => {
    seen += 1;
    if (seen === 1) return Promise.resolve(new Response('slow down', { status: 429 }));
    void url;
    return Promise.resolve(
      new Response(JSON.stringify({ count: 1, results: [{ id: 'AD-0' }] }), { status: 200 }),
    );
  }) as unknown as typeof fetch;

  const result = await fetchAllAdzunaPages({
    cfg,
    query: localQuery,
    mode: 'delta',
    fetchImpl: flaky,
    sleepImpl: noSleep,
  });

  assertEquals(result.offers.length, 1);
  assertEquals(seen, 2);
});
