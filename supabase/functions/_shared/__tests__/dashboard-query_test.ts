import { assertEquals, assertRejects, assertThrows } from '@std/assert';
import {
  computeStreak,
  getConfig,
  getOfferDetail,
  getStats,
  getStatutCounts,
  getWorkModeCounts,
  importCandidateProfile,
  listOffers,
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

// --------------------------------------------------------------------------
// listOffers — filtres multi-valeurs (tâche 10)
// --------------------------------------------------------------------------

interface RecordedCall {
  method: string;
  args: unknown[];
}

/** Chaînable qui ENREGISTRE chaque appel de filtre plutôt que de les
 * ignorer — `dashboard-api_test.ts` a un `chain()` générique pour les tests
 * de ROUTAGE (peu importe la requête construite) ; celui-ci sert à prouver
 * la requête elle-même, ce que `listOffers` demande vraiment à Postgres. */
function recordingOffersDashboard(calls: RecordedCall[]): DbClient {
  const node: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'is', 'or', 'gte', 'order', 'range']) {
    node[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return node;
    };
  }
  node.then = (
    onfulfilled?: ((value: unknown) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) => Promise.resolve({ data: [], error: null, count: 0 }).then(onfulfilled, onrejected);
  return { from: (_table: string) => node } as unknown as DbClient;
}

const BASE_FILTERS = { sort: 'final_score' as const, page: 1, pageSize: 20 };

Deno.test('listOffers — workMode = [full_remote, non_precise] : composé en OU (or work_mode.is.null,work_mode.in.(...))', async () => {
  const calls: RecordedCall[] = [];
  const db = recordingOffersDashboard(calls);
  await listOffers(db, { ...BASE_FILTERS, workMode: ['full_remote', 'non_precise'] });
  const orCall = calls.find((c) => c.method === 'or');
  assertEquals(orCall?.args, ['work_mode.is.null,work_mode.in.(full_remote)']);
  // Jamais un `.in`/`.is` séparé en plus du `.or` composé, sous peine de
  // ET au lieu de OU (deux appels `.eq`/`.in` successifs de PostgREST se
  // combinent en ET, jamais en OU).
  assertEquals(calls.some((c) => c.method === 'is'), false);
});

Deno.test('listOffers — workMode = [non_precise] seul : .is(work_mode, null), pas de .or', async () => {
  const calls: RecordedCall[] = [];
  const db = recordingOffersDashboard(calls);
  await listOffers(db, { ...BASE_FILTERS, workMode: ['non_precise'] });
  assertEquals(calls.find((c) => c.method === 'is')?.args, ['work_mode', null]);
  assertEquals(calls.some((c) => c.method === 'or'), false);
});

Deno.test('listOffers — workMode = [full_remote, hybride] (aucun non_precise) : .in, pas de .or', async () => {
  const calls: RecordedCall[] = [];
  const db = recordingOffersDashboard(calls);
  await listOffers(db, { ...BASE_FILTERS, workMode: ['full_remote', 'hybride'] });
  assertEquals(
    calls.find((c) => c.method === 'in' && c.args[0] === 'work_mode')?.args,
    ['work_mode', ['full_remote', 'hybride']],
  );
  assertEquals(calls.some((c) => c.method === 'or'), false);
});

Deno.test('listOffers — statut à plusieurs valeurs : .in(candidature_statut, [...])', async () => {
  const calls: RecordedCall[] = [];
  const db = recordingOffersDashboard(calls);
  await listOffers(db, { ...BASE_FILTERS, statut: ['retenue', 'postulee'] });
  assertEquals(
    calls.find((c) => c.method === 'in' && c.args[0] === 'candidature_statut')?.args,
    ['candidature_statut', ['retenue', 'postulee']],
  );
});

Deno.test('listOffers — aucun filtre : aucun appel de restriction (rien ne masque rien)', async () => {
  const calls: RecordedCall[] = [];
  const db = recordingOffersDashboard(calls);
  await listOffers(db, BASE_FILTERS);
  for (const method of ['eq', 'in', 'is', 'or', 'gte']) {
    assertEquals(calls.some((c) => c.method === method), false);
  }
});

