import { assertEquals, assertRejects, assertThrows } from '@std/assert';
import {
  computeStreak,
  openOffer,
  patchApplication,
  type Row,
  ValidationError,
} from '../dashboard-query.ts';
import type { DbClient } from '../db.ts';

// --------------------------------------------------------------------------
// openOffer
// --------------------------------------------------------------------------

interface OpenFakeOptions {
  offerExists: boolean;
  existingApplication?: Row | null;
}

interface OpenFakeRecorder {
  insertedRows: Record<string, unknown>[];
}

function fakeDbForOpen(opts: OpenFakeOptions): { db: DbClient; rec: OpenFakeRecorder } {
  const rec: OpenFakeRecorder = { insertedRows: [] };
  const db = {
    from(table: string) {
      if (table === 'offers') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: opts.offerExists ? { id: 'offer-1' } : null,
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === 'offer_applications') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              maybeSingle: () =>
                Promise.resolve({ data: opts.existingApplication ?? null, error: null }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            rec.insertedRows.push(row);
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: { offer_id: row.offer_id, status: 'a_traiter' },
                    error: null,
                  }),
              }),
            };
          },
        };
      }
      throw new Error(`table inattendue : ${table}`);
    },
  } as unknown as DbClient;
  return { db, rec };
}

Deno.test('openOffer — offre absente : outcome offer_not_found, aucune écriture', async () => {
  const { db, rec } = fakeDbForOpen({ offerExists: false });
  const result = await openOffer(db, 'missing-offer');
  assertEquals(result.outcome, 'offer_not_found');
  assertEquals(rec.insertedRows.length, 0);
});

Deno.test('openOffer — candidature absente : elle est créée', async () => {
  const { db, rec } = fakeDbForOpen({ offerExists: true, existingApplication: null });
  const result = await openOffer(db, 'offer-1');
  assertEquals(result.outcome, 'created');
  assertEquals(rec.insertedRows, [{ offer_id: 'offer-1' }]);
});

Deno.test('openOffer — candidature déjà ouverte : idempotent, aucune écriture', async () => {
  const existing: Row = { offer_id: 'offer-1', status: 'postulee' };
  const { db, rec } = fakeDbForOpen({ offerExists: true, existingApplication: existing });
  const result = await openOffer(db, 'offer-1');
  assertEquals(result.outcome, 'already_open');
  if (result.outcome === 'already_open') assertEquals(result.row, existing);
  assertEquals(rec.insertedRows.length, 0);
});

// --------------------------------------------------------------------------
// patchApplication
// --------------------------------------------------------------------------

function fakeDbForPatch(current: Row | null): { db: DbClient; updates: Row[] } {
  const updates: Row[] = [];
  const db = {
    from(table: string) {
      if (table !== 'offer_applications') throw new Error(`table inattendue : ${table}`);
      return {
        select: (_cols: string) => ({
          eq: (_col: string, _val: string) => ({
            maybeSingle: () => Promise.resolve({ data: current, error: null }),
          }),
        }),
        update: (patchRow: Row) => {
          updates.push(patchRow);
          return {
            eq: (_col: string, _val: string) => ({
              select: () => ({
                single: () => Promise.resolve({ data: { ...current, ...patchRow }, error: null }),
              }),
            }),
          };
        },
      };
    },
  } as unknown as DbClient;
  return { db, updates };
}

Deno.test('patchApplication — aucune candidature : outcome not_found', async () => {
  const { db } = fakeDbForPatch(null);
  const result = await patchApplication(db, 'offer-1', { notes: 'test' });
  assertEquals(result.outcome, 'not_found');
});

Deno.test('patchApplication — outcome sans statut terminé (ni fourni, ni en base) : rejeté', async () => {
  const { db } = fakeDbForPatch({ offer_id: 'offer-1', status: 'postulee', outcome: null });
  await assertRejects(
    () => patchApplication(db, 'offer-1', { outcome: 'refus' }),
    ValidationError,
  );
});

Deno.test('patchApplication — statut postulee sans applied_at (ni fourni, ni en base) : rejeté', async () => {
  const { db } = fakeDbForPatch({ offer_id: 'offer-1', status: 'a_traiter', applied_at: null });
  await assertRejects(
    () => patchApplication(db, 'offer-1', { status: 'postulee' }),
    ValidationError,
  );
});

