import { assertEquals } from '@std/assert';
import { upsertOffers } from '../upsert.ts';
import { emptyOffer } from '../types.ts';
import type { DbClient } from '../db.ts';

/**
 * Faux client : reproduit uniquement les deux chaînes d'appels que upsertOffers utilise.
 *  - select('external_id').eq('source', s).in('external_id', ids)
 *  - upsert(rows, { onConflict })
 */
function fakeDb(known: string[]): { db: DbClient; upserted: unknown[][] } {
  const upserted: unknown[][] = [];
  const db = {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                in(_col2: string, ids: string[]) {
                  const data = ids
                    .filter((id) => known.includes(id))
                    .map((id) => ({ external_id: id }));
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
  return { db, upserted };
}

Deno.test('upsertOffers compte toutes les offres comme nouvelles quand la base est vide', async () => {
  const { db, upserted } = fakeDb([]);
  const offers = [
    emptyOffer('france_travail', 'A1', 'Dev React'),
    emptyOffer('france_travail', 'A2', 'Dev TypeScript'),
  ];

  const result = await upsertOffers(db, offers);

  assertEquals(result, { new: 2, updated: 0 });
  assertEquals(upserted.length, 1);
});

Deno.test('upsertOffers distingue les offres déjà connues', async () => {
  const { db } = fakeDb(['A1']);
  const offers = [
    emptyOffer('france_travail', 'A1', 'Dev React'),
    emptyOffer('france_travail', 'A2', 'Dev TypeScript'),
  ];

  const result = await upsertOffers(db, offers);

  assertEquals(result, { new: 1, updated: 1 });
});

Deno.test('upsertOffers ne touche pas la base pour une liste vide', async () => {
  const { db, upserted } = fakeDb([]);

  const result = await upsertOffers(db, []);

  assertEquals(result, { new: 0, updated: 0 });
  assertEquals(upserted.length, 0);
});

Deno.test('upsertOffers dédoublonne les external_id en doublon dans le même lot', async () => {
  const { db, upserted } = fakeDb([]);
  const offers = [
    emptyOffer('france_travail', 'A1', 'Dev React'),
    emptyOffer('france_travail', 'A1', 'Dev React (doublon dans le lot)'),
  ];

  const result = await upsertOffers(db, offers);

  // Deux requêtes de la matrice peuvent renvoyer la même offre : un upsert
  // contenant deux fois la même clé échouerait côté Postgres.
  assertEquals(result, { new: 1, updated: 0 });
  assertEquals((upserted[0] as unknown[]).length, 1);
});

Deno.test('upsertOffers remplace un raw absent par un objet vide', async () => {
  const { db, upserted } = fakeDb([]);
  // emptyOffer laisse raw à null, or offers.raw est NOT NULL en base.
  const offers = [emptyOffer('france_travail', 'A1', 'Dev React')];

  await upsertOffers(db, offers);

  const row = (upserted[0] as Record<string, unknown>[])[0];
  assertEquals(row.raw, {});
});

Deno.test('upsertOffers préserve un raw déjà renseigné', async () => {
  const { db, upserted } = fakeDb([]);
  const offer = emptyOffer('france_travail', 'A2', 'Dev TS');
  offer.raw = { id: 'A2', intitule: 'Dev TS' };

  await upsertOffers(db, offer ? [offer] : []);

  const row = (upserted[0] as Record<string, unknown>[])[0];
  assertEquals(row.raw, { id: 'A2', intitule: 'Dev TS' });
});
