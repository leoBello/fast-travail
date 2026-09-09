# La veille par onglets — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** « Toute la veille » porte une barre d'onglets par statut de candidature, et une page qui tient dans la fenêtre sans jamais la faire défiler.

**Architecture:** Un onglet est un filtre `statut` déjà supporté par `GET /offers`, élargi d'une valeur `aucune` qui vaut `candidature_statut is null` — le miroir exact de `non_precise` pour `work_mode`. Les comptes d'onglets viennent d'une **vue de comptage** (`offers_dashboard_status_counts`), jamais de sept `pageSize=1`. La taille de page est **mesurée** sur la hauteur disponible plutôt que fixée, ce qui supprime le défilement au lieu de le déplacer.

**Tech Stack:** Postgres (migration), Deno + `@std/assert` (Edge Function `api-dashboard`), React 19 + Vite + Vitest + Testing Library (SPA `dashboard/`).

## Global Constraints

- **Maquettes** : `docs/design/maquettes/Main.dc.html`, `VeilleRepliee.dc.html`, `OngletsSuivi.dc.html`. Elles gouvernent (`GUIDELINES.md` §2 et §5) — valeurs reprises telles quelles, icônes comprises.
- **Aucun contournement du linter** : ni `deno-lint-ignore`, ni `eslint-disable`, ni `@ts-ignore`, ni `@ts-expect-error`, ni `as any`. Le seul `as unknown as DbClient` admis est dans les faux clients de test.
- **Aucune chaîne en dur, aucune couleur en dur, aucun emoji** (`GUIDELINES.md` §3.8) : tout texte passe par `t()`, toute couleur par `var(--…)`, toute icône est un SVG au trait.
- **Porte unique** avant chaque commit, dans le **même** appel shell :
  `export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify`
- **`_shared/` est runtime-neutre** : aucun `Deno.*`, aucun `node:` dans `supabase/functions/_shared/`.
- **Toute vue nouvelle porte `security_invoker = on` dès sa création.**
- **Une absence se nomme, jamais elle ne se vide** (§3.1) ; **`null` est porteur de sens** (§3.2) ; **jamais une affordance qui annonce un fait qu'aucun code ne rend vrai** (§3.3).
- **Un élément dessiné mais pas encore branché s'implémente désactivé**, jamais retiré (§5.2).
- **Redéployer `api-dashboard` après toute modification** de `supabase/functions/api-dashboard/` ou de `_shared/dashboard-*.ts` : `npm run fn:deploy:api-dashboard`. L'oubli est silencieux.

## Ce que ce plan ne fait PAS

Les neuf écarts maquette/implémentation de **P25** (`docs/ETAT.md`) sont traités par une **passe dédiée, après ce plan**. Une seule exception, tâche 6 : le code de pagination réécrit ici ne doit pas reconduire l'écart (f).

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `supabase/migrations/20260910060000_offers_dashboard_status_counts.sql` | **Créer.** La vue de comptage par statut. |
| `supabase/functions/_shared/dashboard-query.ts` | **Modifier.** `STATUT_UNDECIDED`, `StatutFilter`, `StatutCounts`, `getStatutCounts`, et le `OU` sur `null` dans `listOffers`. |
| `supabase/functions/_shared/dashboard-api.ts` | **Modifier.** Parseur `statut` élargi, route `GET /statut-counts`. |
| `dashboard/src/data/types.ts` | **Modifier.** Miroirs `STATUT_UNDECIDED`, `StatutFilter`, `StatutCounts`. |
| `dashboard/src/data/client.ts` | **Modifier.** `getStatutCounts()`, `statut` typé `StatutFilter[]`. |
| `dashboard/src/data/format.ts` | **Modifier.** `formatDateCandidature`. |
| `dashboard/src/screens/matin/hooks.ts` | **Modifier.** `useStatutCounts`, `statut` dans `OffersListParams`. |
| `dashboard/src/ui/kit/StatusBadge.tsx` | **Modifier.** Exporter `TON_STATUT` — on étend le kit, on ne le double pas (§1). |
| `dashboard/src/screens/matin/StatusTabs.tsx` + `.module.css` | **Créer.** La barre d'onglets. |
| `dashboard/src/screens/matin/usePageSizeAjustee.ts` | **Créer.** La taille de page mesurée. |
| `dashboard/src/screens/matin/Pagination.tsx` + `.module.css` | **Modifier.** Numérotation optionnelle. |
| `dashboard/src/screens/matin/MorningBand.tsx` + `.module.css` | **Modifier.** Le repli. |
| `dashboard/src/screens/matin/OfferRow.tsx` + `.module.css` | **Modifier.** Colonnes contextuelles. |
| `dashboard/src/screens/matin/OfferList.tsx` + `.module.css` | **Modifier.** Onglets, en-têtes contextuels, hauteur bornée. |
| `dashboard/src/screens/matin/MatinScreen.tsx` + `.module.css` | **Modifier.** Le câblage. |
| `dashboard/src/i18n/fr.ts` | **Modifier.** Les libellés. |

---

### Task 1 : La vue de comptage par statut

**Files:**
- Create: `supabase/migrations/20260910060000_offers_dashboard_status_counts.sql`
- Modify: `supabase/functions/_shared/dashboard-query.ts`
- Test: `supabase/functions/_shared/__tests__/dashboard-query_test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `STATUT_UNDECIDED = 'aucune'`, `type StatutFilter = ApplicationStatus | 'aucune'`, `type StatutCounts = Record<StatutFilter, number>`, `getStatutCounts(db: DbClient): Promise<StatutCounts>`.

- [ ] **Step 1 : écrire la migration**

Créer `supabase/migrations/20260910060000_offers_dashboard_status_counts.sql` :

```sql
-- Les huit valeurs de statut de candidature, chiffrees en UN balayage.
--
-- La barre d'onglets de « Toute la veille » affiche un compte par onglet.
-- Le reflexe a NE PAS avoir sur ce schema serait sept appels
-- `GET /offers?statut=…&pageSize=1` dont seul le `total` est lu : le cout
-- d'une lecture d'`offers_dashboard` NE DEPEND PAS de `pageSize` -- ni le
-- `distinct on` ni les fonctions de fenetrage ne laissent descendre un
-- filtre, donc la vue est integralement materialisee avant que le statut ne
-- retienne quoi que ce soit. Sept nombres couteraient sept balayages du
-- corpus. C'est exactement la lecon de `20260910050000` (work_mode), et
-- CLAUDE.md l'ecrit noir sur blanc.
--
-- `coalesce(candidature_statut, 'aucune')` porte la meme convention que le
-- filtre de lecture (`STATUT_UNDECIDED`, dashboard-query.ts) : une offre sans
-- ligne `offer_applications` est une valeur NOMMEE, jamais un silence.
-- 'aucune' n'entre en collision avec aucune valeur de
-- `offer_applications_status_connu` (a_traiter, retenue, postulee, relancee,
-- entretien, terminee, ecartee).
--
-- Cette vue ne rend QUE les valeurs presentes. C'est `getStatutCounts`
-- (dashboard-query.ts) qui complete a 0 les huit clefs, pour qu'un onglet
-- dont aucune offre ne releve affiche « 0 » plutot que de disparaitre.
create or replace view offers_dashboard_status_counts as
select
  coalesce(candidature_statut, 'aucune') as statut,
  count(*)                               as total
from offers_dashboard
group by 1;

-- `security_invoker` pose des la creation, jamais ajoute apres coup : sans lui
-- la vue s'executerait avec les droits de son proprietaire et rendrait a la
-- cle `anon` ce que le RLS lui refuse par les tables. Voir `20260910020000`,
-- `20260910040000` et `20260910050000`.
alter view offers_dashboard_status_counts set (security_invoker = on);
```

- [ ] **Step 2 : appliquer la migration et vérifier la vue**

```bash
npx supabase db push
```

Puis les deux sondes que CLAUDE.md prescrit. La première doit rendre les huit lignes présentes :

```bash
npx supabase db query --linked "select statut, total from offers_dashboard_status_counts order by total desc"
```

Attendu, à la date de rédaction (les nombres bougent chaque matin — on vérifie la FORME, pas les valeurs) : une ligne `aucune` largement majoritaire, plus une ligne par statut réellement présent.

La seconde doit rendre **zéro ligne** — aucune vue lisible par `anon` :

```bash
npx supabase db query --linked "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' and coalesce(array_to_string(c.reloptions,','),'') not like '%security_invoker=on%' order by 1"
```

- [ ] **Step 3 : écrire le test qui échoue**

Ajouter à la fin de `supabase/functions/_shared/__tests__/dashboard-query_test.ts` :

```ts
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
```

Ajouter `getStatutCounts` à la liste d'imports en tête du fichier (ordre alphabétique, entre `getStats` et `importCandidateProfile`).

- [ ] **Step 4 : lancer le test, vérifier qu'il échoue**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read --allow-env supabase/functions/_shared/__tests__/dashboard-query_test.ts
```

Attendu : ÉCHEC — `getStatutCounts` n'est pas exporté par `../dashboard-query.ts`.

- [ ] **Step 5 : implémenter**

Dans `supabase/functions/_shared/dashboard-query.ts`, juste après le bloc `getWorkModeCounts` :

```ts
/**
 * La valeur de filtre « aucune décision » — une offre sans ligne
 * `offer_applications`, donc `candidature_statut` nul.
 *
 * Miroir EXACT de `WORK_MODE_UNSPECIFIED` : le même problème (une colonne
 * nullable qu'un `in` ne matche jamais) appelle la même réponse, et deux
 * conventions différentes pour la même chose seraient un dialecte de plus.
 * N'entre en collision avec aucune valeur d'`APPLICATION_STATUSES`.
 */
export const STATUT_UNDECIDED = 'aucune';
export type StatutFilter = ApplicationStatus | typeof STATUT_UNDECIDED;

/** Les huit valeurs de statut chiffrées : les sept étapes, plus « aucune
 * décision ». TOUJOURS les huit clefs, y compris à zéro — un onglet à zéro
 * se lit « 0 », il ne disparaît pas (GUIDELINES §3.3). */
export type StatutCounts = Record<StatutFilter, number>;

/**
 * `GET /statut-counts` : un seul balayage pour les huit nombres.
 *
 * Voir la migration `20260910060000` pour le pourquoi : sept
 * `GET /offers?statut=…&pageSize=1` coûteraient sept balayages du corpus,
 * le coût d'une lecture d'`offers_dashboard` ne dépendant pas de `pageSize`.
 */
export async function getStatutCounts(db: DbClient): Promise<StatutCounts> {
  const { data, error } = await db.from('offers_dashboard_status_counts').select('statut, total');
  if (error) throw new Error(`comptage par statut : ${error.message}`);

  const counts = Object.fromEntries(
    [...APPLICATION_STATUSES, STATUT_UNDECIDED].map((statut) => [statut, 0]),
  ) as StatutCounts;
  for (const row of (data ?? []) as { statut: string; total: number | string }[]) {
    // Une valeur que la vue rendrait sans que le code la connaisse est
    // ignorée plutôt qu'ajoutée : le contrat de sortie est fermé sur les huit
    // clefs, et une neuvième ferait mentir le type sans que rien ne le
    // signale. Même règle que `getWorkModeCounts`.
    if (row.statut in counts) counts[row.statut as StatutFilter] = Number(row.total);
  }
  return counts;
}
```

