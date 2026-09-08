import { assert, assertEquals } from '@std/assert';
import { extractNextData } from '../../_shared/html.ts';
import { mapCollectiveOffer } from '../mapper.ts';

const html = await Deno.readTextFile(new URL('./fixtures/jobs-fr-page1.html', import.meta.url));

/** Descend dans le payload de la fixture, en vérifiant chaque étape. */
function dig(value: unknown, ...keys: string[]): unknown {
  let current = value;
  for (const key of keys) {
    assert(typeof current === 'object' && current !== null, `chemin interrompu à ${key}`);
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function projects(): Record<string, unknown>[] {
  const queries = dig(extractNextData(html), 'props', 'pageProps', 'dehydratedState', 'queries');
  assert(Array.isArray(queries) && queries.length > 0);
  const list = dig(queries[0], 'state', 'data', 'results', 'projects');
  assert(Array.isArray(list));
  return list as Record<string, unknown>[];
}

Deno.test('première mission de la page réelle', () => {
  const offer = mapCollectiveOffer(projects()[0]);
  assert(offer);

  assertEquals(offer.source, 'collective');
  assertEquals(offer.external_id, 'cmtruvqzr58974jdcgiwp482i');
  assertEquals(offer.title, 'Consultant Senior DORA / IT Risk - Banque');
  assertEquals(offer.company_name, 'Anderson RH');
  assertEquals(
    offer.url,
    'https://www.collective.work/jobs/consultant-senior-dora-it-risk-banque-gt48',
  );
  assertEquals(offer.published_at, '2026-09-07T23:12:34.420Z');
  assertEquals(offer.city, 'Paris');
  assertEquals(offer.department, null);
  assertEquals(offer.contract_type, 'Freelance');
  assertEquals(offer.start_date_raw, 'IN_2_TO_4_WEEKS');
  // Le texte dit « 2 jours de télétravail » : il l'emporte, et il dit la même
  // chose que workPreferences ['HYBRID'].
  assertEquals(offer.remote_label, 'hybride');
  assertEquals(offer.is_remote, true);
});

Deno.test('la description est du texte, pas du HTML', () => {
  const offer = mapCollectiveOffer(projects()[0]);
  assert(offer?.description);
  assertEquals(offer.description.includes('<h3>'), false);
  assertEquals(offer.description.includes('<li>'), false);
  assert(offer.description.length > 500, 'description tronquée');
});

Deno.test('budgetBrief alimente rate_raw tel quel', () => {
  // Mesuré : une seule mission de la page en porte un, à l'indice 22.
  const offer = mapCollectiveOffer(projects()[22]);
  assertEquals(offer?.rate_raw, '450 à 550€');
});

Deno.test('REMOTE comble le silence, la négation l’emporte', () => {
  const base = {
    id: 'x',
    slug: 'y',
    name: 'Développeur React',
    publishedAt: '2026-09-07T00:00:00.000Z',
    workPreferences: ['REMOTE'],
  };

  assertEquals(
    mapCollectiveOffer({ ...base, description: '<p>Une mission, aucune mention du lieu.</p>' })
      ?.remote_label,
    'full',
  );
  assertEquals(
    mapCollectiveOffer({ ...base, description: '<p>Sur site, pas de télétravail.</p>' })
      ?.remote_label,
    null,
  );
});

Deno.test('une commune de la zone donne son département', () => {
  const offer = mapCollectiveOffer({
    id: 'x',
    slug: 'y',
    name: 'Développeur React',
    location: { fullNameFrench: 'Aix-en-Provence, France' },
  });

  assertEquals(offer?.city, 'Aix-en-Provence');
  assertEquals(offer?.department, '13');
});

Deno.test('CDI reconnu par isPermanentContract', () => {
  const offer = mapCollectiveOffer({ id: 'x', slug: 'y', name: 'T', isPermanentContract: true });
  assertEquals(offer?.contract_type, 'CDI');
});

Deno.test('une charge utile inexploitable rend null', () => {
  assertEquals(mapCollectiveOffer(null), null);
  assertEquals(mapCollectiveOffer({ slug: 'y', name: 'T' }), null);
  assertEquals(mapCollectiveOffer({ id: 'x', slug: 'y' }), null);
});