Deno.test('listOffers — statut = [aucune] seul : .is(candidature_statut, null), pas de .or', async () => {
  const calls: RecordedCall[] = [];
  const db = recordingOffersDashboard(calls);
  await listOffers(db, { ...BASE_FILTERS, statut: ['aucune'] });
  assertEquals(calls.find((c) => c.method === 'is')?.args, ['candidature_statut', null]);
  assertEquals(calls.some((c) => c.method === 'or'), false);
});

Deno.test("listOffers — statut = [aucune, a_traiter] : composé en OU (c'est l'onglet « À traiter »)", async () => {
  const calls: RecordedCall[] = [];
  const db = recordingOffersDashboard(calls);
  await listOffers(db, { ...BASE_FILTERS, statut: ['aucune', 'a_traiter'] });
  assertEquals(
    calls.find((c) => c.method === 'or')?.args,
    ['candidature_statut.is.null,candidature_statut.in.(a_traiter)'],
  );
  // Jamais un `.in`/`.is` séparé EN PLUS du `.or` : deux appels successifs de
  // PostgREST se combinent en ET, jamais en OU — la liste serait vide.
  assertEquals(calls.some((c) => c.method === 'is'), false);
  assertEquals(calls.some((c) => c.method === 'in' && c.args[0] === 'candidature_statut'), false);
});

Deno.test('listOffers — statut sans « aucune » : .in seul, comportement inchangé', async () => {
  const calls: RecordedCall[] = [];
  const db = recordingOffersDashboard(calls);
  await listOffers(db, { ...BASE_FILTERS, statut: ['postulee'] });
  assertEquals(
    calls.find((c) => c.method === 'in' && c.args[0] === 'candidature_statut')?.args,
    ['candidature_statut', ['postulee']],
  );
  assertEquals(calls.some((c) => c.method === 'or'), false);
});

// --------------------------------------------------------------------------
// getStats — decidedToday (tâche 10, remplace le localStorage de la tâche 7)
// --------------------------------------------------------------------------

function buildStatsDb(applications: Row[]): DbClient {
  function countChain(count: number) {
    return {
      select: () => ({
        gt: () => ({
          is: () => Promise.resolve({ count, error: null }),
          then: (
            onf?: ((v: unknown) => unknown) | null,
          ) => Promise.resolve({ count, error: null }).then(onf),
        }),
        then: (
          onf?: ((v: unknown) => unknown) | null,
        ) => Promise.resolve({ count, error: null }).then(onf),
      }),
    };
  }
  const db = {
    from(table: string) {
      if (table === 'offers') return countChain(0);
      if (table === 'offers_scored') return countChain(0);
      if (table === 'offers_dashboard') return countChain(0);
      if (table === 'offer_applications') {
        return {
          select: () => Promise.resolve({ data: applications, error: null }),
        };
      }
      throw new Error(`table inattendue : ${table}`);
    },
  } as unknown as DbClient;
  return db;
}

Deno.test('getStats — decidedToday compte les VRAIES transitions du jour (heure de Paris), pas les ouvertures', async () => {
  const today = new Date('2026-09-09T10:00:00Z'); // midi Paris, sans ambiguïté
  const applications: Row[] = [
    // Décidée aujourd'hui : compte.
    {
      status: 'retenue',
      outcome: null,
      applied_at: null,
      status_changed_at: '2026-09-09T09:00:00Z',
    },
    // Simplement OUVERTE aujourd'hui (status_changed_at posé par défaut à
    // l'insertion), jamais décidée : ne compte PAS.
    {
      status: 'a_traiter',
      outcome: null,
      applied_at: null,
      status_changed_at: '2026-09-09T08:00:00Z',
    },
    // Décidée hier : ne compte pas aujourd'hui.
    {
      status: 'ecartee',
      outcome: null,
      applied_at: null,
      status_changed_at: '2026-09-08T09:00:00Z',
    },
  ];
  const db = buildStatsDb(applications);
  const stats = await getStats(db, today);
  assertEquals(stats.decidedToday, 1);
});

Deno.test('getStats — decidedToday à zéro le dit, jamais masqué', async () => {
  const db = buildStatsDb([]);
  const stats = await getStats(db, new Date('2026-09-09T10:00:00Z'));
  assertEquals(stats.decidedToday, 0);
});

