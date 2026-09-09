import { assertEquals, assertRejects, assertThrows } from '@std/assert';
import {
  computeStreak,
  openOffer,
  parisDateKey,
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
  /** Ce que `offer_application_state` rend pour l'`offer_id` DEMANDÉ —
   * `null` si le groupe entier n'a encore aucune candidature. Peut différer
   * de l'id demandé : c'est exactement le cas « élection ailleurs dans le
   * groupe » que la revue de la tâche 6 a fait corriger. */
  groupApplicationOfferId?: string | null;
  /** La ligne complète que porterait `groupApplicationOfferId`, relue par
   * `openOffer` pour la retourner telle quelle. */
  existingRow?: Row | null;
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
      if (table === 'offer_application_state') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: opts.groupApplicationOfferId
                    ? { application_offer_id: opts.groupApplicationOfferId }
                    : null,
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
              single: () => Promise.resolve({ data: opts.existingRow ?? null, error: null }),
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

Deno.test('openOffer — candidature absente PARTOUT dans le groupe : elle est créée sur :id', async () => {
  const { db, rec } = fakeDbForOpen({
    offerExists: true,
    groupApplicationOfferId: null,
  });
  const result = await openOffer(db, 'offer-1');
  assertEquals(result.outcome, 'created');
  assertEquals(rec.insertedRows, [{ offer_id: 'offer-1' }]);
});

Deno.test('openOffer — candidature déjà ouverte sur CE MÊME id : idempotent, aucune écriture', async () => {
  const existing: Row = { offer_id: 'offer-1', status: 'postulee' };
  const { db, rec } = fakeDbForOpen({
    offerExists: true,
    groupApplicationOfferId: 'offer-1',
    existingRow: existing,
  });
  const result = await openOffer(db, 'offer-1');
  assertEquals(result.outcome, 'already_open');
  if (result.outcome === 'already_open') assertEquals(result.row, existing);
  assertEquals(rec.insertedRows.length, 0);
});

Deno.test(
  'openOffer — candidature déjà ouverte SUR UNE AUTRE OFFRE DU GROUPE : idempotent, ' +
    'aucune seconde ligne (régression de la revue de la tâche 6)',
  async () => {
    // L'utilisateur agit sur B ; le groupe porte déjà une candidature bien
    // avancée sur A (l'élection d'`offers_dashboard` a changé depuis
    // l'ouverture). Sans résolution de groupe, ceci créerait une SECONDE
    // ligne plus fraîche que celle de A, que `offer_application_state`
    // se mettrait alors à préférer pour tout le groupe — régressant l'état
    // affiché d'`entretien` à `a_traiter` en silence.
    const existingOnA: Row = { offer_id: 'offer-A', status: 'entretien' };
    const { db, rec } = fakeDbForOpen({
      offerExists: true,
      groupApplicationOfferId: 'offer-A',
      existingRow: existingOnA,
    });
    const result = await openOffer(db, 'offer-B');
    assertEquals(result.outcome, 'already_open');
    if (result.outcome === 'already_open') {
      assertEquals(result.row.offer_id, 'offer-A');
      assertEquals(result.row.status, 'entretien');
    }
    assertEquals(rec.insertedRows.length, 0);
  },
);

// --------------------------------------------------------------------------
// patchApplication
// --------------------------------------------------------------------------

interface PatchFakeOptions {
  /** Ce que `offer_application_state` rend pour l'`offer_id` DEMANDÉ. */
  groupApplicationOfferId: string | null;
  current: Row | null;
}

function fakeDbForPatch(
  opts: PatchFakeOptions,
): { db: DbClient; updates: { targetId: string; patch: Row }[] } {
  const updates: { targetId: string; patch: Row }[] = [];
  const db = {
    from(table: string) {
      if (table === 'offer_application_state') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: opts.groupApplicationOfferId
                    ? { application_offer_id: opts.groupApplicationOfferId }
                    : null,
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
              maybeSingle: () => Promise.resolve({ data: opts.current, error: null }),
            }),
          }),
          update: (patchRow: Row) => ({
            eq: (_col: string, val: string) => {
              updates.push({ targetId: val, patch: patchRow });
              return {
                select: () => ({
                  single: () =>
                    Promise.resolve({ data: { ...opts.current, ...patchRow }, error: null }),
                }),
              };
            },
          }),
        };
      }
      throw new Error(`table inattendue : ${table}`);
    },
  } as unknown as DbClient;
  return { db, updates };
}