- [ ] **Step 6 : lancer le test, vérifier qu'il passe**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read --allow-env supabase/functions/_shared/__tests__/dashboard-query_test.ts
```

Attendu : PASS, 5 tests de plus qu'avant.

- [ ] **Step 7 : porte unique, puis commit**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
```

```bash
git add supabase/migrations/20260910060000_offers_dashboard_status_counts.sql supabase/functions/_shared/dashboard-query.ts supabase/functions/_shared/__tests__/dashboard-query_test.ts
git commit -m "$(cat <<'EOF'
feat(veille): une vue de comptage par statut, un balayage au lieu de sept

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2 : `listOffers` accepte « aucune décision »

**Files:**
- Modify: `supabase/functions/_shared/dashboard-query.ts`
- Test: `supabase/functions/_shared/__tests__/dashboard-query_test.ts`

**Interfaces:**
- Consumes: `STATUT_UNDECIDED`, `StatutFilter` (tâche 1).
- Produces: `OffersListFilters.statut?: StatutFilter[]` — `['aucune','a_traiter']` compose un `OU` sur `candidature_statut.is.null` et `candidature_statut.in.(a_traiter)`.

**Pourquoi cette tâche existe :** `listOffers` compose aujourd'hui `.in('candidature_statut', …)`, et **`in` ne matche jamais `null`**. L'onglet « À traiter » — 1 258 offres sur 1 272 — serait donc vide sans ce changement. Il porte **deux** valeurs, pas une : une offre dont le détail a été ouvert sans décision porte `a_traiter` (posé par `openOffer`), et elle reste à traiter.

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter dans `dashboard-query_test.ts`, après le bloc `listOffers` existant :

```ts
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
```

- [ ] **Step 2 : lancer, vérifier l'échec**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read --allow-env supabase/functions/_shared/__tests__/dashboard-query_test.ts
```

Attendu : ÉCHEC — le test « aucune, a_traiter » ne trouve aucun appel `or` (`undefined`), et le type `statut: ['aucune']` est refusé.

- [ ] **Step 3 : implémenter**

Dans `OffersListFilters`, remplacer la ligne `statut?: ApplicationStatus[];` par :

```ts
  /** Accepte `STATUT_UNDECIDED` en plus des sept statuts : `in` ne matche
   * jamais `null`, et l'onglet « À traiter » porte 1 258 offres sur 1 272. */
  statut?: StatutFilter[];
```

Dans `listOffers`, remplacer le bloc :

```ts
  if (filters.statut !== undefined && filters.statut.length > 0) {
    query = query.in('candidature_statut', filters.statut);
  }
```

par :

```ts
  if (filters.statut !== undefined && filters.statut.length > 0) {
    // Même composition que `workMode` plus bas, et pour la même raison :
    // `in` ne matche JAMAIS `null`. L'onglet « À traiter » envoie deux
    // valeurs — `aucune` (jamais ouverte) et `a_traiter` (ouverte sans
    // décision, posé par `openOffer`) — qui doivent se composer en OU. Deux
    // appels PostgREST successifs se combineraient en ET et rendraient une
    // liste vide, sans la moindre erreur.
    const contientSansDecision = filters.statut.includes(STATUT_UNDECIDED);
    const statutsConnus = filters.statut.filter(
      (v): v is ApplicationStatus => v !== STATUT_UNDECIDED,
    );
    if (contientSansDecision && statutsConnus.length > 0) {
      query = query.or(
        `candidature_statut.is.null,candidature_statut.in.(${statutsConnus.join(',')})`,
      );
    } else if (contientSansDecision) {
      query = query.is('candidature_statut', null);
    } else {
      query = query.in('candidature_statut', statutsConnus);
    }
  }
```

- [ ] **Step 4 : lancer, vérifier que ça passe**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read --allow-env supabase/functions/_shared/__tests__/dashboard-query_test.ts
```

Attendu : PASS.

- [ ] **Step 5 : porte unique, puis commit**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
```

```bash
git add supabase/functions/_shared/dashboard-query.ts supabase/functions/_shared/__tests__/dashboard-query_test.ts
git commit -m "$(cat <<'EOF'
feat(veille): listOffers compose un OU sur candidature_statut nul

`in` ne matche jamais null : sans ce OU, l'onglet « A traiter » aurait
rendu zero ligne sur 1 258.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3 : La route `GET /statut-counts` et le paramètre `statut` élargi

**Files:**
- Modify: `supabase/functions/_shared/dashboard-api.ts`
- Test: `supabase/functions/_shared/__tests__/dashboard-api_test.ts`

**Interfaces:**
- Consumes: `getStatutCounts`, `STATUT_UNDECIDED`, `StatutFilter` (tâches 1-2).
- Produces: `GET /statut-counts` → `StatutCounts` en JSON ; `GET /offers?statut=aucune&statut=a_traiter` accepté.

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter à `supabase/functions/_shared/__tests__/dashboard-api_test.ts` (reprendre le `chain()` générique et le `deps` déjà présents dans ce fichier pour construire `db`) :

```ts
Deno.test('GET /statut-counts — répond 200 et rend les huit clefs', async () => {
  const db = {
    from: (_t: string) => ({
      select: (_c: string) =>
        Promise.resolve({ data: [{ statut: 'aucune', total: 1258 }], error: null }),
    }),
  } as unknown as DbClient;
  const res = await handleDashboardRequest(
    new Request('https://x/api-dashboard/statut-counts'),
    { db },
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.aucune, 1258);
  assertEquals(body.postulee, 0);
  assertEquals(Object.keys(body).length, 8);
});

Deno.test('GET /offers?statut=aucune — accepté (la valeur « sans décision »)', async () => {
  const res = await handleDashboardRequest(
    new Request('https://x/api-dashboard/offers?statut=aucune'),
    { db: dbQuiRendUnePageVide() },
  );
  assertEquals(res.status, 200);
});

Deno.test('GET /offers?statut=inventee — rejeté en 400, jamais un repli silencieux', async () => {
  const res = await handleDashboardRequest(
    new Request('https://x/api-dashboard/offers?statut=inventee'),
    { db: dbQuiRendUnePageVide() },
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(String(body.error).includes('statut'), true);
});
```

Si `dbQuiRendUnePageVide()` n'existe pas déjà dans ce fichier sous un autre nom, l'ajouter au-dessus des trois tests :

```ts
/** Un client de base qui répond « page vide » à n'importe quelle chaîne de
 * filtres : ces tests prouvent le ROUTAGE et la VALIDATION, pas la requête
 * construite (celle-là est prouvée par `dashboard-query_test.ts`). */
function dbQuiRendUnePageVide(): DbClient {
  const node: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'is', 'or', 'gte', 'order', 'range']) {
    node[method] = () => node;
  }
  node.then = (
    onfulfilled?: ((value: unknown) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) => Promise.resolve({ data: [], error: null, count: 0 }).then(onfulfilled, onrejected);
  return { from: (_table: string) => node } as unknown as DbClient;
}
```

- [ ] **Step 2 : lancer, vérifier l'échec**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read --allow-env supabase/functions/_shared/__tests__/dashboard-api_test.ts
```

Attendu : ÉCHEC — 404 sur `/statut-counts`, et 400 sur `statut=aucune`.

- [ ] **Step 3 : implémenter**

Ajouter aux imports de `dashboard-api.ts` (ordre alphabétique) : `getStatutCounts`, `STATUT_UNDECIDED`, `type StatutFilter`.

Ajouter le parseur, juste après `parseWorkModeParamMulti` :

```ts
/** Version « plusieurs valeurs » de `statut`, élargie à `STATUT_UNDECIDED` —
 * c'est cette valeur qui rend l'onglet « À traiter » possible (`in` ne
 * matche jamais `null`). Même forme que `parseWorkModeParamMulti`. */
function parseStatutParamMulti(params: URLSearchParams): StatutFilter[] | undefined {
  const raw = params.getAll('statut');
  if (raw.length === 0) return undefined;
  for (const value of raw) {
    if (value !== STATUT_UNDECIDED && !(APPLICATION_STATUSES as readonly string[]).includes(value)) {
      throw new ValidationError(
        `paramètre "statut" invalide : "${value}" — attendu parmi ${
          APPLICATION_STATUSES.join(', ')
        }, ${STATUT_UNDECIDED}`,
      );
    }
  }
  return raw as StatutFilter[];
}
```

Dans `parseOffersListFilters`, remplacer :

```ts
  const statut = requireEnumParamMulti(params, 'statut', APPLICATION_STATUSES);
```

par :

```ts
  const statut = parseStatutParamMulti(params);
```

Ajouter la route, juste après celle de `/work-mode-counts` :

```ts
    if (req.method === 'GET' && path === '/statut-counts') {
      return Response.json(await getStatutCounts(db));
    }
```

- [ ] **Step 4 : lancer, vérifier que ça passe**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read --allow-env supabase/functions/_shared/__tests__/dashboard-api_test.ts
```

Attendu : PASS.

- [ ] **Step 5 : déployer, et vérifier que le déploiement a bien eu lieu**

```bash
npm run fn:deploy:api-dashboard
npx supabase functions list
```

Attendu : la ligne `api-dashboard` porte un `updated_at` de l'instant. **Un oubli de déploiement est silencieux** : la fonction répond toujours 200, avec l'ancien comportement.

- [ ] **Step 6 : porte unique, puis commit**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
```

```bash
git add supabase/functions/_shared/dashboard-api.ts supabase/functions/_shared/__tests__/dashboard-api_test.ts
git commit -m "$(cat <<'EOF'
feat(api): GET /statut-counts, et statut=aucune accepte sur /offers

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4 : Le client SPA — types, `getStatutCounts`, hooks

**Files:**
- Modify: `dashboard/src/data/types.ts`, `dashboard/src/data/client.ts`, `dashboard/src/screens/matin/hooks.ts`
- Test: `dashboard/src/data/client.test.ts`

**Interfaces:**
- Consumes: `GET /statut-counts`, `GET /offers?statut=…` (tâche 3).
- Produces: `STATUT_UNDECIDED`, `StatutFilter`, `StatutCounts` dans `types.ts` ; `client.getStatutCounts(): Promise<StatutCounts>` ; `useStatutCounts(client)` ; `OffersListParams.statut?: StatutFilter[]`.

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter à `dashboard/src/data/client.test.ts`, dans le `describe('createDashboardClient', …)` :

```ts
it('getStatutCounts appelle GET /statut-counts', async () => {
  let url = '';
  const client = createDashboardClient({
    ...CONFIG,
    fetchImpl: fakeFetch((u) => {
      url = u;
      return jsonResponse(200, {
        aucune: 1258,
        a_traiter: 0,
        retenue: 0,
        postulee: 6,
        relancee: 1,
        entretien: 0,
        terminee: 0,
        ecartee: 7,
      });
    }),
  });
  const counts = await client.getStatutCounts();
  expect(url.endsWith('/statut-counts')).toBe(true);
  expect(counts.aucune).toBe(1258);
  expect(counts.postulee).toBe(6);
});