// --------------------------------------------------------------------------
// getStats — funnel.retained / funnel.applied CUMULATIFS (constat I3, revue
// finale de branche phase 3). Avant correctif : `retained = byStatus.retenue`
// et `applied = byStatus.postulee` — le seul statut COURANT, qui retombe à 0
// dès qu'une candidature avance d'un cran. Ces tests éprouvent l'arithmétique
// elle-même, pas seulement le cas 0 (le seul couvert avant, voir le constat).
// --------------------------------------------------------------------------

Deno.test(
  'getStats — funnel.retained compte TOUTE candidature ayant atteint « retenue » ou plus, ' +
    'pas seulement celles encore AU statut « retenue »',
  async () => {
    const applications: Row[] = [
      // Encore au statut retenue : compte.
      {
        status: 'retenue',
        outcome: null,
        applied_at: null,
        status_changed_at: '2026-09-01T00:00:00Z',
      },
      // Avancée à postulee : DOIT compter aussi — c'est le bug corrigé.
      {
        status: 'postulee',
        outcome: null,
        applied_at: '2026-09-02T00:00:00Z',
        status_changed_at: '2026-09-02T00:00:00Z',
      },
      // Avancée jusqu'à terminee : compte toujours.
      {
        status: 'terminee',
        outcome: 'offre_recue',
        applied_at: '2026-09-03T00:00:00Z',
        status_changed_at: '2026-09-04T00:00:00Z',
      },
      // Jamais décidée : ne compte pas.
      {
        status: 'a_traiter',
        outcome: null,
        applied_at: null,
        status_changed_at: '2026-09-01T00:00:00Z',
      },
      // Écartée directement depuis a_traiter (MatinScreen.decider) : ne
      // compte pas — la base ne garde aucune trace d'un passage par
      // « retenue » qui n'a jamais eu lieu ici.
      {
        status: 'ecartee',
        outcome: null,
        applied_at: null,
        status_changed_at: '2026-09-01T00:00:00Z',
      },
    ];
    const db = buildStatsDb(applications);
    const stats = await getStats(db, new Date('2026-09-09T10:00:00Z'));
    assertEquals(stats.funnel.retained, 3);
  },
);

Deno.test(
  'getStats — funnel.applied compte TOUTE candidature ayant un applied_at, même avancée ' +
    'au-delà de « postulee » ou depuis écartée',
  async () => {
    const applications: Row[] = [
      // Encore au statut postulee : compte.
      {
        status: 'postulee',
        outcome: null,
        applied_at: '2026-09-01T00:00:00Z',
        status_changed_at: '2026-09-01T00:00:00Z',
      },
      // Avancée à relancee : DOIT compter aussi — c'est le bug corrigé.
      {
        status: 'relancee',
        outcome: null,
        applied_at: '2026-09-02T00:00:00Z',
        status_changed_at: '2026-09-03T00:00:00Z',
      },
      // Envoyée puis écartée : applied_at reste posé, compte toujours — un
      // envoi réel a bien eu lieu.
      {
        status: 'ecartee',
        outcome: null,
        applied_at: '2026-09-04T00:00:00Z',
        status_changed_at: '2026-09-05T00:00:00Z',
      },
      // Simplement retenue, jamais envoyée : ne compte pas.
      {
        status: 'retenue',
        outcome: null,
        applied_at: null,
        status_changed_at: '2026-09-01T00:00:00Z',
      },
    ];
    const db = buildStatsDb(applications);
    const stats = await getStats(db, new Date('2026-09-09T10:00:00Z'));
    assertEquals(stats.funnel.applied, 3);
  },
);

// --------------------------------------------------------------------------
// getConfig — poids réglables, profil actif, compétences (tâche 10)
// --------------------------------------------------------------------------