Deno.test('patchApplication — statut postulee avec applied_at fourni : accepté, status_changed_at posé', async () => {
  const { db, updates } = fakeDbForPatch({
    offer_id: 'offer-1',
    status: 'a_traiter',
    applied_at: null,
  });
  const result = await patchApplication(db, 'offer-1', {
    status: 'postulee',
    appliedAt: '2026-09-09T08:00:00Z',
  });
  assertEquals(result.outcome, 'updated');
  assertEquals(updates.length, 1);
  assertEquals(updates[0].status, 'postulee');
  assertEquals(updates[0].applied_at, '2026-09-09T08:00:00Z');
  assertEquals(typeof updates[0].status_changed_at, 'string');
});

Deno.test('patchApplication — outcome accepté quand le statut EN BASE est déjà terminee', async () => {
  const { db, updates } = fakeDbForPatch({
    offer_id: 'offer-1',
    status: 'terminee',
    applied_at: '2026-09-01T00:00:00Z',
    outcome: null,
  });
  const result = await patchApplication(db, 'offer-1', { outcome: 'refus' });
  assertEquals(result.outcome, 'updated');
  assertEquals(updates[0].outcome, 'refus');
  // Le statut n'a pas été redemandé : status_changed_at ne doit pas bouger.
  assertEquals('status_changed_at' in updates[0], false);
});

Deno.test('patchApplication — corps vide : rejeté, jamais un UPDATE muet', async () => {
  const { db, updates } = fakeDbForPatch({ offer_id: 'offer-1', status: 'a_traiter' });
  await assertRejects(() => patchApplication(db, 'offer-1', {}), ValidationError);
  assertEquals(updates.length, 0);
});

// --------------------------------------------------------------------------
// computeStreak
// --------------------------------------------------------------------------

Deno.test('computeStreak — aucun envoi : série à zéro, et le dit', () => {
  const result = computeStreak(new Set(), new Date('2026-09-09T12:00:00Z'));
  assertEquals(result.days, 0);
  assertEquals(result.recentDays.length, 7);
});

Deno.test('computeStreak — trois jours de suite se terminant hier, rien aujourd’hui : série à 3', () => {
  // Aujourd'hui = mercredi 2026-09-09. Lundi, mardi, mercredi correspond au
  // schéma de la maquette Suivi.dc.html (L M M envoyés, J V vides) — ici
  // décalé d'un jour : dimanche/lundi/mardi envoyés, rien aujourd'hui.
  const sentDays = new Set(['2026-09-06', '2026-09-07', '2026-09-08']);
  const result = computeStreak(sentDays, new Date('2026-09-09T12:00:00Z'));
  assertEquals(result.days, 3);
});

Deno.test('computeStreak — envoi aujourd’hui aussi : compté dans la série', () => {
  const sentDays = new Set(['2026-09-07', '2026-09-08', '2026-09-09']);
  const result = computeStreak(sentDays, new Date('2026-09-09T12:00:00Z'));
  assertEquals(result.days, 3);
});

Deno.test('computeStreak — un jour manquant casse la série avant lui', () => {
  // 2026-09-07 manquant : la série ne compte que le 08 et le 09.
  const sentDays = new Set(['2026-09-05', '2026-09-08', '2026-09-09']);
  const result = computeStreak(sentDays, new Date('2026-09-09T12:00:00Z'));
  assertEquals(result.days, 2);
});

Deno.test('computeStreak — recentDays porte 7 jours consécutifs se terminant aujourd’hui', () => {
  const result = computeStreak(new Set(['2026-09-09']), new Date('2026-09-09T12:00:00Z'));
  assertEquals(result.recentDays.map((d) => d.date), [
    '2026-09-03',
    '2026-09-04',
    '2026-09-05',
    '2026-09-06',
    '2026-09-07',
    '2026-09-08',
    '2026-09-09',
  ]);
  assertEquals(result.recentDays[6].sent, true);
  assertEquals(result.recentDays[0].sent, false);
});

// Preuve que ValidationError est bien une Error normale (utile pour le
// routeur : `instanceof ValidationError` doit fonctionner).
Deno.test('ValidationError — instance de Error', () => {
  assertThrows(
    () => {
      throw new ValidationError('message');
    },
    ValidationError,
    'message',
  );
});