it('listOffers pose statut une fois par valeur (?statut=aucune&statut=a_traiter)', async () => {
  let url = '';
  const client = createDashboardClient({
    ...CONFIG,
    fetchImpl: fakeFetch((u) => {
      url = u;
      return jsonResponse(200, { rows: [], total: 0, page: 1, pageSize: 8 });
    }),
  });
  await client.listOffers({ statut: ['aucune', 'a_traiter'] });
  expect(url).toContain('statut=aucune');
  expect(url).toContain('statut=a_traiter');
});
```

- [ ] **Step 2 : lancer, vérifier l'échec**

```bash
npm --prefix dashboard run test -- --run src/data/client.test.ts
```

Attendu : ÉCHEC — `client.getStatutCounts is not a function`.

- [ ] **Step 3 : implémenter les types**

Dans `dashboard/src/data/types.ts`, juste après le bloc `WorkModeCounts` :

```ts
// Même valeur que `STATUT_UNDECIDED` (dashboard-query.ts) : une offre sans
// ligne `offer_applications`, donc `candidature_statut` nul. `in` ne matche
// jamais `null` — c'est ce qui rend l'onglet « À traiter » possible.
export const STATUT_UNDECIDED = 'aucune' as const;
export type StatutFilter = ApplicationStatus | typeof STATUT_UNDECIDED;

/** Ce que rend `GET /statut-counts` : TOUJOURS les huit clefs, y compris à
 * zéro. La vue de comptage ne rend que les valeurs présentes ; le serveur
 * complète (voir `getStatutCounts`, dashboard-query.ts), pour qu'un onglet
 * dont aucune offre ne relève affiche « 0 » plutôt que de disparaître. */
export type StatutCounts = Record<StatutFilter, number>;
```

Dans le même fichier, remplacer dans `OffersListFilters` la ligne `statut?: ApplicationStatus[];` par `statut?: StatutFilter[];`.

- [ ] **Step 4 : implémenter le client**

Dans `dashboard/src/data/client.ts`, ajouter `StatutCounts` aux imports de types, puis à l'interface `DashboardClient`, après `getWorkModeCounts` :

```ts
  /** `GET /statut-counts` : les huit valeurs de statut de candidature
   * chiffrées, en un seul appel — jamais sept `pageSize=1`, dont le coût ne
   * dépend pas de `pageSize` sur ce schéma (CLAUDE.md). */
  getStatutCounts(): Promise<StatutCounts>;
```

et dans l'objet retourné par `createDashboardClient`, à côté de `getWorkModeCounts` :

```ts
    getStatutCounts() {
      return request<StatutCounts>('/statut-counts');
    },
```

- [ ] **Step 5 : implémenter le hook**

Dans `dashboard/src/screens/matin/hooks.ts`, ajouter `StatutCounts` et `StatutFilter` aux imports de types, puis :

```ts
/** Les huit valeurs de statut chiffrées, pour les onglets de « Toute la
 * veille ». UN appel, pas sept : le coût d'une lecture d'`offers_dashboard`
 * ne dépend pas de `pageSize`, donc sept `pageSize=1` seraient sept
 * balayages du corpus (migration `20260910060000`).
 *
 * **Ces comptes sont GLOBAUX**, jamais restreints par le panneau de filtres.
 * C'est délibéré : un compte d'onglet répond à « combien y en a-t-il », pas
 * à « combien en verrais-je avec mes filtres actuels ». Quand un filtre est
 * actif, c'est la ligne de compte de la liste qui le dit (`OfferList`), pas
 * l'onglet qui change de nombre sous les doigts. */
export function useStatutCounts(
  client: DashboardClient,
): [AsyncState<StatutCounts>, () => void] {
  const fn = useCallback(() => client.getStatutCounts(), [client]);
  return useAsync(fn);
}
```

et, dans `OffersListParams`, ajouter `statut?: StatutFilter[];` puis le propager dans `useOffersList` :

```ts
export function useOffersList(
  client: DashboardClient,
  params: OffersListParams,
): [AsyncState<PageResult<OfferDashboardRow>>, () => void] {
  const { sort, page, pageSize, statut, workMode, engagement, source, agenticAi } = params;
  const fn = useCallback(
    () =>
      client.listOffers({ sort, page, pageSize, statut, workMode, engagement, source, agenticAi }),
    [client, sort, page, pageSize, statut, workMode, engagement, source, agenticAi],
  );
  return useAsync(fn);
}
```

> **Piège à ne pas reproduire** : `statut` est un tableau. Le passer construit à chaque rendu changerait d'identité à chaque `setState` et relancerait l'appel réseau en boucle — c'est exactement le défaut corrigé par la mémoïsation du client dans `App.tsx` (CLAUDE.md). La tâche 9 le mémoïse avec `useMemo` chez l'appelant.

- [ ] **Step 6 : lancer, vérifier que ça passe**

```bash
npm --prefix dashboard run test -- --run src/data/client.test.ts
```

Attendu : PASS.

- [ ] **Step 7 : porte unique, puis commit**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
```

```bash
git add dashboard/src/data/types.ts dashboard/src/data/client.ts dashboard/src/data/client.test.ts dashboard/src/screens/matin/hooks.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): client et hook pour les comptes par statut

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5 : `StatusTabs` — la barre d'onglets

**Files:**
- Create: `dashboard/src/screens/matin/StatusTabs.tsx`, `dashboard/src/screens/matin/StatusTabs.module.css`
- Modify: `dashboard/src/ui/kit/StatusBadge.tsx`, `dashboard/src/i18n/fr.ts`
- Test: `dashboard/src/screens/matin/StatusTabs.test.tsx`

**Interfaces:**
- Consumes: `StatutCounts`, `StatutFilter` (tâche 4), `SuiviStatus` et `BadgeTon` (kit).
- Produces:
  - `export type OngletId = SuiviStatus | 'toutes'`
  - `export const ONGLET_PAR_DEFAUT: OngletId = 'a_traiter'`
  - `export function filtreStatutPourOnglet(id: OngletId): StatutFilter[] | undefined`
  - `export function comptePourOnglet(id: OngletId, comptes: StatutCounts): number`
  - `export function StatusTabs(props: { actif: OngletId; onChange: (id: OngletId) => void; comptes: StatutCounts | null })`

- [ ] **Step 1 : exporter le ton des statuts depuis le kit**

Dans `dashboard/src/ui/kit/StatusBadge.tsx`, rendre la constante existante publique — **on étend le kit, on ne le double pas** (GUIDELINES §1) :

```ts
/** Le ton de chaque statut, PARTAGÉ : `StatusBadge` le rend en pastille, la
 * barre d'onglets de « Toute la veille » en point. Deux tables de couleurs
 * pour le même vocabulaire seraient un dialecte, et elles divergeraient au
 * premier changement. */
export const TON_STATUT: Record<SuiviStatus, BadgeTon> = {
  a_traiter: 'neutre',
  retenue: 'accent',
  postulee: 'info',
  relancee: 'alerte',
  entretien: 'succes',
  terminee: 'neutre',
  ecartee: 'danger',
};
```

et remplacer les usages internes de `TON` par `TON_STATUT` (supprimer l'ancienne constante privée `TON`).

- [ ] **Step 2 : ajouter les libellés**

Dans `dashboard/src/i18n/fr.ts`, groupe `matin`, après `colPubliee` :

```ts
    ongletsLabel: 'Statut de candidature',
    ongletATraiter: 'À traiter',
    ongletToutes: 'Toutes',
    compteEnAttenteCourt: '—',
```

Les six autres onglets réutilisent `statuts.*`, déjà présent — aucun libellé dupliqué.

- [ ] **Step 3 : écrire le test qui échoue**

Créer `dashboard/src/screens/matin/StatusTabs.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { comptePourOnglet, filtreStatutPourOnglet, StatusTabs } from './StatusTabs';
import type { StatutCounts } from '../../data/types';

const COMPTES: StatutCounts = {
  aucune: 1258,
  a_traiter: 3,
  retenue: 0,
  postulee: 6,
  relancee: 1,
  entretien: 0,
  terminee: 0,
  ecartee: 7,
};

describe('filtreStatutPourOnglet', () => {
  it("« À traiter » porte DEUX valeurs : sans décision, et ouverte sans décision", () => {
    expect(filtreStatutPourOnglet('a_traiter')).toEqual(['aucune', 'a_traiter']);
  });

  it('« Toutes » ne restreint rien', () => {
    expect(filtreStatutPourOnglet('toutes')).toBeUndefined();
  });

  it('un onglet de statut porte sa seule valeur', () => {
    expect(filtreStatutPourOnglet('postulee')).toEqual(['postulee']);
  });
});

describe('comptePourOnglet', () => {
  it("« À traiter » additionne les deux valeurs qu'il porte", () => {
    expect(comptePourOnglet('a_traiter', COMPTES)).toBe(1261);
  });

  it('« Toutes » additionne les huit', () => {
    expect(comptePourOnglet('toutes', COMPTES)).toBe(1275);
  });
});

describe('StatusTabs', () => {
  it('rend les huit onglets, y compris ceux à zéro', () => {
    render(<StatusTabs actif="a_traiter" onChange={vi.fn()} comptes={COMPTES} />);
    expect(screen.getAllByRole('tab')).toHaveLength(8);
    expect(screen.getByRole('tab', { name: /Retenue/ })).toHaveTextContent('0');
  });

  it("marque l'onglet actif par aria-selected, pas seulement par la couleur", () => {
    render(<StatusTabs actif="postulee" onChange={vi.fn()} comptes={COMPTES} />);
    expect(screen.getByRole('tab', { name: /Postulée/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /Toutes/ })).toHaveAttribute('aria-selected', 'false');
  });

  it("n'affiche AUCUN zéro tant que les comptes ne sont pas arrivés", () => {
    render(<StatusTabs actif="a_traiter" onChange={vi.fn()} comptes={null} />);
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.getAllByRole('tab')).toHaveLength(8);
  });

  it("remonte l'onglet cliqué", async () => {
    const onChange = vi.fn();
    render(<StatusTabs actif="a_traiter" onChange={onChange} comptes={COMPTES} />);
    await userEvent.click(screen.getByRole('tab', { name: /Écartée/ }));
    expect(onChange).toHaveBeenCalledWith('ecartee');
  });
});
```

- [ ] **Step 4 : lancer, vérifier l'échec**

```bash
npm --prefix dashboard run test -- --run src/screens/matin/StatusTabs.test.tsx
```

Attendu : ÉCHEC — `Failed to resolve import "./StatusTabs"`.

- [ ] **Step 5 : implémenter le composant**

Créer `dashboard/src/screens/matin/StatusTabs.tsx` :

```tsx
import { APPLICATION_STATUSES, STATUT_UNDECIDED } from '../../data/types';
import type { StatutCounts, StatutFilter } from '../../data/types';
import { TON_STATUT } from '../../ui/kit/StatusBadge';
import type { SuiviStatus } from '../../ui/kit/StatusBadge';
import { t } from '../../i18n/i18n';
import styles from './StatusTabs.module.css';