Deno.test('patchApplication — aucune candidature dans le groupe : outcome not_found', async () => {
  const { db } = fakeDbForPatch({ groupApplicationOfferId: null, current: null });
  const result = await patchApplication(db, 'offer-1', { notes: 'test' });
  assertEquals(result.outcome, 'not_found');
});

Deno.test('patchApplication — outcome sans statut terminé (ni fourni, ni en base) : rejeté', async () => {
  const { db } = fakeDbForPatch({
    groupApplicationOfferId: 'offer-1',
    current: { offer_id: 'offer-1', status: 'postulee', outcome: null },
  });
  await assertRejects(
    () => patchApplication(db, 'offer-1', { outcome: 'refus' }),
    ValidationError,
  );
});

Deno.test('patchApplication — statut postulee sans applied_at (ni fourni, ni en base) : rejeté', async () => {
  const { db } = fakeDbForPatch({
    groupApplicationOfferId: 'offer-1',
    current: { offer_id: 'offer-1', status: 'a_traiter', applied_at: null },
  });
  await assertRejects(
    () => patchApplication(db, 'offer-1', { status: 'postulee' }),
    ValidationError,
  );
});

Deno.test('patchApplication — statut postulee avec applied_at fourni : accepté, status_changed_at posé', async () => {
  const { db, updates } = fakeDbForPatch({
    groupApplicationOfferId: 'offer-1',
    current: { offer_id: 'offer-1', status: 'a_traiter', applied_at: null },
  });
  const result = await patchApplication(db, 'offer-1', {
    status: 'postulee',
    appliedAt: '2026-09-09T08:00:00Z',
  });
  assertEquals(result.outcome, 'updated');
  assertEquals(updates.length, 1);
  assertEquals(updates[0].patch.status, 'postulee');
  assertEquals(updates[0].patch.applied_at, '2026-09-09T08:00:00Z');
  assertEquals(typeof updates[0].patch.status_changed_at, 'string');
});

Deno.test('patchApplication — outcome accepté quand le statut EN BASE est déjà terminee', async () => {
  const { db, updates } = fakeDbForPatch({
    groupApplicationOfferId: 'offer-1',
    current: {
      offer_id: 'offer-1',
      status: 'terminee',
      applied_at: '2026-09-01T00:00:00Z',
      outcome: null,
    },
  });
  const result = await patchApplication(db, 'offer-1', { outcome: 'refus' });
  assertEquals(result.outcome, 'updated');
  assertEquals(updates[0].patch.outcome, 'refus');
  // Le statut n'a pas été redemandé : status_changed_at ne doit pas bouger.
  assertEquals('status_changed_at' in updates[0].patch, false);
});

Deno.test('patchApplication — statut redemandé IDENTIQUE à celui en base : status_changed_at ne bouge pas', async () => {
  // Réduit la surface du défaut n° 1 de la revue : l'élection de groupe se
  // fait sur `status_changed_at desc`, donc ne le bouger que sur une VRAIE
  // transition évite qu'un id périmé paraisse plus « à jour » qu'il ne l'est.
  const { db, updates } = fakeDbForPatch({
    groupApplicationOfferId: 'offer-1',
    current: { offer_id: 'offer-1', status: 'postulee', applied_at: '2026-09-01T00:00:00Z' },
  });
  const result = await patchApplication(db, 'offer-1', { status: 'postulee' });
  assertEquals(result.outcome, 'updated');
  assertEquals(updates[0].patch.status, 'postulee');
  assertEquals('status_changed_at' in updates[0].patch, false);
});

Deno.test('patchApplication — corps vide : rejeté, jamais un UPDATE muet', async () => {
  const { db, updates } = fakeDbForPatch({
    groupApplicationOfferId: 'offer-1',
    current: { offer_id: 'offer-1', status: 'a_traiter' },
  });
  await assertRejects(() => patchApplication(db, 'offer-1', {}), ValidationError);
  assertEquals(updates.length, 0);
});

