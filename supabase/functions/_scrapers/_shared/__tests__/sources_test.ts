import { assertEquals, assertRejects } from '@std/assert';
import type { DbClient } from '../../../_shared/db.ts';
import {
  loadKnownExternalIds,
  loadSourceSettings,
  markSourceRun,
  recordRobotsCheck,
} from '../sources.ts';

interface FakeRow {
  base_url: string | null;
  min_delay_ms: number;
  max_pages_per_run: number;
  user_agent: string | null;
  enabled: boolean;
}

/** Double de test : `as unknown as DbClient` est le moyen normal ici (voir CLAUDE.md). */
function fakeDb(row: FakeRow | null, updates: Array<Record<string, unknown>> = []) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: () => Promise.resolve({ data: row, error: null }),
              };
            },
          };
        },
        update(values: Record<string, unknown>) {
          updates.push(values);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    },
  } as unknown as DbClient;
}

Deno.test('loadSourceSettings rend les réglages de politesse', async () => {
  const db = fakeDb({
    base_url: 'https://www.free-work.com',
    min_delay_ms: 3000,
    max_pages_per_run: 15,
    user_agent: 'fast-travail/0.1 (veille personnelle)',
    enabled: true,
  });

  const settings = await loadSourceSettings(db, 'free_work');

  assertEquals(settings.baseUrl, 'https://www.free-work.com');
  assertEquals(settings.minDelayMs, 3000);
  assertEquals(settings.maxPagesPerRun, 15);
  assertEquals(settings.userAgent, 'fast-travail/0.1 (veille personnelle)');
  assertEquals(settings.enabled, true);
});

Deno.test('loadSourceSettings refuse une source absente', async () => {
  await assertRejects(() => loadSourceSettings(fakeDb(null), 'free_work'), Error, 'free_work');
});

Deno.test('loadSourceSettings refuse une source sans base_url', async () => {
  const db = fakeDb({
    base_url: null,
    min_delay_ms: 3000,
    max_pages_per_run: 15,
    user_agent: 'ua',
    enabled: true,
  });
  await assertRejects(() => loadSourceSettings(db, 'free_work'), Error, 'base_url');
});

Deno.test('recordRobotsCheck écrit le verdict et sa date', async () => {
  const updates: Array<Record<string, unknown>> = [];
  await recordRobotsCheck(fakeDb(null, updates), 'free_work', true);

  assertEquals(updates.length, 1);
  assertEquals(updates[0].robots_allows, true);
  assertEquals(typeof updates[0].robots_checked_at, 'string');
});

Deno.test('markSourceRun écrit le statut et la date', async () => {
  const updates: Array<Record<string, unknown>> = [];
  await markSourceRun(fakeDb(null, updates), 'collective', 'success');

  assertEquals(updates[0].last_status, 'success');
  assertEquals(typeof updates[0].last_run_at, 'string');
});

/** Double paginé : rend les lots donnés, un par appel à `range`. */
function fakePagedDb(batches: string[][], ranges: Array<[number, number]> = []) {
  let call = 0;
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                range(from: number, to: number) {
                  ranges.push([from, to]);
                  const rows = (batches[call++] ?? []).map((id) => ({ external_id: id }));
                  return Promise.resolve({ data: rows, error: null });
                },
              };
            },
          };
        },
      };
    },
  } as unknown as DbClient;
}

Deno.test('loadKnownExternalIds rend l’ensemble des identifiants connus', async () => {
  const ranges: Array<[number, number]> = [];
  const known = await loadKnownExternalIds(fakePagedDb([['a', 'b', 'c']], ranges), 'free_work');

  assertEquals([...known].sort(), ['a', 'b', 'c']);
  assertEquals(ranges, [[0, 999]], 'un lot incomplet arrête la pagination');
});

Deno.test('loadKnownExternalIds pagine au-delà du plafond de supabase-js', async () => {
  // supabase-js plafonne une réponse à 1 000 lignes : sans pagination, une source
  // dépassant ce volume verrait ses offres au-delà considérées comme inconnues,
  // et le scraper repaierait chaque jour leur page de détail.
  const first = Array.from({ length: 1000 }, (_, i) => `id-${i}`);
  const ranges: Array<[number, number]> = [];
  const known = await loadKnownExternalIds(fakePagedDb([first, ['dernier']], ranges), 'free_work');

  assertEquals(known.size, 1001);
  assertEquals(ranges, [[0, 999], [1000, 1999]]);
});