/** Les sept étapes du suivi, plus « Toutes ». Pas de huitième étape
 * inventée : `ecartee` est une sortie, `toutes` n'est pas un statut mais
 * l'absence de restriction (GUIDELINES §1). */
export type OngletId = SuiviStatus | 'toutes';

export const ONGLET_PAR_DEFAUT: OngletId = 'a_traiter';

const ORDRE: readonly OngletId[] = [
  'a_traiter',
  'retenue',
  'postulee',
  'relancee',
  'entretien',
  'terminee',
  'ecartee',
  'toutes',
];

/**
 * Le filtre `statut` que porte un onglet — `undefined` ne restreint rien.
 *
 * « À traiter » porte **deux** valeurs, et c'est le point à ne pas rater :
 * une offre jamais ouverte n'a aucune ligne `offer_applications` (donc
 * `candidature_statut` nul, `STATUT_UNDECIDED`), tandis qu'une offre dont le
 * détail a été ouvert sans décision porte `a_traiter` (posé par `openOffer`).
 * Les deux sont à traiter. Le serveur les compose en OU (`listOffers`).
 */
export function filtreStatutPourOnglet(id: OngletId): StatutFilter[] | undefined {
  if (id === 'toutes') return undefined;
  if (id === 'a_traiter') return [STATUT_UNDECIDED, 'a_traiter'];
  return [id];
}

/** Le compte affiché sur un onglet, dérivé des huit nombres de
 * `GET /statut-counts`. « À traiter » additionne les deux valeurs qu'il
 * porte ; « Toutes » additionne les huit. */
export function comptePourOnglet(id: OngletId, comptes: StatutCounts): number {
  if (id === 'toutes') {
    return [...APPLICATION_STATUSES, STATUT_UNDECIDED].reduce(
      (somme, clef) => somme + comptes[clef],
      0,
    );
  }
  if (id === 'a_traiter') return comptes[STATUT_UNDECIDED] + comptes.a_traiter;
  return comptes[id];
}

function libelle(id: OngletId): string {
  if (id === 'toutes') return t('matin.ongletToutes');
  if (id === 'a_traiter') return t('matin.ongletATraiter');
  return t(`statuts.${id}`);
}

interface Props {
  actif: OngletId;
  onChange: (id: OngletId) => void;
  /** `null` tant que `GET /statut-counts` n'a pas répondu : chaque onglet
   * affiche alors un tiret cadratin plutôt qu'un zéro, qui serait une
   * AFFIRMATION fausse (GUIDELINES §3.3, même règle que le badge
   * « compte en attente » de la liste). */
  comptes: StatutCounts | null;
}

/**
 * La barre d'onglets de « Toute la veille » (`Main.dc.html`).
 *
 * Le point coloré **double** le mot, il ne le remplace jamais (GUIDELINES
 * §3.7), et il reprend `TON_STATUT` du kit plutôt qu'une seconde table de
 * couleurs. « Écartée » porte un anneau discontinu au lieu d'un point plein :
 * c'est la même distinction que `StatusBadge` — une sortie, pas une étape.
 *
 * L'onglet actif ne se signale pas que par la couleur : `aria-selected`, un
 * fond, et un trait de 2 px sous l'onglet.
 */
