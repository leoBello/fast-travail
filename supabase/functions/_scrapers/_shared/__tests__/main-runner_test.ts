import { assert, assertEquals, assertRejects } from '@std/assert';
import type { DbClient } from '../../../_shared/db.ts';
import type { FetchResult } from '../../../_shared/run-collection.ts';
import type { NormalizedOffer, SearchQueryRow } from '../../../_shared/types.ts';
import { emptyOffer } from '../../../_shared/types.ts';
import type { PageFetcher } from '../http.ts';
import { runScraperMain, type ScraperDefinition } from '../main-runner.ts';

const ROBOTS_OK = 'User-agent: *\nDisallow: /login\n';
const ROBOTS_KO = 'User-agent: *\nDisallow: /\n';

const QUERY: SearchQueryRow = {
  id: 1,
  source: 'free_work',
  label: 'fw:skill:react',
  keywords: null,
  commune_insee: null,
  radius_km: null,
  extra_params: { facet: 'react' },
  published_since_days: 3,
  priority: 60,
  enabled: true,
};

interface FakeState {
  enabled: boolean;
  updates: Array<Record<string, unknown>>;
  queries: SearchQueryRow[];
  knownIds: string[];
  /** Chaque `eq(column, value)` reçu par le double search_queries, dans l'ordre. */
  filters: Array<{ column: string; value: unknown }>;
}

/**
 * Double de base de données. `as unknown as DbClient` est le moyen normal ici
 * (voir CLAUDE.md) : `DbClient` n'est pas typé sur le schéma.
 */
function fakeDb(state: FakeState): DbClient {
  const sourceRow = {
    base_url: 'https://example.test',
    min_delay_ms: 0,
    max_pages_per_run: 5,
    user_agent: 'fast-travail/0.1 (veille personnelle)',
    enabled: state.enabled,
  };

  return {
    from(table: string) {
      if (table === 'sources') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: sourceRow, error: null }) }),
          }),
          update: (values: Record<string, unknown>) => {
            state.updates.push(values);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      if (table === 'offers') {
        return {
          select: () => ({
            eq: () => ({
              range: (from: number) =>
                Promise.resolve({
                  data: from === 0 ? state.knownIds.map((id) => ({ external_id: id })) : [],
                  error: null,
                }),
            }),
          }),
        };
      }
      // search_queries : select().eq().eq().order() et, avec --query, un eq() de plus.
      // eq() enregistre chaque paire (colonne, valeur) : la chaîne d'appels ne
      // suffit pas à prouver qu'un filtre porte sur la bonne colonne.
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          state.filters.push({ column, value });
          return builder;
        },
        order: () => Promise.resolve({ data: state.queries, error: null }),
        then: undefined,
      };
      return builder;
    },
  } as unknown as DbClient;
}

function fakeFetcherFactory(robots: string, seen: string[]) {
  return (): PageFetcher => ({
    get(url: string) {
      seen.push(url);
      return Promise.resolve({ url, status: 200, body: robots });
    },
  });
}

function scraper(overrides: Partial<ScraperDefinition> = {}): ScraperDefinition {
  return {
    source: 'free_work',
    pathsUsed: ['/fr/tech-it/jobs/react'],
    needsKnownExternalIds: true,
    fetchAll: (): Promise<FetchResult> =>
      Promise.resolve({
        offers: [{ id: 'a' }],
        totalAvailable: 1,
        truncated: false,
        httpStatus: 200,
      }),
    map: (): NormalizedOffer => emptyOffer('free_work', 'a', 'Une offre'),
    ...overrides,
  };
}

function host(args: string[]) {
  return {
    args,
    env: (name: string) =>
      ({ SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'clef' })[name],
  };
}

Deno.test('une variable d’environnement manquante arrête tout', async () => {
  await assertRejects(
    () => runScraperMain(scraper(), { args: ['--dry-run'], env: () => undefined }),
    Error,
    'SUPABASE_URL',
  );
});

Deno.test('une source désactivée en base ne collecte rien', async () => {
  const state: FakeState = {
    enabled: false,
    updates: [],
    queries: [QUERY],
    knownIds: [],
    filters: [],
  };
  let called = false;

  const code = await runScraperMain(
    scraper({
      fetchAll: () => {
        called = true;
        return Promise.resolve({
          offers: [],
          totalAvailable: null,
          truncated: false,
          httpStatus: 200,
        });
      },
    }),
    host(['--dry-run']),
    { createDb: () => fakeDb(state), createFetcher: fakeFetcherFactory(ROBOTS_OK, []) },
  );

  assertEquals(code, 0);
  assertEquals(called, false, 'aucune collecte ne doit être tentée');
});

