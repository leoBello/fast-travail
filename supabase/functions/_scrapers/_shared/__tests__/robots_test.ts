import { assert, assertEquals } from '@std/assert';
import { parseRobots } from '../robots.ts';

const UA = 'fast-travail/0.1 (veille personnelle)';

const freeWork = await Deno.readTextFile(
  new URL('./fixtures/robots-free-work.txt', import.meta.url),
);
const collective = await Deno.readTextFile(
  new URL('./fixtures/robots-collective.txt', import.meta.url),
);

Deno.test('Free-Work : les surfaces de collecte sont autorisées', () => {
  const rules = parseRobots(freeWork, UA);
  assert(rules.allows('/fr/tech-it/jobs/react'));
  assert(rules.allows('/fr/tech-it/jobs/react?sort=date&page=2'));
  assert(rules.allows('/fr/tech-it/job-mission/developpeur-python/x'));
});

Deno.test('Free-Work : les chemins interdits le restent', () => {
  const rules = parseRobots(freeWork, UA);
  assertEquals(rules.allows('/login'), false);
  assertEquals(rules.allows('/logout'), false);
  assertEquals(rules.allows('/fw-deals'), false);
});

Deno.test("Free-Work : le groupe nominatif l'emporte sur le groupe étoile", () => {
  // Le fichier réel interdit tout à Wget nommément. C'est la preuve que la
  // sélection de groupe fonctionne, et pas seulement la lecture des règles.
  const rules = parseRobots(freeWork, 'Wget/1.21');
  assertEquals(rules.allows('/fr/tech-it/jobs/react'), false);
});

Deno.test('Collective : /jobs autorisé, /style-guide interdit', () => {
  const rules = parseRobots(collective, UA);
  assert(rules.allows('/jobs/fr'));
  assert(rules.allows('/jobs/fr?page=2'));
  assertEquals(rules.allows('/style-guide'), false);
});

Deno.test('les jokers et la règle du motif le plus long sont respectés', () => {
  // Forme réelle rencontrée sur codeur.com : tout ce qui porte une query string
  // est interdit, SAUF la pagination.
  const rules = parseRobots(
    ['User-agent: *', 'Disallow: /*?*', 'Allow: /*?page=*'].join('\n'),
    UA,
  );
  assert(rules.allows('/projects'));
  assert(rules.allows('/projects?page=2'));
  assertEquals(rules.allows('/projects?q=react'), false);
});

Deno.test('un fichier vide autorise tout', () => {
  assert(parseRobots('', UA).allows('/quoi-que-ce-soit'));
});