export function StatusTabs({ actif, onChange, comptes }: Props) {
  return (
    <div className={styles.onglets} role="tablist" aria-label={t('matin.ongletsLabel')}>
      {ORDRE.map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={id === actif}
          className={styles.onglet}
          data-actif={id === actif ? 'oui' : undefined}
          data-ton={id === 'toutes' ? undefined : TON_STATUT[id]}
          onClick={() => onChange(id)}
        >
          {id === 'toutes' ? null : (
            <span
              className={id === 'ecartee' ? styles.anneau : styles.point}
              aria-hidden="true"
            />
          )}
          <span>{libelle(id)}</span>
          <span className={styles.compte}>
            {comptes === null ? t('matin.compteEnAttenteCourt') : comptePourOnglet(id, comptes)}
          </span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 6 : implémenter les styles**

Créer `dashboard/src/screens/matin/StatusTabs.module.css` — valeurs reprises de `Main.dc.html` :

```css
.onglets {
  display: flex;
  align-items: stretch;
  gap: 2px;
  height: 34px;
  border-bottom: 1px solid var(--color-border);
  flex: none;
}

.onglet {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  margin-bottom: -1px;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-muted);
  background: none;
  white-space: nowrap;
}

.onglet:hover {
  color: var(--color-text);
}

.onglet[data-actif='oui'] {
  color: var(--color-text);
  font-weight: 600;
  background: var(--color-surface-2);
  border-bottom-color: var(--color-accent);
}

.compte {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-xs);
  color: var(--color-text-faint);
}

.onglet[data-actif='oui'] .compte {
  color: var(--color-text);
}

/* Le point DOUBLE le mot, il ne le remplace pas (GUIDELINES §3.7). */
.point,
.anneau {
  width: 5px;
  height: 5px;
  border-radius: var(--radius-pill);
  flex: none;
}

.point {
  background: currentColor;
}

/* « Écartée » : un anneau discontinu, pas un point. La FORME dit « sortie »
   avant même la couleur — même distinction que `StatusBadge`. */
.anneau {
  border: 1px dashed currentColor;
}

.onglet[data-ton='neutre'] .point {
  background: var(--color-text-muted);
}
.onglet[data-ton='accent'] .point {
  background: var(--color-accent);
}
.onglet[data-ton='info'] .point {
  background: var(--color-info);
}
.onglet[data-ton='alerte'] .point {
  background: var(--color-warning);
}
.onglet[data-ton='succes'] .point {
  background: var(--color-success);
}
.onglet[data-ton='danger'] .anneau {
  border-color: var(--color-danger);
  color: var(--color-danger);
}
```

- [ ] **Step 7 : lancer, vérifier que ça passe**

```bash
npm --prefix dashboard run test -- --run src/screens/matin/StatusTabs.test.tsx
```

Attendu : PASS, 8 tests.

- [ ] **Step 8 : porte unique, puis commit**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
```

```bash
git add dashboard/src/screens/matin/StatusTabs.tsx dashboard/src/screens/matin/StatusTabs.module.css dashboard/src/screens/matin/StatusTabs.test.tsx dashboard/src/ui/kit/StatusBadge.tsx dashboard/src/i18n/fr.ts
git commit -m "$(cat <<'EOF'
feat(veille): la barre d'onglets par statut de candidature

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6 : `Pagination` — la numérotation

**Files:**
- Modify: `dashboard/src/screens/matin/Pagination.tsx`, `dashboard/src/screens/matin/Pagination.module.css`, `dashboard/src/i18n/fr.ts`
- Test: `dashboard/src/screens/matin/Pagination.test.tsx` (créer si absent)

**Interfaces:**
- Consumes: rien.
- Produces: `Pagination` accepte en plus `numerotation?: { page: number; pageCount: number; onPageChange: (page: number) => void }`. Absente, le rendu est celui d'aujourd'hui (la bande « Ce matin »).
- Produces aussi : `export function numerosDePage(page: number, pageCount: number): (number | 'ellipse')[]`.

**Pourquoi une seule pièce et pas deux :** `Main.dc.html` dessine deux paginations — « 1–3 sur 6 · Suivantes » pour la bande, et la numérotée pour la liste. Un second composant serait un dialecte (GUIDELINES §1). Une prop optionnelle donne les deux formes.

- [ ] **Step 1 : ajouter les libellés**

Dans `dashboard/src/i18n/fr.ts`, groupe `matin` :

```ts
    pageNumero: (n: number) => `Page ${n}`,
    ellipsePages: '…',
    parPage: (n: number) => `${n} par page — ce que la fenêtre tient`,
```

- [ ] **Step 2 : écrire le test qui échoue**

Créer `dashboard/src/screens/matin/Pagination.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { numerosDePage, Pagination } from './Pagination';

describe('numerosDePage', () => {
  it('rend toutes les pages quand il y en a peu', () => {
    expect(numerosDePage(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('replie le milieu par une ellipse quand il y en a beaucoup', () => {
    expect(numerosDePage(1, 158)).toEqual([1, 2, 3, 4, 'ellipse', 158]);
  });

  it('garde la page courante entourée de ses voisines', () => {
    expect(numerosDePage(63, 158)).toEqual([1, 'ellipse', 62, 63, 64, 'ellipse', 158]);
  });

  it('ne rend rien quand il n’y a qu’une page', () => {
    expect(numerosDePage(1, 1)).toEqual([]);
  });
});

describe('Pagination', () => {
  const base = {
    debut: 1,
    fin: 8,
    total: 1258,
    onSuivant: vi.fn(),
    onPrecedent: vi.fn(),
    suivantDisponible: true,
    precedentDisponible: false,
  };

  it('sans numérotation : aucun bouton de page (le rendu de la bande)', () => {
    render(<Pagination {...base} />);
    expect(screen.queryByRole('button', { name: 'Page 2' })).toBeNull();
  });

  it('avec numérotation : la page courante porte aria-current', () => {
    render(
      <Pagination
        {...base}
        numerotation={{ page: 1, pageCount: 158, onPageChange: vi.fn() }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('un clic sur un numéro remonte cette page', async () => {
    const onPageChange = vi.fn();
    render(<Pagination {...base} numerotation={{ page: 1, pageCount: 158, onPageChange }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('une seule page : aucun numéro affiché', () => {
    render(
      <Pagination
        {...base}
        fin={6}
        total={6}
        suivantDisponible={false}
        numerotation={{ page: 1, pageCount: 1, onPageChange: vi.fn() }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Page 1' })).toBeNull();
  });
});
```

- [ ] **Step 3 : lancer, vérifier l'échec**

```bash
npm --prefix dashboard run test -- --run src/screens/matin/Pagination.test.tsx
```

Attendu : ÉCHEC — `numerosDePage` n'est pas exporté.

- [ ] **Step 4 : implémenter**

Dans `dashboard/src/screens/matin/Pagination.tsx`, ajouter avant le composant :

```ts
export interface PaginationNumerotee {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}

/**
 * Les numéros à afficher : la première, la dernière, la courante et ses deux
 * voisines, le reste replié en ellipses. Rend `[]` quand il n'y a qu'une
 * page — 158 boutons ne se dessinent pas, et 1 seul ne sert à rien.
 */
export function numerosDePage(page: number, pageCount: number): (number | 'ellipse')[] {
  if (pageCount <= 1) return [];
  const retenues = new Set<number>([1, pageCount]);
  for (let n = page - 1; n <= page + 1; n += 1) {
    if (n >= 1 && n <= pageCount) retenues.add(n);
  }
  // Quatre numéros de tête quand la courante est au début, quatre de queue
  // quand elle est à la fin : sans ça, « 1 … 158 » sur la première page ne
  // laisse aucun moyen d'avancer d'un cran au clavier.
  if (page <= 3) for (let n = 2; n <= Math.min(4, pageCount); n += 1) retenues.add(n);
  if (page >= pageCount - 2) {
    for (let n = Math.max(1, pageCount - 3); n < pageCount; n += 1) retenues.add(n);
  }

  const triees = [...retenues].sort((a, b) => a - b);
  const sortie: (number | 'ellipse')[] = [];
  let precedent = 0;
  for (const n of triees) {
    if (precedent !== 0 && n - precedent > 1) sortie.push('ellipse');
    sortie.push(n);
    precedent = n;
  }
  return sortie;
}
```

Ajouter `numerotation?: PaginationNumerotee;` à `Props`, et insérer le bloc de numéros **entre** le bouton « Précédentes » et le bouton « Suivantes » :

```tsx
      {numerotation === undefined
        ? null
        : numerosDePage(numerotation.page, numerotation.pageCount).map((entree, index) =>
            entree === 'ellipse' ? (
              <span key={`ellipse-${index}`} className={styles.ellipse} aria-hidden="true">
                {t('matin.ellipsePages')}
              </span>
            ) : (
              <button
                key={entree}
                type="button"
                className={styles.numero}
                data-actif={entree === numerotation.page ? 'oui' : undefined}
                aria-current={entree === numerotation.page ? 'page' : undefined}
                aria-label={t('matin.pageNumero', entree)}
                onClick={() => numerotation.onPageChange(entree)}
              >
                {entree}
              </button>
            ),
          )}
```

- [ ] **Step 5 : implémenter les styles**

Ajouter à `dashboard/src/screens/matin/Pagination.module.css` — valeurs reprises de `Main.dc.html` :

```css
.numero,
.ellipse {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 27px;
  height: 27px;
  padding: 0 7px;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  background: none;
}

.numero:hover {
  color: var(--color-text);
  background: var(--color-surface-2);
}

.numero[data-actif='oui'] {
  color: var(--color-text);
  background: var(--color-surface-2);
  border-color: var(--color-border-strong);
  font-weight: 700;
}

.ellipse {
  color: var(--color-text-faint);
}
```

- [ ] **Step 6 : lancer, vérifier que ça passe**

```bash
npm --prefix dashboard run test -- --run src/screens/matin/Pagination.test.tsx
```

Attendu : PASS, 8 tests.

- [ ] **Step 7 : porte unique, puis commit**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
```

```bash
git add dashboard/src/screens/matin/Pagination.tsx dashboard/src/screens/matin/Pagination.module.css dashboard/src/screens/matin/Pagination.test.tsx dashboard/src/i18n/fr.ts
git commit -m "$(cat <<'EOF'
feat(veille): pagination numerotee, en option sur le composant existant

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7 : `usePageSizeAjustee` — la page vaut ce qui tient

**Files:**
- Create: `dashboard/src/screens/matin/usePageSizeAjustee.ts`
- Test: `dashboard/src/screens/matin/usePageSizeAjustee.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `HAUTEUR_LIGNE = 46`, `PAGE_SIZE_MIN = 5`, `PAGE_SIZE_DEFAUT = 8`, `usePageSizeAjustee(ref: RefObject<HTMLElement | null>): number`.

**Le piège à connaître :** `jsdom` ne calcule aucune mise en page — `clientHeight` y vaut **0**. Un hook qui diviserait naïvement rendrait `PAGE_SIZE_MIN` dans tous les tests, et pire, dans un navigateur pendant la frame de montage. La règle est donc : **une hauteur nulle ne change rien** ; on garde la valeur courante.

- [ ] **Step 1 : écrire le test qui échoue**

Créer `dashboard/src/screens/matin/usePageSizeAjustee.test.ts` :

```ts
import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HAUTEUR_LIGNE, PAGE_SIZE_DEFAUT, usePageSizeAjustee } from './usePageSizeAjustee';

/** `jsdom` n'implémente pas `ResizeObserver` : on le remplace par un double
 * dont on déclenche la notification à la main. */
let declencher: (() => void) | null = null;

beforeEach(() => {
  declencher = null;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        declencher = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});

function refDeHauteur(hauteur: number) {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientHeight', { value: hauteur, configurable: true });
  return { current: element };
}

describe('usePageSizeAjustee', () => {
  it('rend la valeur par défaut tant que rien n’est mesurable', () => {
    const { result } = renderHook(() => usePageSizeAjustee({ current: null }));
    expect(result.current).toBe(PAGE_SIZE_DEFAUT);
  });

  it('une hauteur nulle ne change rien (jsdom, et la frame de montage)', () => {
    const { result } = renderHook(() => usePageSizeAjustee(refDeHauteur(0)));
    act(() => declencher?.());
    expect(result.current).toBe(PAGE_SIZE_DEFAUT);
  });

  it('déduit le nombre de lignes qui tiennent', () => {
    const { result } = renderHook(() => usePageSizeAjustee(refDeHauteur(HAUTEUR_LIGNE * 15 + 20)));
    act(() => declencher?.());
    expect(result.current).toBe(15);
  });

  it('ne descend jamais sous le plancher', () => {
    const { result } = renderHook(() => usePageSizeAjustee(refDeHauteur(HAUTEUR_LIGNE)));
    act(() => declencher?.());
    expect(result.current).toBe(5);
  });
});
```

- [ ] **Step 2 : lancer, vérifier l'échec**

```bash
npm --prefix dashboard run test -- --run src/screens/matin/usePageSizeAjustee.test.ts
```

Attendu : ÉCHEC — module introuvable.

- [ ] **Step 3 : implémenter**

Créer `dashboard/src/screens/matin/usePageSizeAjustee.ts` :

```ts
import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/** La hauteur d'une ligne de « Toute la veille », telle que `Main.dc.html`
 * la dessine et qu'`OfferRow.module.css` la pose. Les deux doivent bouger
 * ensemble : une ligne plus haute que cette constante ferait déborder la
 * dernière ligne de chaque page. */
export const HAUTEUR_LIGNE = 46;

/** Sous ce plancher, la liste ne montre plus assez pour valoir une page.
 * Une fenêtre plus courte fait défiler la zone de liste — le compromis est
 * assumé, plutôt que d'afficher deux lignes. */
export const PAGE_SIZE_MIN = 5;

/** Ce qu'on demande AVANT toute mesure, et ce qu'on garde si rien n'est
 * mesurable. Correspond à la maquette bande « Ce matin » dépliée. */
export const PAGE_SIZE_DEFAUT = 8;

/**
 * La taille de page **mesurée** sur la hauteur réellement disponible, plutôt
 * que fixée : c'est ce qui fait tenir la liste dans la fenêtre au lieu de
 * déplacer le défilement à l'intérieur d'une zone.
 *
 * Amorti sans minuterie : le résultat est un **entier de lignes**, donc
 * redimensionner de quelques pixels ne change rien et ne relance aucun appel
 * réseau. Seul un franchissement de palier en déclenche un.
 *
 * **Une hauteur nulle ne change rien.** `jsdom` ne calcule aucune mise en
 * page (`clientHeight` y vaut 0), et un navigateur rend 0 pendant la frame
 * de montage : diviser naïvement demanderait 5 lignes à chaque démarrage,
 * puis les redemanderait — un appel réseau de plus, pour rien.
 */
export function usePageSizeAjustee(ref: RefObject<HTMLElement | null>): number {
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAUT);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;

    function mesurer() {
      const hauteur = element === null ? 0 : element.clientHeight;
      if (hauteur <= 0) return;
      setPageSize(Math.max(PAGE_SIZE_MIN, Math.floor(hauteur / HAUTEUR_LIGNE)));
    }

    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(element);
    return () => observateur.disconnect();
  }, [ref]);

  return pageSize;
}
```

- [ ] **Step 4 : lancer, vérifier que ça passe**

```bash
npm --prefix dashboard run test -- --run src/screens/matin/usePageSizeAjustee.test.ts
```

Attendu : PASS, 4 tests.

- [ ] **Step 5 : porte unique, puis commit**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
```

```bash
git add dashboard/src/screens/matin/usePageSizeAjustee.ts dashboard/src/screens/matin/usePageSizeAjustee.test.ts
git commit -m "$(cat <<'EOF'
feat(veille): la taille de page vaut ce que la fenetre tient

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8 : Le repli de « Ce matin », mémorisé

**Files:**
- Modify: `dashboard/src/screens/matin/MorningBand.tsx`, `dashboard/src/screens/matin/MorningBand.module.css`, `dashboard/src/i18n/fr.ts`
- Create: `dashboard/src/screens/matin/repliStorage.ts`
- Test: `dashboard/src/screens/matin/MorningBand.test.tsx`, `dashboard/src/screens/matin/repliStorage.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `MorningBandProps` gagne `replie: boolean` et `onToggleRepli: () => void` ; `lireRepli(): boolean` et `ecrireRepli(valeur: boolean): void`.

**Pourquoi `localStorage` ici, alors que la tâche 7 de la phase 3 l'avait retiré :** ce qui avait été retiré (`decidedStorage.ts`) mémorisait un **fait sur les données** — combien d'offres avaient été décidées — qui appartenait au serveur et devait être partagé entre navigateurs. Le repli d'une bande est une **préférence d'affichage de CE poste**, qui n'a pas de vérité serveur et n'en veut pas. La distinction est la règle, pas l'exception.

- [ ] **Step 1 : écrire le test de stockage qui échoue**

Créer `dashboard/src/screens/matin/repliStorage.test.ts` :

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ecrireRepli, lireRepli } from './repliStorage';

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('repliStorage', () => {
  it('déplié par défaut : la bande est ce que la maquette montre en premier', () => {
    expect(lireRepli()).toBe(false);
  });

  it('relit ce qui a été écrit', () => {
    ecrireRepli(true);
    expect(lireRepli()).toBe(true);
  });

  it('un stockage indisponible ne fait pas planter l’écran', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('bloqué');
      },
      setItem() {
        throw new Error('bloqué');
      },
    });
    expect(lireRepli()).toBe(false);
    expect(() => ecrireRepli(true)).not.toThrow();
  });
});
```

- [ ] **Step 2 : lancer, vérifier l'échec**

```bash
npm --prefix dashboard run test -- --run src/screens/matin/repliStorage.test.ts
```

Attendu : ÉCHEC — module introuvable.

- [ ] **Step 3 : implémenter le stockage**

Créer `dashboard/src/screens/matin/repliStorage.ts` :

```ts
/**
 * Le repli de la bande « Ce matin », mémorisé sur CE poste.
 *
 * Ce n'est pas un retour en arrière sur `decidedStorage.ts`, retiré en tâche
 * 10 : celui-là mémorisait un FAIT SUR LES DONNÉES (le nombre d'offres
 * décidées), qui appartenait au serveur et devait valoir pour tous les
 * navigateurs. Ici il s'agit d'une PRÉFÉRENCE D'AFFICHAGE, qui n'a pas de
 * vérité serveur et n'en veut pas.
 *
 * Toute lecture et toute écriture sont gardées : un navigateur en navigation
 * privée, ou réglé pour bloquer le stockage, lève à l'accès. L'écran doit
 * s'afficher quand même — déplié, comme au premier jour.
 */
