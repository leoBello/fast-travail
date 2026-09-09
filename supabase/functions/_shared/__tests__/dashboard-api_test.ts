import { assertEquals } from '@std/assert';
import { routeDashboardRequest } from '../dashboard-api.ts';
import { MAX_PAGE } from '../dashboard-query.ts';
import type { DbClient } from '../db.ts';

/**
 * Un client qui échoue bruyamment dès qu'on le touche. Sert à prouver
 * qu'une validation invalide est rejetée AVANT tout accès à la base — un
 * paramètre mal formé ne doit jamais déclencher une requête.
 */
function untouchableDb(): DbClient {
  return {
    from(table: string) {
      throw new Error(`la base n'aurait pas dû être touchée (table ${table})`);
    },
  } as unknown as DbClient;
}

/** Chaînable générique : ignore les filtres, résout toujours au même
 * résultat. Sert aux tests de ROUTAGE (bonne route, bon statut, bonne
 * forme de réponse) — la construction précise des requêtes est éprouvée par
 * dashboard-query_test.ts. */
interface CannedResult {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
}

function chain(result: CannedResult): Record<string, unknown> {
  const node: Record<string, unknown> = {
    select: () => chain(result),
    eq: () => chain(result),
    gt: () => chain(result),
    gte: () => chain(result),
    is: () => chain(result),
    in: () => chain(result),
    or: () => chain(result),
    neq: () => chain(result),
    order: () => chain(result),
    range: () => chain(result),
    insert: () => chain(result),
    update: () => chain(result),
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (
      onfulfilled?: ((value: CannedResult) => unknown) | null,
      onrejected?: ((reason: unknown) => unknown) | null,
    ) => Promise.resolve(result).then(onfulfilled, onrejected),
  };
  return node;
}

function fakeDb(byTable: Record<string, CannedResult>, fallback: CannedResult): DbClient {
  return {
    from: (table: string) => chain(byTable[table] ?? fallback),
  } as unknown as DbClient;
}

