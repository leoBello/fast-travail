import { assertEquals } from '@std/assert';
import { recordQueryResult } from '../run-tracker.ts';
import type { QueryReportLine } from '../types.ts';
import type { DbClient } from '../db.ts';

/** Faux client ne couvrant que l'insertion de télémétrie. */
function fakeDb(): { db: DbClient; inserted: Record<string, unknown>[] } {
  const inserted: Record<string, unknown>[] = [];
  const db = {
    from(_table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserted.push(row);
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as DbClient;
  return { db, inserted };
}

const fullLine: QueryReportLine = {
  query_id: 1,
  unit_label: 'a',
  http_status: 200,
  total_available: 3,
  fetched: 3,
  new_offers: 3,
  updated_offers: 0,
  truncated: false,
  duration_ms: 12,
  error: null,
};

Deno.test('recordQueryResult accepte le type canonique QueryReportLine de types.ts', async () => {
  const { db, inserted } = fakeDb();

  await recordQueryResult(db, 'run-1', fullLine);

  assertEquals(inserted.length, 1);
  assertEquals(inserted[0].run_id, 'run-1');
  assertEquals(inserted[0].unit_label, 'a');
  assertEquals(inserted[0].fetched, 3);
});