const CLEF = 'fast-travail.ce-matin.replie';

export function lireRepli(): boolean {
  try {
    return localStorage.getItem(CLEF) === 'true';
  } catch {
    return false;
  }
}

export function ecrireRepli(valeur: boolean): void {
  try {
    localStorage.setItem(CLEF, String(valeur));
  } catch {
    // Rien à faire : la préférence ne survivra pas au rechargement, et c'est
    // tout ce qu'on perd.
  }
}
```

- [ ] **Step 4 : ajouter les libellés**

Dans `dashboard/src/i18n/fr.ts`, groupe `matin` :

```ts
    replier: 'Replier',
    deplier: (n: number) => `Déplier les ${n} carte${n === 1 ? '' : 's'}`,
```

- [ ] **Step 5 : écrire le test de la bande qui échoue**

Ajouter à `dashboard/src/screens/matin/MorningBand.test.tsx` :

```tsx
it('repliée : garde ses chiffres, mais ne rend plus aucune carte', () => {
  render(<MorningBand {...props({ replie: true })} />);
  expect(screen.queryByRole('button', { name: 'Garder' })).toBeNull();
  expect(screen.getByRole('button', { name: /Déplier/ })).toBeInTheDocument();
});

it('dépliée : le bouton propose de replier', () => {
  render(<MorningBand {...props({ replie: false })} />);
  expect(screen.getByRole('button', { name: 'Replier' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

it('le bouton remonte le basculement', async () => {
  const onToggleRepli = vi.fn();
  render(<MorningBand {...props({ replie: false, onToggleRepli })} />);
  await userEvent.click(screen.getByRole('button', { name: 'Replier' }));
  expect(onToggleRepli).toHaveBeenCalledTimes(1);
});
```

Ajouter `replie: false` et `onToggleRepli: vi.fn()` aux valeurs par défaut du helper `props()` de ce fichier.

- [ ] **Step 6 : lancer, vérifier l'échec**

```bash
npm --prefix dashboard run test -- --run src/screens/matin/MorningBand.test.tsx
```

Attendu : ÉCHEC — aucun bouton « Replier ».

- [ ] **Step 7 : implémenter la bande**

Dans `MorningBandProps`, ajouter :

```ts
  /** Repliée, la bande garde ses chiffres sur une ligne et rend sa hauteur à
   * la liste (`VeilleRepliee.dc.html`) : 15 lignes au lieu de 8. Rien ne
   * disparaît — c'est le sens du repli, pas un masquage. */
  replie: boolean;
  onToggleRepli: () => void;
```

Dans le JSX, ajouter le bouton à la fin du bloc `styles.indicateurs` (après `StreakIndicator`) :

```tsx
        <span className={styles.separateur} aria-hidden="true" />
        <button
          type="button"
          className={styles.repli}
          aria-expanded={!replie}
          onClick={onToggleRepli}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={replie ? 'm6 9 6 6 6-6' : 'm18 15-6-6-6 6'} />
          </svg>
          {replie ? t('matin.deplier', total) : t('matin.replier')}
        </button>
```

puis envelopper **tout ce qui suit `</div>` de `styles.entete`** — c'est-à-dire les trois branches d'état (`erreur` → `EmptyState` + bouton `reessayer`, `chargement` → `EmptyState`, `total === 0` → `EmptyState`), la `<div className={styles.grille}>` et le `<Pagination …>` — dans une seule condition. Aucune de ces lignes ne change à l'intérieur :

```tsx
      {replie ? null : (
        <>
          {/* Les branches d'état, la grille de cartes et la pagination,
              reprises telles quelles depuis la version précédente. */}
        </>
      )}
```

**Ce que ce repli ne doit PAS faire** : démonter les appels réseau. `MorningBand` ne fait aucun appel — c'est `MatinScreen` qui les porte (tâche 10) —, donc replier n'annule ni ne relance rien, et déplier n'attend aucun chargement. Si un test montre le contraire, c'est qu'un appel a migré au mauvais endroit.

- [ ] **Step 8 : implémenter les styles**

Ajouter à `dashboard/src/screens/matin/MorningBand.module.css` :

```css
.repli {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-strong);
  font-size: var(--text-xs);
  color: var(--color-text);
  background: transparent;
}

.repli:hover {
  background: var(--color-surface-2);
}
```

- [ ] **Step 9 : lancer, vérifier que ça passe**

```bash
npm --prefix dashboard run test -- --run src/screens/matin/MorningBand.test.tsx src/screens/matin/repliStorage.test.ts
```

Attendu : PASS.

- [ ] **Step 10 : porte unique, puis commit**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
```

```bash
git add dashboard/src/screens/matin/MorningBand.tsx dashboard/src/screens/matin/MorningBand.module.css dashboard/src/screens/matin/MorningBand.test.tsx dashboard/src/screens/matin/repliStorage.ts dashboard/src/screens/matin/repliStorage.test.ts dashboard/src/i18n/fr.ts
git commit -m "$(cat <<'EOF'
feat(matin): la bande se replie, et le choix est memorise

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9 : Les colonnes contextuelles de la liste

**Files:**
- Modify: `dashboard/src/data/format.ts`, `dashboard/src/screens/matin/OfferRow.tsx`, `dashboard/src/screens/matin/OfferRow.module.css`, `dashboard/src/i18n/fr.ts`
- Test: `dashboard/src/data/format.test.ts`, `dashboard/src/screens/matin/OfferRow.test.tsx`

**Interfaces:**
- Consumes: `OfferDashboardRow` (existant).
- Produces:
  - `export type DateColonne = 'publiee' | 'envoyee' | 'relancee' | 'entretien'`
  - `export function formatDateCandidature(offer: OfferDashboardRow, colonne: DateColonne): Publication`
  - `OfferRow` gagne `afficherStatut: boolean` et `dateColonne: DateColonne`.

**La règle, et sa limite mesurée :** `offers_dashboard` porte `candidature_envoyee_le`, `candidature_relancee_le` et `candidature_entretien_le` — et **rien pour `retenue`, `terminee` ou `ecartee`**. Ces trois onglets gardent donc « Publiée » en dernière colonne. Inventer une date à partir de `status_changed_at`, que la vue n'expose pas, serait exactement l'affordance que GUIDELINES §3.3 interdit.

- [ ] **Step 1 : ajouter les libellés**

Dans `dashboard/src/i18n/fr.ts`, groupe `matin` :

```ts
    colStatut: 'Statut',
    colPostulee: 'Postulée',
    colRelancee: 'Relancée',
    colEntretien: 'Entretien',
    sansDecision: 'sans décision',
```

Et dans le groupe `absences` du même fichier :

```ts
    // Une NEUVIÈME absence, et elle ne recouvre aucune des huit : la date de
    // l'étape n'a été ni publiée par une source (elle ne vient pas d'une
    // annonce) ni « non précisée » par le modèle (il ne la produit pas). Elle
    // n'a simplement pas été enregistrée au moment où le statut a été posé.
    // Mesuré : la seule offre `relancee` du corpus a `last_followup_at` nul.
    'non-datee': 'non datée',
```

`Absence` (kit) porte un type fermé `AbsenceNature`. Ajouter `'non-datee'` à ce type dans `dashboard/src/ui/kit/Absence.tsx`, et son rendu — même traitement visuel que `non-precisee` (italique, `--color-text-faint`), la distinction étant dans le MOT, pas dans la forme.

**Et mettre à jour `docs/design/GUIDELINES.md` §3.1 dans le même commit.** Ce paragraphe est contraignant et écrit « **Huit absences ont été mesurées en base** » : le laisser dire huit alors que le kit en porte neuf ferait de la règle une description périmée, exactement le défaut que le §5.3 nomme. Ajouter une ligne au tableau, et la phrase qui dit pourquoi celle-là est d'une autre nature :

```markdown
| *non datée* | l'étape existe, sa date non — un statut posé sans elle | 1 |
```

> **La neuvième absence ne porte pas sur l'offre, mais sur la candidature.**
> Les huit premières qualifient ce qu'une annonce dit ou tait ; celle-ci
> qualifie ce que le SUIVI a enregistré. Elle ne recouvre donc aucune des
> huit : une date d'étape n'est ni publiée par une source, ni dégagée d'un
> texte par le modèle. Mesuré le 2026-09-09 : la seule offre au statut
> `relancee` du corpus a `last_followup_at` nul.

- [ ] **Step 2 : écrire les tests qui échouent**

Ajouter à `dashboard/src/data/format.test.ts` :

```ts
describe('formatDateCandidature', () => {
  const MAINTENANT = new Date('2026-09-09T12:00:00Z');

  it('rend la date d’envoi sur la colonne « envoyee »', () => {
    const offer = ligneOffre({ candidature_envoyee_le: '2026-09-09T08:00:00Z' });
    expect(formatDateCandidature(offer, 'envoyee', MAINTENANT)).toEqual({
      connu: true,
      texte: "aujourd'hui",
    });
  });

  it('une date absente reste une absence, jamais une date inventée', () => {
    const offer = ligneOffre({ candidature_relancee_le: null });
    expect(formatDateCandidature(offer, 'relancee', MAINTENANT)).toEqual({ connu: false });
  });

  it('la colonne « publiee » retombe sur published_at', () => {
    const offer = ligneOffre({ published_at: '2026-09-05T08:00:00Z' });
    expect(formatDateCandidature(offer, 'publiee', MAINTENANT)).toEqual({
      connu: true,
      texte: '4 j',
    });
  });
});
```

Ajouter à `dashboard/src/screens/matin/OfferRow.test.tsx` :

```tsx
it('afficherStatut : la 5e colonne rend la pastille de statut, pas le lieu', () => {
  render(
    <OfferRow
      offer={ligneOffre({ city: 'Marseille', candidature_statut: 'postulee' })}
      afficherStatut
      dateColonne="envoyee"
      salaireFloor={null}
    />,
  );
  expect(screen.getByText('Postulée')).toBeInTheDocument();
  expect(screen.queryByText('Marseille')).toBeNull();
});

it('afficherStatut sans décision : une absence NOMMÉE, jamais une case vide', () => {
  render(
    <OfferRow
      offer={ligneOffre({ candidature_statut: null })}
      afficherStatut
      dateColonne="publiee"
      salaireFloor={null}
    />,
  );
  expect(screen.getByText('sans décision')).toBeInTheDocument();
});

it('sans afficherStatut : le lieu reste en 5e colonne (comportement d’origine)', () => {
  render(
    <OfferRow
      offer={ligneOffre({ city: 'Marseille' })}
      afficherStatut={false}
      dateColonne="publiee"
      salaireFloor={null}
    />,
  );
  expect(screen.getByText('Marseille')).toBeInTheDocument();
});

it('une date d’étape absente se NOMME « non datée », jamais une case vide', () => {
  render(
    <OfferRow
      offer={ligneOffre({ candidature_statut: 'relancee', candidature_relancee_le: null })}
      afficherStatut
      dateColonne="relancee"
      salaireFloor={null}
    />,
  );
  expect(screen.getByText('non datée')).toBeInTheDocument();
});
```

- [ ] **Step 3 : lancer, vérifier l'échec**

```bash
npm --prefix dashboard run test -- --run src/data/format.test.ts src/screens/matin/OfferRow.test.tsx
```

Attendu : ÉCHEC — `formatDateCandidature` n'existe pas, et `afficherStatut` n'est pas une prop connue.

- [ ] **Step 4 : implémenter le format**

Dans `dashboard/src/data/format.ts`, après `formatPublication` :

```ts
/**
 * Ce que la dernière colonne de la liste montre, selon l'onglet actif.
 *
 * **Trois étapes seulement ont une date en base** : `offers_dashboard` porte
 * `candidature_envoyee_le`, `candidature_relancee_le` et
 * `candidature_entretien_le` — rien pour `retenue`, `terminee` ni `ecartee`.
 * Ces onglets-là gardent « Publiée » : inventer une date à partir d'un champ
 * que la vue n'expose pas serait une affordance qui annonce un fait
 * qu'aucun code ne rend vrai (GUIDELINES §3.3).
 */
export type DateColonne = 'publiee' | 'envoyee' | 'relancee' | 'entretien';

const CHAMP_DATE: Record<DateColonne, (row: OfferDashboardRow) => string | null> = {
  publiee: (row) => row.published_at,
  envoyee: (row) => row.candidature_envoyee_le,
  relancee: (row) => row.candidature_relancee_le,
  entretien: (row) => row.candidature_entretien_le,
};

export function formatDateCandidature(
  row: OfferDashboardRow,
  colonne: DateColonne,
  maintenant: Date = new Date(),
): Publication {
  return formatPublication(CHAMP_DATE[colonne](row), maintenant);
}
```

- [ ] **Step 5 : implémenter la ligne**

Dans `dashboard/src/screens/matin/OfferRow.tsx` :

- ajouter aux imports : `formatDateCandidature`, `type DateColonne` depuis `../../data/format`, et `StatusBadge` depuis `../../ui/kit/StatusBadge` ;
- ajouter à `Props` :

```ts
  /** La 5e colonne rend le STATUT au lieu du LIEU — vrai sur tout onglet
   * autre que « À traiter » (`VeilleRepliee.dc.html`). Sans elle, un onglet
   * mélangerait quatorze décisions à mille lignes sans le dire. */
  afficherStatut: boolean;
  /** Ce que la 6e colonne montre. Voir `DateColonne` : seules trois étapes
   * ont une date en base. */
  dateColonne: DateColonne;
```

- remplacer `const publication = formatPublication(offer.published_at);` par
  `const publication = formatDateCandidature(offer, dateColonne);` (et retirer `formatPublication` des imports s'il n'est plus utilisé) ;
- dans la 6e cellule, choisir la bonne absence selon la colonne — l'absence de
  `published_at` reste « non publiée » (c'est une métadonnée de source), celle
  d'une date d'étape est « non datée » :

```tsx
      <span className={styles.publiee}>
        {publication.connu ? (
          publication.texte
        ) : dateColonne === 'publiee' ? (
          // `published_at` est un champ de SOURCE (métadonnée de collecte),
          // jamais extrait par le modèle : son absence relève de « non
          // publiée par la source » (GUIDELINES §3.1).
          <Absence nature="non-publiee">{t('absences.non-publiee')}</Absence>
        ) : (
          // Une date d'étape n'a ni source ni modèle derrière elle : elle
          // n'a pas été enregistrée au moment où le statut a été posé.
          <Absence nature="non-datee">{t('absences.non-datee')}</Absence>
        )}
      </span>
```

- remplacer la 5e cellule (celle du lieu) par :

```tsx
      {afficherStatut ? (
        <span className={styles.trunc}>
          {offer.candidature_statut === null ? (
            <Absence nature="non-precisee">{t('matin.sansDecision')}</Absence>
          ) : (
            <StatusBadge
              status={offer.candidature_statut}
              taille="compacte"
              label={t(`statuts.${offer.candidature_statut}`)}
            />
          )}
        </span>
      ) : (
        <span className={styles.trunc}>
          {lieu.connu ? (
            lieu.texte
          ) : (
            <Absence nature="non-precisee">{t('absences.non-precisee')}</Absence>
          )}
        </span>
      )}
```

- [ ] **Step 6 : lancer, vérifier que ça passe**

```bash
npm --prefix dashboard run test -- --run src/data/format.test.ts src/screens/matin/OfferRow.test.tsx
```

Attendu : PASS.

- [ ] **Step 7 : porte unique, puis commit**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
```

```bash
git add dashboard/src/data/format.ts dashboard/src/data/format.test.ts dashboard/src/screens/matin/OfferRow.tsx dashboard/src/screens/matin/OfferRow.module.css dashboard/src/screens/matin/OfferRow.test.tsx dashboard/src/i18n/fr.ts
git commit -m "$(cat <<'EOF'
feat(veille): colonnes contextuelles — statut, et la date de l'etape

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10 : Le câblage — `OfferList` et `MatinScreen`

**Files:**
- Modify: `dashboard/src/screens/matin/OfferList.tsx`, `dashboard/src/screens/matin/OfferList.module.css`, `dashboard/src/screens/matin/MatinScreen.tsx`, `dashboard/src/screens/matin/MatinScreen.module.css`, `dashboard/src/i18n/fr.ts`
- Test: `dashboard/src/screens/matin/OfferList.test.tsx`, `dashboard/src/screens/matin/MatinScreen.test.tsx`

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: l'écran complet.

- [ ] **Step 1 : ajouter les libellés**

Dans `dashboard/src/i18n/fr.ts`, groupe `matin` :

```ts
    // « Rien de masqué » ne se dit QUE sur l'onglet « Toutes » : un onglet
    // qui filtre et une phrase qui affirme le contraire seraient un
    // mensonge (GUIDELINES §3.3).
    compteOnglet: (n: number, total: number) =>
      `${n} dans cet onglet, sur ${total} jugée${total === 1 ? '' : 's'}`,
    compteOngletFiltre: (n: number, total: number) =>
      `${n} sur ${total} dans cet onglet — filtres actifs`,
    listeOngletVideTitre: 'Aucune offre à cette étape',
    listeOngletVideDetail:
      "L'onglet reste visible à zéro : c'est une étape du parcours, pas une absence de données.",
```

- [ ] **Step 2 : écrire les tests qui échouent**

Ajouter à `dashboard/src/screens/matin/OfferList.test.tsx`. Compléter d'abord le helper `props()` de ce fichier avec les six nouvelles valeurs par défaut, et déclarer les comptes en tête de fichier :

```tsx
import { createRef } from 'react';
import type { StatutCounts } from '../../data/types';

const COMPTES: StatutCounts = {
  aucune: 1258,
  a_traiter: 0,
  retenue: 0,
  postulee: 6,
  relancee: 1,
  entretien: 0,
  terminee: 0,
  ecartee: 7,
};

// … dans props(), à ajouter aux valeurs par défaut :
//   onglet: 'a_traiter' as const,
//   onOngletChange: vi.fn(),
//   comptesStatut: null,
//   totalCorpus: 1272,
//   filtresActifs: false,
//   refZoneListe: createRef<HTMLDivElement>(),
```

Puis les tests :

```tsx
it('rend la barre d’onglets', () => {
  render(<OfferList {...props({ comptesStatut: COMPTES })} />);
  expect(screen.getAllByRole('tab')).toHaveLength(8);
});

it('« rien de masqué » ne se dit QUE sur l’onglet Toutes', () => {
  render(<OfferList {...props({ onglet: 'toutes', total: 1272, totalCorpus: 1272 })} />);
  expect(screen.getByText(/rien de masqué/)).toBeInTheDocument();
});

it('sur un onglet qui filtre, la phrase dit ce que l’onglet montre ET le total', () => {
  render(<OfferList {...props({ onglet: 'postulee', total: 6, totalCorpus: 1272 })} />);
  expect(screen.queryByText(/rien de masqué/)).toBeNull();
  expect(screen.getByText(/6 dans cet onglet, sur 1272 jugées/)).toBeInTheDocument();
});

it('un onglet vide se nomme, il ne se vide pas', () => {
  render(<OfferList {...props({ onglet: 'retenue', offers: [], total: 0 })} />);
  expect(screen.getByText('Aucune offre à cette étape')).toBeInTheDocument();
});

it('la colonne Lieu cède la place à Statut hors de l’onglet « À traiter »', () => {
  render(<OfferList {...props({ onglet: 'toutes' })} />);
  expect(screen.getByText('Statut')).toBeInTheDocument();
  expect(screen.queryByText('Lieu')).toBeNull();
});
```

Ajouter à `dashboard/src/screens/matin/MatinScreen.test.tsx` :

`MatinScreen.test.tsx` construit déjà un client factice — **réutiliser celui du fichier**, en l'enrichissant de deux choses : un `getStatutCounts` qui rend les huit clefs, et un enregistrement des filtres reçus par `listOffers`.

```tsx
it('changer d’onglet remet la liste en page 1 et envoie le bon statut', async () => {
  const appels: OffersListFilters[] = [];
  const client = {
    ...clientDeTest(), // le factice déjà présent dans ce fichier
    listOffers: (filtres: OffersListFilters = {}) => {
      appels.push(filtres);
      return Promise.resolve({ rows: [], total: 0, page: 1, pageSize: 8 });
    },
    getStatutCounts: () =>
      Promise.resolve({
        aucune: 1258,
        a_traiter: 0,
        retenue: 0,
        postulee: 6,
        relancee: 1,
        entretien: 0,
        terminee: 0,
        ecartee: 7,
      }),
  };

  render(<MatinScreen client={client} onOuvrirOffre={vi.fn()} />);
  await userEvent.click(await screen.findByRole('tab', { name: /Postulée/ }));

  const dernier = appels.at(-1);
  expect(dernier?.page).toBe(1);
  expect(dernier?.statut).toEqual(['postulee']);
});

it('l’onglet par défaut demande les deux valeurs « à traiter »', async () => {
  // Le piège que ce test ferme : `in` ne matche jamais `null`. Si l'onglet
  // par défaut n'envoyait que `a_traiter`, l'écran s'ouvrirait sur une liste
  // VIDE alors que 1 258 offres attendent — et rien ne le signalerait.
  const appels: OffersListFilters[] = [];
  const client = {
    ...clientDeTest(),
    listOffers: (filtres: OffersListFilters = {}) => {
      appels.push(filtres);
      return Promise.resolve({ rows: [], total: 0, page: 1, pageSize: 8 });
    },
  };
  render(<MatinScreen client={client} onOuvrirOffre={vi.fn()} />);
  await screen.findAllByRole('tab');
  expect(appels[0]?.statut).toEqual(['aucune', 'a_traiter']);
});
```

- [ ] **Step 3 : lancer, vérifier l'échec**

```bash
npm --prefix dashboard run test -- --run src/screens/matin/OfferList.test.tsx src/screens/matin/MatinScreen.test.tsx
```

Attendu : ÉCHEC — aucun `role="tab"` rendu.

- [ ] **Step 4 : implémenter `OfferList`**

Ajouter à `OfferListProps` :

```ts
  onglet: OngletId;
  onOngletChange: (onglet: OngletId) => void;
  /** `null` tant que `GET /statut-counts` n'a pas répondu. */
  comptesStatut: StatutCounts | null;
  /** Le total du CORPUS, tous onglets confondus — distinct de `total`, qui
   * est celui de l'onglet actif. Les deux ensemble permettent de dire ce que
   * l'onglet montre ET ce qu'il laisse aux autres, sans jamais prétendre
   * « rien de masqué » sur un onglet qui filtre. */
  totalCorpus: number;
  /** Vrai dès qu'une dimension du panneau de filtres est sélectionnée : la
   * ligne de compte le dit alors explicitement, parce que les comptes
   * d'onglets, eux, restent globaux. */
  filtresActifs: boolean;
  /** La zone de liste dont `usePageSizeAjustee` mesure la hauteur. */
  refZoneListe: RefObject<HTMLDivElement | null>;
```

Remplacer le `<span className={styles.compte}>` de l'en-tête par :

```tsx
        <span className={styles.compte}>
          {chargement
            ? t('matin.chargement')
            : filtresActifs
              ? t('matin.compteOngletFiltre', total, totalCorpus)
              : onglet === 'toutes'
                ? t('matin.offresJugeesRienMasque', total)
                : t('matin.compteOnglet', total, totalCorpus)}
        </span>
```

Insérer `<StatusTabs actif={onglet} onChange={onOngletChange} comptes={comptesStatut} />` **au-dessus** de `styles.entete`, dans `styles.section`.

Rendre les en-têtes de colonnes contextuels :

```tsx
                <span>{t('matin.colEmployeur')}</span>
                <span>{onglet === 'a_traiter' ? t('matin.colLieu') : t('matin.colStatut')}</span>
                <span className={styles.colDroite}>{libelleColonneDate(onglet)}</span>
```

avec, en haut du fichier :

```ts
/** La dernière colonne suit l'onglet — mais seulement là où la base porte
 * réellement la date (voir `DateColonne`, format.ts). */
function colonneDatePourOnglet(onglet: OngletId): DateColonne {
  if (onglet === 'postulee') return 'envoyee';
  if (onglet === 'relancee') return 'relancee';
  if (onglet === 'entretien') return 'entretien';
  return 'publiee';
}

function libelleColonneDate(onglet: OngletId): string {
  const colonne = colonneDatePourOnglet(onglet);
  if (colonne === 'envoyee') return t('matin.colPostulee');
  if (colonne === 'relancee') return t('matin.colRelancee');
  if (colonne === 'entretien') return t('matin.colEntretien');
  return t('matin.colPubliee');
}
```

Distinguer les deux vides — un onglet à zéro n'est pas un corpus vide :

```tsx
          ) : total === 0 ? (
            onglet === 'toutes' ? (
              <EmptyState titre={t('matin.listeVideTitre')} detail={t('matin.listeVideDetail')} />
            ) : (
              <EmptyState
                titre={t('matin.listeOngletVideTitre')}
                detail={t('matin.listeOngletVideDetail')}
              />
            )
          ) : (
```

Encadrer les lignes par la zone mesurée, et brancher la numérotation :

```tsx
              <div className={styles.zoneLignes} ref={refZoneListe}>
                <motion.div layout>
                  <AnimatePresence initial={false}>
                    {offers.map((offer) => (
                      <OfferRow
                        key={offer.id}
                        offer={offer}
                        onOuvrir={onOuvrirOffre}
                        salaireFloor={salaireFloor}
                        afficherStatut={onglet !== 'a_traiter'}
                        dateColonne={colonneDatePourOnglet(onglet)}
                      />
                    ))}
                  </AnimatePresence>
                </motion.div>
              </div>
              <Pagination
                debut={debut}
                fin={fin}
                total={total}
                onSuivant={() => onPageChange(page + 1)}
                onPrecedent={() => onPageChange(page - 1)}
                suivantDisponible={fin < total}
                precedentDisponible={page > 1}
                numerotation={{
                  page,
                  pageCount: Math.max(1, Math.ceil(total / pageSize)),
                  onPageChange,
                }}
              />
```

- [ ] **Step 5 : implémenter les styles de la liste**

Ajouter à `dashboard/src/screens/matin/OfferList.module.css` :

```css
/* La zone dont la hauteur détermine la taille de page (`usePageSizeAjustee`).
   `overflow: hidden` plutôt qu'`auto` : la page vaut ce qui TIENT, donc rien
   ne doit défiler ici — si quelque chose déborde, c'est la mesure qu'il faut
   corriger, pas une barre de défilement qu'il faut ajouter. */
.zoneLignes {
  flex-grow: 1;
  min-height: 0;
  overflow: hidden;
}

.liste {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
```

et changer `.entete { margin-bottom: 11px; }` en `margin: 10px 0;`.

- [ ] **Step 6 : implémenter `MatinScreen`**

Remplacer `const LIST_PAGE_SIZE = 50;` par le hook, et câbler :

```tsx
  const refZoneListe = useRef<HTMLDivElement>(null);
  const pageSize = usePageSizeAjustee(refZoneListe);

  const [onglet, setOnglet] = useState<OngletId>(ONGLET_PAR_DEFAUT);
  const [replie, setReplie] = useState(lireRepli);
  const [comptesStatutState] = useStatutCounts(client);

  // `useMemo` obligatoire : `statut` est un TABLEAU, et il est la dépendance
  // du `useCallback` d'`useOffersList`. Reconstruit à chaque rendu, il
  // relancerait l'appel réseau à chaque `setState` de cet écran — exactement
  // le défaut corrigé sur le client d'API dans `App.tsx` (CLAUDE.md).
  const statut = useMemo(() => filtreStatutPourOnglet(onglet), [onglet]);

  const [listState, recargerListe] = useOffersList(client, {
    sort,
    page: listPage,
    pageSize,
    statut,
    ...filtres,
  });

  function changerOnglet(suivant: OngletId) {
    setOnglet(suivant);
    setListPage(1);
  }

  function basculerRepli() {
    setReplie((precedent) => {
      const suivant = !precedent;
      ecrireRepli(suivant);
      return suivant;
    });
  }

  const filtresActifs =
    filtres.workMode !== undefined ||
    filtres.engagement !== undefined ||
    filtres.source !== undefined ||
    filtres.agenticAi !== undefined;

  const comptesStatut =
    comptesStatutState.statut === 'succes' ? comptesStatutState.donnees : null;
  const totalCorpus = comptesStatut === null ? 0 : comptePourOnglet('toutes', comptesStatut);
```

Passer `replie={replie}` et `onToggleRepli={basculerRepli}` à `MorningBand`, et `onglet`, `onOngletChange={changerOnglet}`, `comptesStatut`, `totalCorpus`, `filtresActifs`, `refZoneListe`, `pageSize` à `OfferList`.

- [ ] **Step 7 : implémenter le shell 100 vh**

Dans `dashboard/src/screens/matin/MatinScreen.module.css`, `.ecran` porte déjà `height: 100%` et `min-height: 0` — vérifier que le parent (`App`) donne bien 100 vh ; sinon poser `height: 100dvh` sur `.ecran`. **`dvh` et non `vh`** : sur mobile, `vh` compte la barre d'adresse rétractée et fait dépasser la page.

- [ ] **Step 8 : lancer toute la suite du dashboard**

```bash
npm --prefix dashboard run test -- --run
```

Attendu : PASS.

- [ ] **Step 9 : porte unique, puis commit**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
```

```bash
git add dashboard/src
git commit -m "$(cat <<'EOF'
feat(veille): onglets par statut et page bornee a la fenetre

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11 : La relecture §5.4, la mesure, et la documentation

**Files:**
- Modify: `docs/ETAT.md`, `CLAUDE.md`
- Test: aucun — c'est précisément ce que les tests ne verront jamais.

- [ ] **Step 1 : lancer l'application et regarder l'écran**

```bash
npm --prefix dashboard run build && npm --prefix dashboard run preview
```

Ouvrir l'aperçu à **1440 × 980**, artboard `Main.dc.html` ouvert à côté. Vérifier, un par un :

- [ ] les huit onglets sont là, y compris ceux à zéro ;
- [ ] l'onglet actif porte le fond ET le trait de 2 px, pas seulement une couleur ;
- [ ] la liste ne fait **pas** défiler la page, et la dernière ligne n'est pas coupée ;
- [ ] la ligne de pagination est en bas, séparée des lignes, jamais collée ;
- [ ] les numéros de page sont en chasse fixe et alignés ;
- [ ] replier la bande fait passer la liste de 8 à ~15 lignes, et le choix survit à un rechargement ;
- [ ] sur « Postulées », la 5e colonne montre le statut et la 6e « Postulée » ;
- [ ] sur « Retenues » (0), le vide se nomme.

- [ ] **Step 2 : mesurer le coût réel des deux nouvelles lectures**

```bash
npx supabase db query --linked "explain analyze select * from offers_dashboard_status_counts"
```

Jouer la sonde **trois fois** et retenir les deux dernières : le premier appel après une connexion neuve paie un démarrage à froid (~222 ms mesuré en passe de performance), qui n'est pas le coût de la vue.

Compter aussi les requêtes au chargement dans l'onglet réseau du navigateur : **elles doivent rester au même niveau qu'avant** (5 au chargement). `GET /statut-counts` en ajoute une, mais elle remplace un `GET /offers` qui n'existait pas — si le compte grimpe au-delà de 6, une dépendance de `useCallback` change d'identité à chaque rendu : chercher un tableau ou un objet construit en ligne.

- [ ] **Step 3 : consigner dans `docs/ETAT.md`**

Compléter la section « La veille par onglets » avec : la date de livraison, les mesures du step 2, le nombre de requêtes au chargement, et **les nombres recomptés en base** (ils bougent chaque matin — les recompter, jamais recopier ceux de la maquette).

- [ ] **Step 4 : compléter `CLAUDE.md`**

Dans la section « Consulter le tableau de bord », ajouter le paragraphe sur les onglets : que « rien de masqué » ne vaut que sur l'onglet « Toutes », que les comptes d'onglets viennent d'une vue de comptage et jamais d'un `pageSize=1`, et que l'onglet « À traiter » porte **deux** valeurs de statut parce qu'`in` ne matche jamais `null`.

- [ ] **Step 5 : commit**

```bash
git add docs/ETAT.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: la veille par onglets, mesuree et consignee

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Ce qui suit ce plan

La **passe de conformité P25** (`docs/ETAT.md`) : les neuf écarts maquette/implémentation constatés sur la phase 3 livrée, dont le fond de bouton manquant dans `theme.css:142` qui touche tous les boutons non stylés de l'application.
