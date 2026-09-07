import { assertEquals } from '@std/assert';
import { runCollection } from '../run-collection.ts';
import { emptyOffer, type NormalizedOffer, type SearchQueryRow } from '../types.ts';
import type { DbClient } from '../db.ts';

function query(id: number, label: string): SearchQueryRow {
  return {
    id,
    source: 'france_travail',
    label,
    keywords: label,
    commune_insee: '13055',
    radius_km: 40,
    extra_params: {},
    published_since_days: 3,
    priority: 10,
    enabled: true,
  };
}

interface Recorded {
  runsOpened: number;
  runsFinished: Record<string, unknown>[];
  telemetry: Record<string, unknown>[];
  upserts: unknown[][];
}

/** Faux client couvrant les seules chaînes d'appels que runCollection déclenche. */
function fakeDb(knownExternalIds: string[] = []): { db: DbClient; rec: Recorded } {
  const rec: Recorded = { runsOpened: 0, runsFinished: [], telemetry: [], upserts: [] };

  const db = {
    from(table: string) {
      if (table === 'collection_runs') {
        return {
          insert(_row: unknown) {
            rec.runsOpened += 1;
            return {
              select(_c: string) {
                return { single: () => Promise.resolve({ data: { id: 'run-1' }, error: null }) };
              },
            };
          },
          update(row: Record<string, unknown>) {
            rec.runsFinished.push(row);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      if (table === 'collection_query_results') {
        return {
          insert(row: Record<string, unknown>) {
            rec.telemetry.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      // table 'offers'
      return {
        select(_c: string) {
          return {
            eq(_col: string, _v: string) {
              return {
                in(_col2: string, ids: string[]) {
                  const data = ids
                    .filter((id) => knownExternalIds.includes(id))
                    .map((id) => ({ external_id: id }));
                  return Promise.resolve({ data, error: null });
                },
              };
            },
          };
        },
        upsert(rows: unknown[], _o: unknown) {
          rec.upserts.push(rows);
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as DbClient;

  return { db, rec };
}

const okFetch = (n: number) => () =>
  Promise.resolve({
    offers: Array.from({ length: n }, (_, i) => ({ id: `O${i}` })),
    totalAvailable: n,
    truncated: false,
    httpStatus: 200,
  });

const mapAll = (raw: unknown): NormalizedOffer =>
  emptyOffer('france_travail', (raw as { id: string }).id, 'Titre');

Deno.test('runCollection agrège les compteurs sur toutes les requêtes', async () => {
  const { db, rec } = fakeDb();

  const summary = await runCollection({
    db,
    source: 'france_travail',
    mode: 'delta',
    trigger: 'manual',
    dryRun: false,
    queries: [query(1, 'a'), query(2, 'b')],
    fetchAll: okFetch(3),
    map: mapAll,
  });

  assertEquals(summary.status, 'success');
  assertEquals(summary.offersNew, 6);
  assertEquals(summary.offersUpdated, 0);
  assertEquals(summary.queries.length, 2);
  assertEquals(rec.runsOpened, 1);
  assertEquals(rec.telemetry.length, 2);
  assertEquals(rec.runsFinished.length, 1);
  assertEquals(rec.runsFinished[0].status, 'success');
});

Deno.test("runCollection en dryRun n'ouvre aucun run et n'écrit rien", async () => {
  const { db, rec } = fakeDb();

  const summary = await runCollection({
    db,
    source: 'france_travail',
    mode: 'delta',
    trigger: 'manual',
    dryRun: true,
    queries: [query(1, 'a')],
    fetchAll: okFetch(5),
    map: mapAll,
  });

  assertEquals(summary.runId, null);
  assertEquals(summary.dryRun, true);
  assertEquals(summary.offersNew, 0);
  assertEquals(rec.runsOpened, 0);
  assertEquals(rec.upserts.length, 0);
  assertEquals(rec.telemetry.length, 0);
  // Le preview est plafonné pour ne pas renvoyer des centaines d'offres.
  assertEquals(summary.preview?.length, 3);
});

Deno.test('runCollection isole une requête en échec et termine en partial', async () => {
  const { db, rec } = fakeDb();
  let call = 0;
  const flaky = () => {
    call += 1;
    if (call === 1) return Promise.reject(new Error('boom'));
    return okFetch(2)();
  };

  const summary = await runCollection({
    db,
    source: 'france_travail',
    mode: 'delta',
    trigger: 'manual',
    dryRun: false,
    queries: [query(1, 'qui-echoue'), query(2, 'qui-marche')],
    fetchAll: flaky,
    map: mapAll,
  });

  // La requête suivante doit avoir tourné malgré l'échec de la première.
  assertEquals(summary.status, 'partial');
  assertEquals(summary.offersNew, 2);
  assertEquals(rec.telemetry.length, 2);
  assertEquals(rec.telemetry[0].error, 'boom');
  assertEquals(rec.telemetry[0].unit_label, 'qui-echoue');
  assertEquals(rec.telemetry[1].error, null);
});

Deno.test('runCollection termine en failed quand toutes les requêtes échouent', async () => {
  const { db } = fakeDb();

  const summary = await runCollection({
    db,
    source: 'france_travail',
    mode: 'delta',
    trigger: 'manual',
    dryRun: false,
    queries: [query(1, 'a'), query(2, 'b')],
    fetchAll: () => Promise.reject(new Error('api morte')),
    map: mapAll,
  });

  assertEquals(summary.status, 'failed');
  assertEquals(summary.offersNew, 0);
});

Deno.test('runCollection remonte la troncature dans la télémétrie', async () => {
  const { db, rec } = fakeDb();

  await runCollection({
    db,
    source: 'france_travail',
    mode: 'delta',
    trigger: 'manual',
    dryRun: false,
    queries: [query(1, 'a')],
    fetchAll: () =>
      Promise.resolve({
        offers: [{ id: 'O0' }],
        totalAvailable: 50_000,
        truncated: true,
        httpStatus: 206,
      }),
    map: mapAll,
  });

  assertEquals(rec.telemetry[0].truncated, true);
  assertEquals(rec.telemetry[0].total_available, 50_000);
});

Deno.test('runCollection écarte les payloads que le mapper refuse', async () => {
  const { db, rec } = fakeDb();

  const summary = await runCollection({
    db,
    source: 'france_travail',
    mode: 'delta',
    trigger: 'manual',
    dryRun: false,
    queries: [query(1, 'a')],
    fetchAll: okFetch(4),
    // Un payload sur deux est inexploitable.
    map: (raw) => {
      const id = (raw as { id: string }).id;
      return id === 'O0' || id === 'O2' ? emptyOffer('france_travail', id, 'T') : null;
    },
  });

  assertEquals(summary.offersNew, 2);
  assertEquals(rec.telemetry[0].fetched, 2);
});

Deno.test('runCollection distingue les offres déjà connues', async () => {
  const { db } = fakeDb(['O0', 'O1']);

  const summary = await runCollection({
    db,
    source: 'france_travail',
    mode: 'delta',
    trigger: 'manual',
    dryRun: false,
    queries: [query(1, 'a')],
    fetchAll: okFetch(3),
    map: mapAll,
  });

  assertEquals(summary.offersNew, 1);
  assertEquals(summary.offersUpdated, 2);
});