function fakeDbForConfig(opts: {
  weights: { key: string; value: number }[];
  activeProfile: Row | null;
  skills: { term: string }[];
  staleCount: number;
  /** Ce que rend le repli `order('created_at', desc).limit(1)` quand AUCUNE
   * ligne n'est marquée `is_active` — le scénario de la revue de tâche 10
   * (panne entre les deux écritures séquentielles de `importCandidateProfile`).
   * `undefined` par défaut : la table est vide de ce côté, comme dans la
   * plupart des tests qui n'éprouvent pas ce repli. */
  latestFallback?: Row | null;
}): DbClient {
  return {
    from(table: string) {
      if (table === 'scoring_weights') {
        return { select: () => Promise.resolve({ data: opts.weights, error: null }) };
      }
      if (table === 'candidate_profile') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: opts.activeProfile, error: null }),
            }),
            order: () => ({
              limit: () =>
                Promise.resolve({
                  data: opts.latestFallback ? [opts.latestFallback] : [],
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === 'profile_skills') {
        return { select: () => Promise.resolve({ data: opts.skills, error: null }) };
      }
      if (table === 'offer_ai_scores') {
        return {
          select: () => ({
            neq: () => Promise.resolve({ count: opts.staleCount, error: null }),
          }),
        };
      }
      throw new Error(`table inattendue : ${table}`);
    },
  } as unknown as DbClient;
}

Deno.test('getConfig — expose les poids réglables sous forme de map key -> value', async () => {
  const db = fakeDbForConfig({
    weights: [{ key: 'salaire_floor', value: 40000 }, { key: 'tjm_floor', value: 400 }],
    activeProfile: null,
    skills: [],
    staleCount: 0,
  });
  const config = await getConfig(db);
  assertEquals(config.scoringWeights, { salaire_floor: 40000, tjm_floor: 400 });
});

Deno.test('getConfig — aucun profil actif ET aucune ligne du tout : activeProfile null, staleProfileOfferCount à 0', async () => {
  const db = fakeDbForConfig({ weights: [], activeProfile: null, skills: [], staleCount: 999 });
  const config = await getConfig(db);
  assertEquals(config.activeProfile, null);
  assertEquals(config.staleProfileOfferCount, 0);
});

Deno.test(
  'getConfig — AUCUNE ligne marquée is_active (panne entre désactivation et insertion, revue ' +
    'de tâche 10) : retombe sur la plus récente, ne dit JAMAIS "0 offre périmée" à tort',
  async () => {
    const db = fakeDbForConfig({
      weights: [],
      activeProfile: null,
      latestFallback: {
        id: 3,
        label: 'CV orphelin',
        profile_version: 'cv-2026-09-09',
        seniority_years: 7,
        created_at: '2026-09-09T10:00:00Z',
      },
      skills: [],
      // Le piège exact que la revue nomme : si ce repli n'existait pas,
      // staleProfileOfferCount tomberait à 0 (branche `activeProfile === null`)
      // alors que ce nombre d'offres reste bel et bien jugé sous une version
      // antérieure — un silence trompeur, pas une absence honnête.
      staleCount: 1344,
    });
    const config = await getConfig(db);
    assertEquals(config.activeProfile?.id, 3);
    assertEquals(config.activeProfile?.profileVersion, 'cv-2026-09-09');
    assertEquals(config.staleProfileOfferCount, 1344);
  },
);

Deno.test('getConfig — profil actif : profileVersion et compte des offres à profil antérieur', async () => {
  const db = fakeDbForConfig({
    weights: [],
    activeProfile: {
      id: 2,
      label: 'CV v2',
      profile_version: 'cv-2026-09-09',
      seniority_years: 7,
      created_at: '2026-09-09T00:00:00Z',
    },
    skills: [{ term: 'react' }, { term: 'python' }],
    staleCount: 42,
  });
  const config = await getConfig(db);
  assertEquals(config.activeProfile?.profileVersion, 'cv-2026-09-09');
  assertEquals(config.cvSkills, ['react', 'python']);
  assertEquals(config.staleProfileOfferCount, 42);
});

// --------------------------------------------------------------------------
// importCandidateProfile — l'import du CV ne rejuge rien (tâche 10)
// --------------------------------------------------------------------------