Deno.test(
  'patchApplication — agit sur B, écrit sur A : la ligne du GROUPE, jamais celle de :id ' +
    '(régression de la revue de la tâche 6)',
  async () => {
    // L'utilisateur ouvre la fiche B (c'est elle qu'`offers_dashboard` élit
    // aujourd'hui), mais la candidature du groupe est en réalité sur A. Sans
    // résolution de groupe, ceci rendrait 404 (« aucune candidature pour B »)
    // alors que le GET précédent montrait un état existant — poussant vers
    // POST /open, qui créerait une seconde ligne et ferait régresser l'état.
    const currentOnA: Row = {
      offer_id: 'offer-A',
      status: 'entretien',
      applied_at: '2026-09-01T00:00:00Z',
    };
    const { db, updates } = fakeDbForPatch({
      groupApplicationOfferId: 'offer-A',
      current: currentOnA,
    });
    const result = await patchApplication(db, 'offer-B', { notes: 'relance prévue jeudi' });
    assertEquals(result.outcome, 'updated');
    assertEquals(updates.length, 1);
    assertEquals(updates[0].targetId, 'offer-A');
    if (result.outcome === 'updated') assertEquals(result.row.offer_id, 'offer-A');
  },
);

// --------------------------------------------------------------------------
// computeStreak
// --------------------------------------------------------------------------

Deno.test('computeStreak — aucun envoi : série à zéro, et le dit', () => {
  const result = computeStreak(new Set(), new Date('2026-09-09T12:00:00Z'));
  assertEquals(result.days, 0);
  assertEquals(result.recentDays.length, 7);
});

Deno.test('computeStreak — trois jours de suite se terminant hier, rien aujourd’hui : série à 3', () => {
  // Aujourd'hui = mercredi 2026-09-09, midi UTC (donc 14 h à Paris — pas
  // d'ambiguïté de fuseau ici). Lundi, mardi, mercredi correspond au schéma
  // de la maquette Suivi.dc.html (L M M envoyés, J V vides) — ici décalé
  // d'un jour : dimanche/lundi/mardi envoyés, rien aujourd'hui.
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

// --- Les deux cas de la revue de la tâche 6 : minuit heure de Paris ---
//
// En septembre, Paris est en CEST, UTC+2. `parisDateKey` est ce que
// `getStats` utilise réellement pour convertir chaque `applied_at` — ces
// tests construisent donc `sentDays` de la même façon que le code de
// production, pour ne pas prouver la fonction contre des données qu'elle ne
// verra jamais en pratique.

Deno.test(
  'computeStreak — n’invente PAS une série sur un envoi juste après minuit (Paris) : ' +
    'le jour sauté casse la série (régression de la revue de la tâche 6)',
  () => {
    const sentDays = new Set([
      parisDateKey(new Date('2026-09-08T16:00:00Z')), // 18 h 00 Paris, jour D-2 → '2026-09-08'
      parisDateKey(new Date('2026-09-09T22:30:00Z')), // 00 h 30 Paris le jour D → '2026-09-10' (D-1, 09-09, est SAUTÉ)
    ]);
    // Une clé en UTC pur aurait donné {'2026-09-08','2026-09-09'} :
    // consécutifs, série à 2, sans qu'aucun jour n'ait vraiment été sauté en
    // heure de Paris. Ici, en Paris, le jour 09-09 est bien absent.
    const result = computeStreak(sentDays, new Date('2026-09-10T10:00:00Z')); // matin Paris du 10
    assertEquals(result.days, 1); // seul « aujourd'hui » (Paris 09-10) compte
  },
);

Deno.test(
  'computeStreak — un envoi juste après minuit (Paris) PROLONGE la série, ne la casse pas ' +
    '(régression de la revue de la tâche 6)',
  () => {
    const sentDays = new Set([
      parisDateKey(new Date('2026-09-08T20:00:00Z')), // 22 h 00 Paris, jour D-2 → '2026-09-08'
      parisDateKey(new Date('2026-09-09T20:00:00Z')), // 22 h 00 Paris, jour D-1 → '2026-09-09'
      parisDateKey(new Date('2026-09-09T22:30:00Z')), // 00 h 30 Paris, jour D  → '2026-09-10'
    ]);
    // Une clé en UTC pur aurait donné {'2026-09-08','2026-09-09'} : le
    // troisième envoi, réellement fait le 10 en heure de Paris, retombe en
    // UTC sur le 09 déjà couvert — aucun jour neuf, la série n'atteint jamais
    // 3 alors que l'utilisateur A agi ce jour-là.
    const result = computeStreak(sentDays, new Date('2026-09-09T22:45:00Z')); // juste après l'envoi
    assertEquals(result.days, 3);
  },
);

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