Deno.test('un robots.txt qui refuse arrête la collecte et consigne le verdict', async () => {
  const state: FakeState = {
    enabled: true,
    updates: [],
    queries: [QUERY],
    knownIds: [],
    filters: [],
  };
  let called = false;

  const code = await runScraperMain(
    scraper({
      fetchAll: () => {
        called = true;
        return Promise.resolve({
          offers: [],
          totalAvailable: null,
          truncated: false,
          httpStatus: 200,
        });
      },
    }),
    host([]),
    { createDb: () => fakeDb(state), createFetcher: fakeFetcherFactory(ROBOTS_KO, []) },
  );

  assertEquals(code, 1);
  assertEquals(called, false, 'rien ne doit être collecté après un refus');
  assertEquals(state.updates[0].robots_allows, false);
  assert(state.updates.some((u) => u.last_status === 'failed'));
});

Deno.test('robots.txt est lu à chaque exécution, et son verdict écrit même à blanc', async () => {
  const state: FakeState = {
    enabled: true,
    updates: [],
    queries: [QUERY],
    knownIds: [],
    filters: [],
  };
  const seen: string[] = [];

  await runScraperMain(scraper(), host(['--dry-run']), {
    createDb: () => fakeDb(state),
    createFetcher: fakeFetcherFactory(ROBOTS_OK, seen),
  });

  assertEquals(seen[0], 'https://example.test/robots.txt');
  assertEquals(state.updates[0].robots_allows, true);
  // Le verdict est un fait sur le monde extérieur : une répétition à blanc doit
  // justement servir à apprendre que robots.txt a changé.
});

Deno.test('une répétition à blanc ne marque aucun run', async () => {
  const state: FakeState = {
    enabled: true,
    updates: [],
    queries: [QUERY],
    knownIds: [],
    filters: [],
  };

  const code = await runScraperMain(scraper(), host(['--dry-run']), {
    createDb: () => fakeDb(state),
    createFetcher: fakeFetcherFactory(ROBOTS_OK, []),
  });

  assertEquals(code, 0);
  assertEquals(state.updates.filter((u) => 'last_status' in u).length, 0);
});

Deno.test('le delta précharge les identifiants connus, le backfill les ignore', async () => {
  const state: FakeState = {
    enabled: true,
    updates: [],
    queries: [QUERY],
    knownIds: ['deja-vu'],
    filters: [],
  };
  const seenSizes: number[] = [];
  const spy = scraper({
    fetchAll: (ctx) => {
      seenSizes.push(ctx.knownExternalIds.size);
      return Promise.resolve({
        offers: [],
        totalAvailable: null,
        truncated: false,
        httpStatus: 200,
      });
    },
  });
  const deps = { createDb: () => fakeDb(state), createFetcher: fakeFetcherFactory(ROBOTS_OK, []) };

  await runScraperMain(spy, host(['--dry-run', '--mode', 'delta']), deps);
  await runScraperMain(spy, host(['--dry-run', '--mode', 'backfill']), deps);

  assertEquals(seenSizes, [1, 0]);
});

Deno.test('une source qui n’en a pas besoin ne paie pas le préchargement', async () => {
  const state: FakeState = {
    enabled: true,
    updates: [],
    queries: [QUERY],
    knownIds: ['deja-vu'],
    filters: [],
  };
  let size = -1;

  await runScraperMain(
    scraper({
      needsKnownExternalIds: false,
      fetchAll: (ctx) => {
        size = ctx.knownExternalIds.size;
        return Promise.resolve({
          offers: [],
          totalAvailable: null,
          truncated: false,
          httpStatus: 200,
        });
      },
    }),
    host(['--dry-run', '--mode', 'delta']),
    { createDb: () => fakeDb(state), createFetcher: fakeFetcherFactory(ROBOTS_OK, []) },
  );

  assertEquals(size, 0);
});

Deno.test('la fenêtre suit le mode', async () => {
  const state: FakeState = {
    enabled: true,
    updates: [],
    queries: [QUERY],
    knownIds: [],
    filters: [],
  };
  const windows: number[] = [];
  const spy = scraper({
    fetchAll: (ctx) => {
      windows.push(ctx.windowDays);
      return Promise.resolve({
        offers: [],
        totalAvailable: null,
        truncated: false,
        httpStatus: 200,
      });
    },
  });
  const deps = { createDb: () => fakeDb(state), createFetcher: fakeFetcherFactory(ROBOTS_OK, []) };

  await runScraperMain(spy, host(['--dry-run', '--mode', 'delta']), deps);
  await runScraperMain(spy, host(['--dry-run', '--mode', 'backfill']), deps);

  assertEquals(windows, [3, 31]);
});