function fakeDbForImport(opts: {
  currentVersion: string | null;
  insertedRow: Row;
  staleCount: number;
  /** Simule l'échec de l'écriture d'insertion (ex. coupure réseau APRÈS la
   * désactivation de l'ancien profil) — le scénario de la revue de tâche 10. */
  insertFails?: boolean;
}): { db: DbClient; deactivated: boolean[]; inserted: Row[] } {
  const deactivated: boolean[] = [];
  const inserted: Row[] = [];
  const db = {
    from(table: string) {
      if (table === 'candidate_profile') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: opts.currentVersion === null
                    ? null
                    : { profile_version: opts.currentVersion },
                  error: null,
                }),
            }),
            // Aucun repli à éprouver ici (`fakeDbForConfig` s'en charge côté
            // lecture) : la table est déjà vide de ce côté dans ces tests.
            order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
          }),
          update: (patch: Row) => ({
            eq: () => {
              deactivated.push(patch.is_active === false);
              return Promise.resolve({ data: null, error: null });
            },
          }),
          insert: (row: Row) => {
            inserted.push(row);
            return {
              select: () => ({
                single: () =>
                  Promise.resolve(
                    opts.insertFails
                      ? { data: null, error: { message: 'connexion perdue' } }
                      : { data: opts.insertedRow, error: null },
                  ),
              }),
            };
          },
        };
      }
      if (table === 'offer_ai_scores') {
        return {
          select: () => ({
            neq: () => Promise.resolve({ count: opts.staleCount, error: null }),
          }),
        };
      }
      throw new Error(`table inattendue : ${table}`);
    },
  } as unknown as DbClient;
  return { db, deactivated, inserted };
}

Deno.test('importCandidateProfile — profileVersion identique à la version active : rejeté (400), rien écrit', async () => {
  const { db, deactivated, inserted } = fakeDbForImport({
    currentVersion: 'cv-2026-09-08',
    insertedRow: {},
    staleCount: 0,
  });
  await assertRejects(
    () =>
      importCandidateProfile(db, {
        label: 'CV',
        cvText: 'texte',
        seniorityYears: 7,
        profileVersion: 'cv-2026-09-08',
      }),
    ValidationError,
  );
  assertEquals(deactivated.length, 0);
  assertEquals(inserted.length, 0);
});

Deno.test('importCandidateProfile — version nouvelle : désactive l’ancien profil PUIS insère le nouveau actif', async () => {
  const { db, deactivated, inserted } = fakeDbForImport({
    currentVersion: 'cv-2026-09-08',
    insertedRow: {
      id: 3,
      label: 'CV v3',
      profile_version: 'cv-2026-09-09',
      seniority_years: 7,
      created_at: '2026-09-09T10:00:00Z',
    },
    staleCount: 1269,
  });
  const result = await importCandidateProfile(db, {
    label: 'CV v3',
    cvText: 'texte du CV',
    seniorityYears: 7,
    profileVersion: 'cv-2026-09-09',
  });
  assertEquals(deactivated, [true]);
  assertEquals(inserted[0]?.is_active, true);
  assertEquals(inserted[0]?.label, 'CV v3');
  assertEquals(result.profile.profileVersion, 'cv-2026-09-09');
  // Le compte reflète la version FRAÎCHEMENT importée, pas l'ancienne — voilà
  // ce que l'écran doit dire : "1269 offres jugées sous une version antérieure".
  assertEquals(result.staleProfileOfferCount, 1269);
});

Deno.test('importCandidateProfile — aucun profil actif au départ : accepté (rien à comparer)', async () => {
  const { db, deactivated } = fakeDbForImport({
    currentVersion: null,
    insertedRow: {
      id: 1,
      label: 'Premier CV',
      profile_version: 'cv-2026-09-09',
      seniority_years: 7,
      created_at: '2026-09-09T10:00:00Z',
    },
    staleCount: 0,
  });
  const result = await importCandidateProfile(db, {
    label: 'Premier CV',
    cvText: 'texte',
    seniorityYears: 7,
    profileVersion: 'cv-2026-09-09',
  });
  assertEquals(result.profile.id, 1);
  // Rien n'était actif : la désactivation s'exécute quand même (elle ne
  // touche aucune ligne, `.eq('is_active', true)` sur une table vide de ce
  // côté), mais rien n'échoue.
  assertEquals(deactivated, [true]);
});

