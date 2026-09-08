import { assertEquals, assertRejects } from '@std/assert';
import { upsertOffers } from '../upsert.ts';
import { emptyOffer } from '../types.ts';
import type { DbClient } from '../db.ts';

/**
 * Faux client : reproduit uniquement les deux chaînes d'appels que upsertOffers utilise.
 *  - select('external_id, seen_count, found_by_query_ids').eq('source', s).in('external_id', ids)
 *  - upsert(rows, { onConflict })
 *
 * `seenCounts` permet de simuler une offre déjà vue plusieurs fois ; par défaut une
 * offre connue a été vue une fois, ce qui est l'état d'une offre collectée hier.
 *
 * `foundByQueryIds` simule le tableau relu pour chaque offre connue ; une offre
 * connue non listée ici a un tableau vide (état d'une offre collectée avant la
 * tâche 2), et `null` simule une ligne existante dont la colonne n'a jamais été
 * peuplée.
 *
 * `failOnCallIndex` simule une erreur PostgREST sur le N-ième appel de `.in(...)`
 * (0-indexé) — utile pour vérifier qu'une erreur sur un lot tardif remonte bien
 * au lieu d'être avalée. `inCalls` (exposé par le retour) enregistre la liste
 * d'ids passée à chaque appel de `.in(...)`, dans l'ordre — ce qui permet de
 * vérifier le découpage en lots sans connaître la taille de lot choisie par
 * l'implémentation.
 */
function fakeDb(
  known: string[],
  seenCounts: Record<string, number> = {},
  foundByQueryIds: Record<string, number[] | null> = {},
  opts: { failOnCallIndex?: number; failMessage?: string } = {},
): { db: DbClient; upserted: unknown[][]; inCalls: string[][] } {
  const upserted: unknown[][] = [];
  const inCalls: string[][] = [];
  const db = {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                in(_col2: string, ids: string[]) {
                  const callIndex = inCalls.length;
                  inCalls.push([...ids]);
                  if (opts.failOnCallIndex === callIndex) {
                    return Promise.resolve({
                      data: null,
                      error: { message: opts.failMessage ?? 'boom' },
                    });
                  }
                  const data = ids
                    .filter((id) => known.includes(id))
                    .map((id) => ({
                      external_id: id,
                      seen_count: seenCounts[id] ?? 1,
                      found_by_query_ids: id in foundByQueryIds ? foundByQueryIds[id] : [],
                    }));
                  return Promise.resolve({ data, error: null });
                },
              };
            },
          };
        },
        upsert(rows: unknown[], _opts: unknown) {
          upserted.push(rows);
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as DbClient;
  return { db, upserted, inCalls };
}

Deno.test('upsertOffers compte toutes les offres comme nouvelles quand la base est vide', async () => {
  const { db, upserted } = fakeDb([]);
  const offers = [
    emptyOffer('france_travail', 'A1', 'Dev React'),
    emptyOffer('france_travail', 'A2', 'Dev TypeScript'),
  ];

  const result = await upsertOffers(db, offers, { queryId: null });

  assertEquals(result, { new: 2, updated: 0 });
  assertEquals(upserted.length, 1);
});

Deno.test('upsertOffers distingue les offres déjà connues', async () => {
  const { db } = fakeDb(['A1']);
  const offers = [
    emptyOffer('france_travail', 'A1', 'Dev React'),
    emptyOffer('france_travail', 'A2', 'Dev TypeScript'),
  ];

  const result = await upsertOffers(db, offers, { queryId: null });

  assertEquals(result, { new: 1, updated: 1 });
});

Deno.test('upsertOffers ne touche pas la base pour une liste vide', async () => {
  const { db, upserted } = fakeDb([]);

  const result = await upsertOffers(db, [], { queryId: null });

  assertEquals(result, { new: 0, updated: 0 });
  assertEquals(upserted.length, 0);
});

Deno.test('upsertOffers dédoublonne les external_id en doublon dans le même lot', async () => {
  const { db, upserted } = fakeDb([]);
  const offers = [
    emptyOffer('france_travail', 'A1', 'Dev React'),
    emptyOffer('france_travail', 'A1', 'Dev React (doublon dans le lot)'),
  ];

  const result = await upsertOffers(db, offers, { queryId: null });

  // Deux requêtes de la matrice peuvent renvoyer la même offre : un upsert
  // contenant deux fois la même clé échouerait côté Postgres.
  assertEquals(result, { new: 1, updated: 0 });
  assertEquals((upserted[0] as unknown[]).length, 1);
});