Deno.test('aucune requête active est une erreur, pas un succès silencieux', async () => {
  const state: FakeState = { enabled: true, updates: [], queries: [], knownIds: [], filters: [] };

  await assertRejects(
    () =>
      runScraperMain(scraper(), host(['--dry-run']), {
        createDb: () => fakeDb(state),
        createFetcher: fakeFetcherFactory(ROBOTS_OK, []),
      }),
    Error,
    'free_work',
  );
});

Deno.test('--mode fautif (« backfil ») échoue et nomme la valeur en cause', async () => {
  const state: FakeState = {
    enabled: true,
    updates: [],
    queries: [QUERY],
    knownIds: [],
    filters: [],
  };

  const err = await assertRejects(
    () =>
      runScraperMain(scraper(), host(['--dry-run', '--mode', 'backfil']), {
        createDb: () => fakeDb(state),
        createFetcher: fakeFetcherFactory(ROBOTS_OK, []),
      }),
    Error,
  );

  assert(err.message.includes('backfil'), `le message doit nommer « backfil » : ${err.message}`);
  assert(err.message.includes('delta'), `le message doit lister « delta » : ${err.message}`);
  assert(
    err.message.includes('backfill'),
    `le message doit lister « backfill » : ${err.message}`,
  );
});

Deno.test('--mode sans valeur (dernier argument) échoue plutôt que de retomber sur delta', async () => {
  const state: FakeState = {
    enabled: true,
    updates: [],
    queries: [QUERY],
    knownIds: [],
    filters: [],
  };

  await assertRejects(
    () =>
      runScraperMain(scraper(), host(['--dry-run', '--mode']), {
        createDb: () => fakeDb(state),
        createFetcher: fakeFetcherFactory(ROBOTS_OK, []),
      }),
    Error,
  );
});

Deno.test('--trigger fautif échoue et nomme la valeur en cause', async () => {
  const state: FakeState = {
    enabled: true,
    updates: [],
    queries: [QUERY],
    knownIds: [],
    filters: [],
  };

  const err = await assertRejects(
    () =>
      runScraperMain(scraper(), host(['--dry-run', '--trigger', 'automatique']), {
        createDb: () => fakeDb(state),
        createFetcher: fakeFetcherFactory(ROBOTS_OK, []),
      }),
    Error,
  );

  assert(
    err.message.includes('automatique'),
    `le message doit nommer « automatique » : ${err.message}`,
  );
  assert(err.message.includes('manual'), `le message doit lister « manual » : ${err.message}`);
  assert(err.message.includes('cron'), `le message doit lister « cron » : ${err.message}`);
});

Deno.test('--query applique le filtre label, en plus de source et enabled', async () => {
  const state: FakeState = {
    enabled: true,
    updates: [],
    queries: [QUERY],
    knownIds: [],
    filters: [],
  };

  await runScraperMain(scraper(), host(['--dry-run', '--query', 'fw:skill:react']), {
    createDb: () => fakeDb(state),
    createFetcher: fakeFetcherFactory(ROBOTS_OK, []),
  });

  assert(
    state.filters.some((f) => f.column === 'source' && f.value === 'free_work'),
    `filtre source manquant : ${JSON.stringify(state.filters)}`,
  );
  assert(
    state.filters.some((f) => f.column === 'enabled' && f.value === true),
    `filtre enabled manquant : ${JSON.stringify(state.filters)}`,
  );
  assert(
    state.filters.some((f) => f.column === 'label' && f.value === 'fw:skill:react'),
    `filtre label manquant : ${JSON.stringify(state.filters)}`,
  );
});

Deno.test('sans --query, aucun filtre label n’est appliqué', async () => {
  const state: FakeState = {
    enabled: true,
    updates: [],
    queries: [QUERY],
    knownIds: [],
    filters: [],
  };

  await runScraperMain(scraper(), host(['--dry-run']), {
    createDb: () => fakeDb(state),
    createFetcher: fakeFetcherFactory(ROBOTS_OK, []),
  });

  assert(
    state.filters.every((f) => f.column !== 'label'),
    `aucun filtre label n'était attendu : ${JSON.stringify(state.filters)}`,
  );
});