Deno.test(
  'importCandidateProfile — désactivation réussie PUIS insertion en échec : l’erreur remonte, ' +
    'RIEN n’est avalé (revue de tâche 10, le trou que la lecture referme ensuite)',
  async () => {
    const { db, deactivated, inserted } = fakeDbForImport({
      currentVersion: 'cv-2026-09-08',
      insertedRow: {},
      staleCount: 0,
      insertFails: true,
    });
    await assertRejects(
      () =>
        importCandidateProfile(db, {
          label: 'CV v3',
          cvText: 'texte',
          seniorityYears: 7,
          profileVersion: 'cv-2026-09-09',
        }),
      Error,
      'connexion perdue',
    );
    // La désactivation, elle, a bien eu lieu — c'est EXACTEMENT le scénario
    // qui laisserait la base sans profil actif si rien ne le couvrait.
    assertEquals(deactivated, [true]);
    assertEquals(inserted.length, 1); // la tentative a eu lieu, seule l'écriture a échoué

    // La lecture qui suit (une requête distincte, comme le ferait un
    // rechargement de l'écran) ne doit JAMAIS annoncer "aucune offre
    // périmée" : `getConfig` retombe sur le profil désactivé — le plus
    // récent qui existe encore — et rend le VRAI compte, pas 0.
    const dbAfterFailure = fakeDbForConfig({
      weights: [],
      activeProfile: null, // plus aucune ligne active : la panne a laissé ce trou
      latestFallback: {
        id: 2,
        label: 'CV v2 (celui que la panne a laissé désactivé)',
        profile_version: 'cv-2026-09-08',
        seniority_years: 7,
        created_at: '2026-09-08T00:00:00Z',
      },
      skills: [],
      staleCount: 1344,
    });
    const config = await getConfig(dbAfterFailure);
    assertEquals(config.activeProfile?.profileVersion, 'cv-2026-09-08');
    assertEquals(config.staleProfileOfferCount, 1344); // jamais 0 : le mensonge que la revue signale
  },
);

// --------------------------------------------------------------------------
// getOfferDetail — provenance fusionnée (found_by_labels / trusted_query)
// --------------------------------------------------------------------------

function fakeDbForDetailWithProvenance(): DbClient {
  const offerRow = { id: 'offer-1', display_key: 'key-1' };
  return {
    from(table: string) {
      if (table === 'offers_dashboard') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: offerRow, error: null }) }),
          }),
        };
      }
      if (table === 'offer_display_groups') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [{ offer_id: 'offer-1' }], error: null }),
          }),
        };
      }
      if (table === 'offers_scored') {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [{ id: 'offer-1', confidence: 'haute', final_score: 80 }],
                error: null,
              }),
          }),
        };
      }
      if (table === 'offers_ranked') {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [
                  {
                    id: 'offer-1',
                    found_by_labels: ['adzuna:local:react-ts'],
                    trusted_query: true,
                  },
                ],
                error: null,
              }),
          }),
        };
      }
      if (table === 'offer_application_state') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
        };
      }
      throw new Error(`table inattendue : ${table}`);
    },
  } as unknown as DbClient;
}

Deno.test('getOfferDetail — found_by_labels/trusted_query lus sur offers_ranked, fusionnés sur offer ET groupJudgements', async () => {
  const db = fakeDbForDetailWithProvenance();
  const detail = await getOfferDetail(db, 'offer-1');
  assertEquals(detail?.offer.found_by_labels, ['adzuna:local:react-ts']);
  assertEquals(detail?.offer.trusted_query, true);
  assertEquals(detail?.groupJudgements[0]?.found_by_labels, ['adzuna:local:react-ts']);
  assertEquals(detail?.groupJudgements[0]?.trusted_query, true);
});

// --------------------------------------------------------------------------
// getWorkModeCounts
// --------------------------------------------------------------------------

function fakeDbForWorkModeCounts(
  rows: { work_mode: string; total: number | string }[] | null,
  error?: { message: string },
): { db: DbClient; tablesLues: string[] } {
  const tablesLues: string[] = [];
  const db = {
    from(table: string) {
      tablesLues.push(table);
      return {
        select: (_cols: string) => Promise.resolve({ data: rows, error: error ?? null }),
      };
    },
  } as unknown as DbClient;
  return { db, tablesLues };
}

Deno.test('getWorkModeCounts lit la vue de comptage, en UNE seule requête', async () => {
  const { db, tablesLues } = fakeDbForWorkModeCounts([
    { work_mode: 'non_precise', total: 861 },
    { work_mode: 'full_remote', total: 173 },
    { work_mode: 'hybride', total: 150 },
    { work_mode: 'sur_site', total: 88 },
  ]);

  const counts = await getWorkModeCounts(db);

  assertEquals(tablesLues, ['offers_dashboard_work_mode_counts']);
  assertEquals(counts, { non_precise: 861, full_remote: 173, hybride: 150, sur_site: 88 });
});