Deno.test('upsertOffers remplace un raw absent par un objet vide', async () => {
  const { db, upserted } = fakeDb([]);
  // emptyOffer laisse raw à null, or offers.raw est NOT NULL en base.
  const offers = [emptyOffer('france_travail', 'A1', 'Dev React')];

  await upsertOffers(db, offers, { queryId: null });

  const row = (upserted[0] as Record<string, unknown>[])[0];
  assertEquals(row.raw, {});
});

Deno.test('upsertOffers préserve un raw déjà renseigné', async () => {
  const { db, upserted } = fakeDb([]);
  const offer = emptyOffer('france_travail', 'A2', 'Dev TS');
  offer.raw = { id: 'A2', intitule: 'Dev TS' };

  await upsertOffers(db, [offer], { queryId: null });

  const row = (upserted[0] as Record<string, unknown>[])[0];
  assertEquals(row.raw, { id: 'A2', intitule: 'Dev TS' });
});

Deno.test('upsertOffers démarre seen_count à 1 pour une offre inconnue', async () => {
  const { db, upserted } = fakeDb([]);

  await upsertOffers(db, [emptyOffer('france_travail', 'N1', 'Dev React')], { queryId: null });

  const row = (upserted[0] as Record<string, unknown>[])[0];
  assertEquals(row.seen_count, 1);
});

Deno.test("upsertOffers incrémente seen_count d'une offre déjà vue", async () => {
  // L'offre B1 a déjà été vue 4 fois : une collecte de plus doit la porter à 5.
  // C'est ce compteur qui distingue une offre fraîche d'une annonce qui traîne
  // depuis des semaines — un poste dur à pourvoir, ou republié en boucle.
  const { db, upserted } = fakeDb(['B1'], { B1: 4 });

  await upsertOffers(db, [emptyOffer('france_travail', 'B1', 'Dev React')], { queryId: null });

  const row = (upserted[0] as Record<string, unknown>[])[0];
  assertEquals(row.seen_count, 5);
});

Deno.test('upsertOffers compte séparément le seen_count de chaque offre du lot', async () => {
  // Régression : un compteur global, ou celui de la première offre appliqué à
  // tout le lot, passerait les deux tests précédents sans être correct.
  const { db, upserted } = fakeDb(['B1', 'B2'], { B1: 4, B2: 11 });

  await upsertOffers(
    db,
    [
      emptyOffer('france_travail', 'B1', 'Dev React'),
      emptyOffer('france_travail', 'B2', 'Dev TS'),
      emptyOffer('france_travail', 'N9', 'Dev Next'),
    ],
    { queryId: null },
  );

  const rows = upserted[0] as Record<string, unknown>[];
  assertEquals(rows.map((r) => [r.external_id, r.seen_count]), [
    ['B1', 5],
    ['B2', 12],
    ['N9', 1],
  ]);
});

Deno.test('upsertOffers donne à une offre nouvelle un found_by_query_ids réduit à la requête courante', async () => {
  const { db, upserted } = fakeDb([]);

  await upsertOffers(db, [emptyOffer('france_travail', 'N1', 'Dev React')], { queryId: 42 });

  const row = (upserted[0] as Record<string, unknown>[])[0];
  assertEquals(row.found_by_query_ids, [42]);
});

Deno.test("upsertOffers ajoute la requête courante à l'ensemble déjà connu", async () => {
  const { db, upserted } = fakeDb(['A1'], {}, { A1: [7] });

  await upsertOffers(db, [emptyOffer('france_travail', 'A1', 'Dev React')], { queryId: 12 });

  const row = (upserted[0] as Record<string, unknown>[])[0];
  assertEquals(row.found_by_query_ids, [7, 12]);
});

Deno.test('upsertOffers ne duplique pas un id déjà présent (union, pas concaténation)', async () => {
  // À la différence de seen_count, qui compte chaque passage, ceci est un
  // ensemble : la même requête qui retrouve la même offre dix fois ne doit
  // laisser qu'une seule trace.
  const { db, upserted } = fakeDb(['A1'], {}, { A1: [12] });

  await upsertOffers(db, [emptyOffer('france_travail', 'A1', 'Dev React')], { queryId: 12 });

  const row = (upserted[0] as Record<string, unknown>[])[0];
  assertEquals(row.found_by_query_ids, [12]);
});

Deno.test('upsertOffers traite une colonne relue à null comme un tableau vide', async () => {
  // La colonne a été ajoutée après coup : les lignes existantes avant la
  // migration ont `found_by_query_ids` à null tant qu'une collecte ne les a
  // pas retouchées.
  const { db, upserted } = fakeDb(['A1'], {}, { A1: null });

  await upsertOffers(db, [emptyOffer('france_travail', 'A1', 'Dev React')], { queryId: 5 });

  const row = (upserted[0] as Record<string, unknown>[])[0];
  assertEquals(row.found_by_query_ids, [5]);
});

