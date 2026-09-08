import { assert, assertEquals } from '@std/assert';
import { extractJsonLd } from '../../_shared/html.ts';
import { mapFreeWorkOffer } from '../mapper.ts';

function rawFromFixture(name: string, path: string) {
  const html = Deno.readTextFileSync(new URL(`./fixtures/${name}`, import.meta.url));
  const jobPosting = extractJsonLd(html)
    .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null)
    .find((b) => b['@type'] === 'JobPosting');
  assert(jobPosting, `pas de JobPosting dans ${name}`);
  return { path, url: `https://www.free-work.com/fr/tech-it/job-mission/${path}`, jobPosting };
}

const CONTRACTOR_PATH =
  'developpeur-front-end-javascript-node-react-angular-vue/developpeur-react-node-nestjs-anglais-courant-obligatoire';
const PERMANENT_PATH =
  'developpeur-front-end-javascript-node-react-angular-vue/developpeur-net-react-h-f-59';

Deno.test('mission freelance : contrat, TJM et télétravail', () => {
  const offer = mapFreeWorkOffer(rawFromFixture('job-contractor-tjm.html', CONTRACTOR_PATH));
  assert(offer);

  assertEquals(offer.source, 'free_work');
  assertEquals(offer.external_id, CONTRACTOR_PATH);
  assertEquals(offer.title, 'Developpeur React/Node/NestJS - Anglais courant obligatoire');
  assertEquals(offer.company_name, 'ALLEGIS GROUP');
  assertEquals(offer.contract_type, 'Freelance');
  assertEquals(offer.contract_label, 'CONTRACTOR');
  assertEquals(offer.rate_raw, '450 EUR/jour');
  assertEquals(offer.salary_raw, null);
  assertEquals(offer.published_at, '2026-09-04T08:39:21.000Z');
  // « France » est ce que le site écrit quand il n'y a pas de lieu : ce n'est pas une ville.
  assertEquals(offer.city, null);
  assertEquals(offer.postal_code, null);
  assertEquals(offer.department, null);
  assertEquals(offer.remote_label, 'full');
  assertEquals(offer.is_remote, true);
});

Deno.test('la description est du texte, pas du HTML', () => {
  const offer = mapFreeWorkOffer(rawFromFixture('job-contractor-tjm.html', CONTRACTOR_PATH));
  assert(offer?.description);
  // Mesuré sur la fixture : 1 269 caractères une fois les balises retirées.
  // C'est un compte d'unités UTF-16 (`String.length`), pas de points de code :
  // le texte porte deux emoji hors du plan de base multilingue (🛠️, 🧩), et
  // chacun pèse deux unités UTF-16 pour un seul point de code. Un compte en
  // points de code (`Array.from(text).length`, ou `len()` en Python) donnerait
  // 1 267 sans que la chaîne soit différente — même texte, règle différente.
  assertEquals(offer.description.length, 1269);
  assertEquals(offer.description.includes('<'), false);
  assertEquals(offer.description.includes('&nbsp;'), false);
});

Deno.test('offre en CDI : contrat, salaire annuel et ville', () => {
  const offer = mapFreeWorkOffer(rawFromFixture('job-permanent-salary.html', PERMANENT_PATH));
  assert(offer);

  assertEquals(offer.title, 'Développeur .NET React H/F');
  assertEquals(offer.company_name, 'ADSearch');
  assertEquals(offer.contract_type, 'CDI');
  assertEquals(offer.contract_label, 'FULL_TIME');
  assertEquals(offer.salary_raw, '40000 EUR/an');
  assertEquals(offer.rate_raw, null);
  assertEquals(offer.city, 'Antibes');
  // Antibes est dans le 06 : hors des trois départements de la zone, donc null.
  assertEquals(offer.department, null);
  assertEquals(offer.published_at, '2026-09-07T22:45:08.000Z');
  assertEquals(offer.remote_label, null);
  assertEquals(offer.is_remote, false);
});

Deno.test('une commune de la zone donne son département', () => {
  // Charge utile construite à la main : aucune fixture ne porte de commune de la zone.
  const offer = mapFreeWorkOffer({
    path: 'x/y',
    url: 'https://www.free-work.com/fr/tech-it/job-mission/x/y',
    jobPosting: {
      '@type': 'JobPosting',
      title: 'Développeur React',
      description: '<p>Mission à Aix.</p>',
      jobLocation: { address: { addressLocality: 'Aix-en-Provence', addressCountry: 'FR' } },
    },
  });

  assertEquals(offer?.city, 'Aix-en-Provence');
  assertEquals(offer?.department, '13');
});

Deno.test('le code postal prime sur le nom de commune', () => {
  const offer = mapFreeWorkOffer({
    path: 'x/y',
    url: 'u',
    jobPosting: {
      '@type': 'JobPosting',
      title: 'T',
      jobLocation: { address: { addressLocality: 'Marseille', postalCode: '13008' } },
    },
  });

  assertEquals(offer?.postal_code, '13008');
  assertEquals(offer?.department, '13');
});

Deno.test('TELECOMMUTE comble le silence du texte', () => {
  const offer = mapFreeWorkOffer({
    path: 'x/y',
    url: 'u',
    jobPosting: {
      '@type': 'JobPosting',
      title: 'Développeur React',
      description: '<p>Une équipe, une stack, aucun mot sur le lieu de travail.</p>',
      jobLocationType: 'TELECOMMUTE',
    },
  });

  assertEquals(offer?.remote_label, 'full');
});

Deno.test('un refus explicite l’emporte sur TELECOMMUTE', () => {
  const offer = mapFreeWorkOffer({
    path: 'x/y',
    url: 'u',
    jobPosting: {
      '@type': 'JobPosting',
      title: 'Développeur React',
      description: '<p>Poste sur site, pas de télétravail.</p>',
      jobLocationType: 'TELECOMMUTE',
    },
  });

  assertEquals(offer?.remote_label, null);
  assertEquals(offer?.is_remote, false);
});

Deno.test('une charge utile inexploitable rend null plutôt qu’une offre creuse', () => {
  assertEquals(mapFreeWorkOffer(null), null);
  assertEquals(mapFreeWorkOffer({ path: 'x/y', url: 'u' }), null);
  assertEquals(mapFreeWorkOffer({ path: '', url: 'u', jobPosting: { title: 'T' } }), null);
  assertEquals(mapFreeWorkOffer({ path: 'x/y', url: 'u', jobPosting: {} }), null);
});