Deno.test('getWorkModeCounts complète à ZÉRO une valeur que la vue ne rend pas', async () => {
  // La vue est un `group by` : elle n'a aucune ligne pour un mode dont aucune
  // offre ne relève. Le panneau doit tout de même afficher les quatre lignes.
  const { db } = fakeDbForWorkModeCounts([{ work_mode: 'hybride', total: 3 }]);

  const counts = await getWorkModeCounts(db);

  assertEquals(counts, { non_precise: 0, full_remote: 0, hybride: 3, sur_site: 0 });
});

Deno.test('getWorkModeCounts ignore une valeur inconnue plutôt que de l’ajouter', async () => {
  const { db } = fakeDbForWorkModeCounts([
    { work_mode: 'hybride', total: 3 },
    { work_mode: 'teletravail_lunaire', total: 99 },
  ]);

  const counts = await getWorkModeCounts(db);

  assertEquals(counts, { non_precise: 0, full_remote: 0, hybride: 3, sur_site: 0 });
});

Deno.test('getWorkModeCounts accepte un total rendu en chaîne (bigint PostgREST)', async () => {
  const { db } = fakeDbForWorkModeCounts([{ work_mode: 'full_remote', total: '173' }]);

  const counts = await getWorkModeCounts(db);

  assertEquals(counts.full_remote, 173);
});

Deno.test('getWorkModeCounts remonte une erreur de base plutôt que des zéros', async () => {
  const { db } = fakeDbForWorkModeCounts(null, { message: 'base indisponible' });

  await assertRejects(() => getWorkModeCounts(db), Error, 'comptage par mode de travail');
});

// --------------------------------------------------------------------------
// getStatutCounts
// --------------------------------------------------------------------------

function fakeDbForStatutCounts(
  rows: { statut: string; total: number | string }[] | null,
  error?: { message: string },
): { db: DbClient; tablesLues: string[] } {
  const tablesLues: string[] = [];
  const db = {
    from(table: string) {
      tablesLues.push(table);
      return {
        select: (_cols: string) => Promise.resolve({ data: rows, error: error ?? null }),
      };
    },
  } as unknown as DbClient;
  return { db, tablesLues };
}

Deno.test('getStatutCounts — lit la vue de comptage, jamais offers_dashboard', async () => {
  const { db, tablesLues } = fakeDbForStatutCounts([{ statut: 'aucune', total: 1258 }]);
  await getStatutCounts(db);
  assertEquals(tablesLues, ['offers_dashboard_status_counts']);
});

Deno.test('getStatutCounts — complète à 0 les huit clefs, y compris absentes de la vue', async () => {
  const { db } = fakeDbForStatutCounts([
    { statut: 'aucune', total: 1258 },
    { statut: 'postulee', total: 6 },
  ]);
  const counts = await getStatutCounts(db);
  assertEquals(counts, {
    aucune: 1258,
    a_traiter: 0,
    retenue: 0,
    postulee: 6,
    relancee: 0,
    entretien: 0,
    terminee: 0,
    ecartee: 0,
  });
});

Deno.test('getStatutCounts — un total rendu en chaîne est converti en nombre', async () => {
  const { db } = fakeDbForStatutCounts([{ statut: 'ecartee', total: '7' }]);
  const counts = await getStatutCounts(db);
  assertEquals(counts.ecartee, 7);
});

Deno.test('getStatutCounts — une valeur inconnue de la vue est ignorée, jamais ajoutée', async () => {
  const { db } = fakeDbForStatutCounts([{ statut: 'inventee', total: 3 }]);
  const counts = await getStatutCounts(db);
  assertEquals(Object.keys(counts).length, 8);
  assertEquals('inventee' in counts, false);
});

Deno.test('getStatutCounts — une erreur de lecture est propagée, jamais avalée', async () => {
  const { db } = fakeDbForStatutCounts(null, { message: 'boom' });
  await assertRejects(() => getStatutCounts(db), Error, 'comptage par statut');
});