Deno.test('upsertOffers avec queryId null préserve le tableau existant tel quel', async () => {
  const { db, upserted } = fakeDb(['A1'], {}, { A1: [3, 9] });

  await upsertOffers(db, [emptyOffer('france_travail', 'A1', 'Dev React')], { queryId: null });

  const row = (upserted[0] as Record<string, unknown>[])[0];
  assertEquals(row.found_by_query_ids, [3, 9]);
});

Deno.test('upsertOffers avec queryId null donne un tableau vide à une offre nouvelle', async () => {
  const { db, upserted } = fakeDb([]);

  await upsertOffers(db, [emptyOffer('france_travail', 'N2', 'Dev React')], { queryId: null });

  const row = (upserted[0] as Record<string, unknown>[])[0];
  assertEquals(row.found_by_query_ids, []);
});

Deno.test('upsertOffers trie found_by_query_ids numériquement', async () => {
  const { db, upserted } = fakeDb(['A1'], {}, { A1: [20, 5] });

  await upsertOffers(db, [emptyOffer('france_travail', 'A1', 'Dev React')], { queryId: 3 });

  const row = (upserted[0] as Record<string, unknown>[])[0];
  assertEquals(row.found_by_query_ids, [3, 5, 20]);
});

Deno.test(
  'upsertOffers lit les offres connues par lots quand le nombre d’ids dépasse un lot, et fusionne les résultats',
  async () => {
    // Régression : PostgREST place `.in(...)` dans la query string, dont la
    // longueur est bornée. Une collecte scraper peut soumettre un lot de
    // plusieurs milliers d'ids d'un coup (contrairement aux sources API, une
    // requête à la fois) — 500 ids ici, largement au-dessus d'un seul lot,
    // pour forcer plusieurs lectures séquentielles.
    const total = 500;
    const ids = Array.from({ length: total }, (_, i) => `X${i}`);
    // Une offre connue loin dans la liste : si le découpage en lots perdait ou
    // dupliquait des ids, ou traitait mal un id tombé dans un lot tardif, elle
    // serait comptée comme nouvelle au lieu d'être reconnue comme connue.
    const knownId = ids[450];
    const { db, upserted, inCalls } = fakeDb([knownId], { [knownId]: 7 }, { [knownId]: [99] });

    const offers = ids.map((id) => emptyOffer('france_travail', id, `Dev ${id}`));
    const result = await upsertOffers(db, offers, { queryId: 12 });

    // Plusieurs lectures séquentielles ont eu lieu.
    assertEquals(inCalls.length > 1, true);

    // Chaque id du lot a été demandé exactement une fois, tous ids confondus.
    const requested = inCalls.flat();
    assertEquals(requested.length, total);
    assertEquals(new Set(requested).size, total);
    assertEquals([...new Set(requested)].sort(), [...ids].sort());

    // Le résultat fusionné est identique à celui d'une lecture unique qui
    // aurait tout renvoyé d'un coup : la seule offre connue est reconnue,
    // toutes les autres sont nouvelles.
    assertEquals(result, { new: total - 1, updated: 1 });

    const knownRow = (upserted[0] as Record<string, unknown>[]).find(
      (r) => r.external_id === knownId,
    );
    assertEquals(knownRow?.seen_count, 8);
    assertEquals(knownRow?.found_by_query_ids, [12, 99]);
  },
);

Deno.test(
  "upsertOffers ne fait qu'une seule lecture quand le lot est petit",
  async () => {
    // Le cas courant — une source API upserte quelques offres à la fois — ne
    // doit pas payer un aller-retour supplémentaire pour le découpage.
    const { db, inCalls } = fakeDb([]);
    const offers = [
      emptyOffer('france_travail', 'A1', 'Dev React'),
      emptyOffer('france_travail', 'A2', 'Dev TypeScript'),
      emptyOffer('france_travail', 'A3', 'Dev Next'),
    ];

    await upsertOffers(db, offers, { queryId: null });

    assertEquals(inCalls.length, 1);
  },
);

Deno.test(
  'upsertOffers propage une erreur survenue sur un lot tardif, sans l’avaler ni écrire',
  async () => {
    const total = 500;
    const ids = Array.from({ length: total }, (_, i) => `Y${i}`);
    // La première lecture réussit, une lecture ultérieure échoue.
    const { db, upserted } = fakeDb([], {}, {}, {
      failOnCallIndex: 1,
      failMessage: 'connexion perdue',
    });
    const offers = ids.map((id) => emptyOffer('france_travail', id, `Dev ${id}`));

    await assertRejects(
      () => upsertOffers(db, offers, { queryId: null }),
      Error,
      'lecture des offres connues : connexion perdue',
    );

    // L'écriture ne doit jamais avoir lieu si la lecture a échoué.
    assertEquals(upserted.length, 0);
  },
);