function req(method: string, path: string, body?: unknown): Request {
  return new Request(`https://example.test${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// --------------------------------------------------------------------------
// Validation — chaque cas doit rendre 400 SANS toucher la base.
// --------------------------------------------------------------------------

const invalidQueryCases: { name: string; path: string }[] = [
  { name: 'sort inconnu', path: '/offers?sort=popularite' },
  { name: 'statut inconnu', path: '/offers?statut=en_cours' },
  { name: 'workMode inconnu', path: '/offers?workMode=teletravail' },
  { name: 'engagement inconnu', path: '/offers?engagement=stage' },
  { name: 'source inconnue', path: '/offers?source=linkedin' },
  { name: 'agenticAi non booléen', path: '/offers?agenticAi=oui' },
  { name: 'minScore hors bornes (>100)', path: '/offers?minScore=150' },
  { name: 'minScore non entier', path: '/offers?minScore=abc' },
  { name: 'page non entière', path: '/offers?page=un' },
  { name: 'page à zéro', path: '/offers?page=0' },
  { name: 'pageSize à zéro', path: '/offers?pageSize=0' },
  // Multi-valeurs (tâche 10) : UNE valeur invalide parmi plusieurs rejette
  // tout l'appel — jamais un tri silencieux qui ignorerait la fautive.
  {
    name: 'statut, deux valeurs dont une inconnue',
    path: '/offers?statut=retenue&statut=en_cours',
  },
  {
    name: 'workMode, deux valeurs dont une inconnue',
    path: '/offers?workMode=full_remote&workMode=teletravail',
  },
];

for (const { name, path } of invalidQueryCases) {
  Deno.test(`GET /offers — ${name} : 400, base non touchée`, async () => {
    const res = await routeDashboardRequest(req('GET', path), { db: untouchableDb() });
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(typeof body.error, 'string');
  });
}

Deno.test('GET /offers — pageSize au-dessus du maximum : bornée, pas rejetée', async () => {
  const db = fakeDb({}, { data: [], error: null, count: 0 });
  const res = await routeDashboardRequest(req('GET', '/offers?pageSize=99999'), { db });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.pageSize, 100);
});

Deno.test('GET /offers — page bien au-dessus du maximum : bornée, pas rejetée (régression de la revue de la tâche 6)', async () => {
  // Une chaîne de 300 chiffres passe la regex d'entier positif ; sans
  // plafond sur `page`, `Number()` la convertit en `Infinity`, qui satisfait
  // `>= 1` et échappait donc à la validation.
  const db = fakeDb({}, { data: [], error: null, count: 0 });
  const hugePage = '9'.repeat(300);
  const res = await routeDashboardRequest(req('GET', `/offers?page=${hugePage}`), { db });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.page, MAX_PAGE);
});

Deno.test('GET /offers/:id — identifiant non UUID : 400, base non touchée', async () => {
  const res = await routeDashboardRequest(req('GET', '/offers/pas-un-uuid'), {
    db: untouchableDb(),
  });
  assertEquals(res.status, 400);
});

Deno.test('POST /offers/:id/open — identifiant non UUID : 400, base non touchée', async () => {
  const res = await routeDashboardRequest(req('POST', '/offers/pas-un-uuid/open'), {
    db: untouchableDb(),
  });
  assertEquals(res.status, 400);
});

Deno.test('PATCH /offers/:id/application — JSON mal formé : 400, base non touchée', async () => {
  const res = await routeDashboardRequest(
    new Request('https://example.test/offers/11111111-1111-1111-1111-111111111111/application', {
      method: 'PATCH',
      body: '{ pas du json',
    }),
    { db: untouchableDb() },
  );
  assertEquals(res.status, 400);
});

Deno.test('PATCH /offers/:id/application — status inconnu : 400, base non touchée', async () => {
  const res = await routeDashboardRequest(
    req('PATCH', '/offers/11111111-1111-1111-1111-111111111111/application', {
      status: 'en_cours',
    }),
    { db: untouchableDb() },
  );
  assertEquals(res.status, 400);
});

Deno.test('PATCH /offers/:id/application — outcome inconnu : 400, base non touchée', async () => {
  const res = await routeDashboardRequest(
    req('PATCH', '/offers/11111111-1111-1111-1111-111111111111/application', {
      outcome: 'peut-etre',
    }),
    { db: untouchableDb() },
  );
  assertEquals(res.status, 400);
});

Deno.test('PATCH /offers/:id/application — date non ISO : 400, base non touchée', async () => {
  const res = await routeDashboardRequest(
    req('PATCH', '/offers/11111111-1111-1111-1111-111111111111/application', {
      appliedAt: 'pas-une-date',
    }),
    { db: untouchableDb() },
  );
  assertEquals(res.status, 400);
});

// --------------------------------------------------------------------------
// Routage — chaque route atteint le bon gestionnaire.
// --------------------------------------------------------------------------

const UUID = '11111111-1111-1111-1111-111111111111';

Deno.test('GET /offers — route vers la liste, forme de réponse paginée', async () => {
  const db = fakeDb(
    { offers_dashboard: { data: [{ id: UUID }], error: null, count: 1 } },
    { data: [], error: null, count: 0 },
  );
  const res = await routeDashboardRequest(req('GET', '/offers'), { db });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.total, 1);
  assertEquals(body.rows.length, 1);
});

Deno.test('GET /brief — route vers le brief', async () => {
  const db = fakeDb(
    { offers_dashboard: { data: [], error: null, count: 0 } },
    { data: [], error: null, count: 0 },
  );
  const res = await routeDashboardRequest(req('GET', '/brief'), { db });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.total, 0);
});

Deno.test('GET /stats — route vers les statistiques', async () => {
  const db = fakeDb(
    {
      offer_applications: { data: [], error: null },
    },
    { data: [], error: null, count: 0 },
  );
  const res = await routeDashboardRequest(req('GET', '/stats'), { db });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.funnel.retained, 0);
  assertEquals(body.byStatus.a_traiter, 0);
});

Deno.test('GET /offers/:id — offre absente : 404', async () => {
  const db = fakeDb(
    { offers_dashboard: { data: null, error: null } },
    { data: null, error: null },
  );
  const res = await routeDashboardRequest(req('GET', `/offers/${UUID}`), { db });
  assertEquals(res.status, 404);
});

Deno.test('GET /offers/:id — offre trouvée : 200, groupe et candidature dans le corps', async () => {
  const db = fakeDb(
    {
      offers_dashboard: { data: { id: UUID, display_key: 'key-1' }, error: null },
      offer_display_groups: { data: [{ offer_id: UUID }], error: null },
      offers_scored: { data: [{ id: UUID, confidence: 'haute', final_score: 80 }], error: null },
      offer_application_state: { data: null, error: null },
    },
    { data: null, error: null },
  );
  const res = await routeDashboardRequest(req('GET', `/offers/${UUID}`), { db });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.offer.id, UUID);
  assertEquals(body.groupJudgements.length, 1);
  assertEquals(body.application, null);
});

Deno.test('POST /offers/:id/open — offre inconnue : 404', async () => {
  const db = fakeDb({ offers: { data: null, error: null } }, { data: null, error: null });
  const res = await routeDashboardRequest(req('POST', `/offers/${UUID}/open`), { db });
  assertEquals(res.status, 404);
});

Deno.test('POST /offers/:id/open — création : 201', async () => {
  // `chain()` générique ne peut pas distinguer les différents appels portés
  // par la même table (l'état du groupe, puis l'insertion) : ce cas précis a
  // donc son propre double, comme `fakeDbForOpen` dans
  // `dashboard-query_test.ts`.
  const db = {
    from(table: string) {
      if (table === 'offers') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: UUID }, error: null }) }),
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
      if (table === 'offer_applications') {
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: () => Promise.resolve({ data: { ...row, status: 'a_traiter' }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`table inattendue : ${table}`);
    },
  } as unknown as DbClient;
  const res = await routeDashboardRequest(req('POST', `/offers/${UUID}/open`), { db });
  assertEquals(res.status, 201);
});

Deno.test('PATCH /offers/:id/application — candidature absente PARTOUT dans le groupe : 404', async () => {
  const db = fakeDb(
    { offer_application_state: { data: null, error: null } },
    { data: null, error: null },
  );
  const res = await routeDashboardRequest(
    req('PATCH', `/offers/${UUID}/application`, { notes: 'ras' }),
    { db },
  );
  assertEquals(res.status, 404);
});

const OTHER_UUID = '22222222-2222-2222-2222-222222222222';

Deno.test(
  'PATCH /offers/:id/application — la candidature existe sur UNE AUTRE offre du groupe : 200, ' +
    'écrit sur cette ligne-là (régression de la revue de la tâche 6)',
  async () => {
    const db = {
      from(table: string) {
        if (table === 'offer_application_state') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: { application_offer_id: OTHER_UUID }, error: null }),
              }),
            }),
          };
        }
        if (table === 'offer_applications') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      offer_id: OTHER_UUID,
                      status: 'entretien',
                      applied_at: '2026-09-01T00:00:00Z',
                    },
                    error: null,
                  }),
              }),
            }),
            update: (patchRow: Record<string, unknown>) => ({
              eq: (_col: string, val: string) => {
                assertEquals(val, OTHER_UUID); // jamais UUID (l'id littéral de l'URL)
                return {
                  select: () => ({
                    single: () =>
                      Promise.resolve({
                        data: { offer_id: OTHER_UUID, status: 'entretien', ...patchRow },
                        error: null,
                      }),
                  }),
                };
              },
            }),
          };
        }
        throw new Error(`table inattendue : ${table}`);
      },
    } as unknown as DbClient;
    const res = await routeDashboardRequest(
      req('PATCH', `/offers/${UUID}/application`, { notes: 'relance prévue' }),
      { db },
    );
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.offer_id, OTHER_UUID);
  },
);

Deno.test('route inconnue : 404', async () => {
  const res = await routeDashboardRequest(req('GET', '/inconnue'), { db: untouchableDb() });
  assertEquals(res.status, 404);
});

Deno.test('méthode non gérée sur une route connue : 404, pas un défaut silencieux', async () => {
  const res = await routeDashboardRequest(req('DELETE', '/offers'), { db: untouchableDb() });
  assertEquals(res.status, 404);
});

// --------------------------------------------------------------------------
// Erreur de base : jamais la clé service_role, jamais du texte brut opaque.
// --------------------------------------------------------------------------

Deno.test('erreur de lecture : 500 avec un message JSON, jamais un plantage muet', async () => {
  const db = fakeDb(
    { offers_dashboard: { data: null, error: { message: 'connexion refusée' } } },
    { data: null, error: null },
  );
  const res = await routeDashboardRequest(req('GET', '/offers'), { db });
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(typeof body.error, 'string');
});

// --------------------------------------------------------------------------
// GET /offers — filtres multi-valeurs, plusieurs occurrences acceptées (tâche 10)
// --------------------------------------------------------------------------

Deno.test('GET /offers — workMode=full_remote&workMode=non_precise : 200, composé sans rejet', async () => {
  const db = fakeDb(
    { offers_dashboard: { data: [], error: null, count: 0 } },
    { data: [], error: null, count: 0 },
  );
  const res = await routeDashboardRequest(
    req('GET', '/offers?workMode=full_remote&workMode=non_precise'),
    { db },
  );
  assertEquals(res.status, 200);
});

Deno.test('GET /offers — statut=retenue&statut=postulee : 200', async () => {
  const db = fakeDb(
    { offers_dashboard: { data: [], error: null, count: 0 } },
    { data: [], error: null, count: 0 },
  );
  const res = await routeDashboardRequest(req('GET', '/offers?statut=retenue&statut=postulee'), {
    db,
  });
  assertEquals(res.status, 200);
});

// --------------------------------------------------------------------------
// GET /config (tâche 10)
// --------------------------------------------------------------------------

Deno.test('GET /config — route vers la configuration : 200, forme attendue', async () => {
  const db = {
    from(table: string) {
      if (table === 'scoring_weights') {
        return {
          select: () =>
            Promise.resolve({ data: [{ key: 'salaire_floor', value: 40000 }], error: null }),
        };
      }
      if (table === 'candidate_profile') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
        };
      }
      if (table === 'profile_skills') {
        return { select: () => Promise.resolve({ data: [{ term: 'react' }], error: null }) };
      }
      throw new Error(`table inattendue : ${table}`);
    },
  } as unknown as DbClient;
  const res = await routeDashboardRequest(req('GET', '/config'), { db });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.scoringWeights, { salaire_floor: 40000 });
  assertEquals(body.activeProfile, null);
  assertEquals(body.cvSkills, ['react']);
  assertEquals(body.staleProfileOfferCount, 0);
});

// --------------------------------------------------------------------------
// POST /candidate-profile — l'import du CV (tâche 10)
// --------------------------------------------------------------------------

const invalidCandidateProfileCases: { name: string; body: unknown }[] = [
  { name: 'label absent', body: { cvText: 'x', seniorityYears: 7, profileVersion: 'v2' } },
  {
    name: 'label vide',
    body: { label: '  ', cvText: 'x', seniorityYears: 7, profileVersion: 'v2' },
  },
  { name: 'cvText absent', body: { label: 'CV', seniorityYears: 7, profileVersion: 'v2' } },
  {
    name: 'seniorityYears non numérique',
    body: { label: 'CV', cvText: 'x', seniorityYears: 'sept', profileVersion: 'v2' },
  },
  {
    name: 'seniorityYears négatif',
    body: { label: 'CV', cvText: 'x', seniorityYears: -1, profileVersion: 'v2' },
  },
  {
    name: 'profileVersion absente',
    body: { label: 'CV', cvText: 'x', seniorityYears: 7 },
  },
];

for (const { name, body } of invalidCandidateProfileCases) {
  Deno.test(`POST /candidate-profile — ${name} : 400, base non touchée`, async () => {
    const res = await routeDashboardRequest(req('POST', '/candidate-profile', body), {
      db: untouchableDb(),
    });
    assertEquals(res.status, 400);
  });
}

Deno.test('POST /candidate-profile — entrée valide : 201, désactive puis insère, ne touche jamais offer_ai_scores en ÉCRITURE', async () => {
  const writes: string[] = [];
  const db = {
    from(table: string) {
      if (table === 'candidate_profile') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { profile_version: 'cv-2026-09-08' }, error: null }),
            }),
          }),
          update: (_patch: Record<string, unknown>) => ({
            eq: () => {
              writes.push('deactivate');
              return Promise.resolve({ data: null, error: null });
            },
          }),
          insert: (_row: Record<string, unknown>) => {
            writes.push('insert');
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: {
                      id: 2,
                      label: 'CV v2',
                      profile_version: 'cv-2026-09-09',
                      seniority_years: 7,
                      created_at: '2026-09-09T10:00:00Z',
                    },
                    error: null,
                  }),
              }),
            };
          },
        };
      }
      if (table === 'offer_ai_scores') {
        return { select: () => ({ neq: () => Promise.resolve({ count: 1269, error: null }) }) };
      }
      throw new Error(`table inattendue : ${table}`);
    },
  } as unknown as DbClient;

  const res = await routeDashboardRequest(
    req('POST', '/candidate-profile', {
      label: 'CV v2',
      cvText: 'texte du CV',
      seniorityYears: 7,
      profileVersion: 'cv-2026-09-09',
    }),
    { db },
  );
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.profile.profileVersion, 'cv-2026-09-09');
  assertEquals(body.staleProfileOfferCount, 1269);
  assertEquals(writes, ['deactivate', 'insert']);
});

Deno.test('POST /candidate-profile — même profileVersion que le profil actif : 400 (CLAUDE.md : jamais sans faire évoluer la version)', async () => {
  const db = {
    from(table: string) {
      if (table === 'candidate_profile') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { profile_version: 'cv-2026-09-08' }, error: null }),
            }),
          }),
          update: () => {
            throw new Error("n'aurait pas dû écrire : rejeté avant toute écriture");
          },
        };
      }
      throw new Error(`table inattendue : ${table}`);
    },
  } as unknown as DbClient;
  const res = await routeDashboardRequest(
    req('POST', '/candidate-profile', {
      label: 'CV',
      cvText: 'texte',
      seniorityYears: 7,
      profileVersion: 'cv-2026-09-08',
    }),
    { db },
  );
  assertEquals(res.status, 400);
});
