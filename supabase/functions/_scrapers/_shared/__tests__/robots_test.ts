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

Deno.test('un motif ancré par $ ne matche que le chemin exact', () => {
  const rules = parseRobots(['User-agent: *', 'Disallow: /foo$'].join('\n'), UA);
  assertEquals(rules.allows('/foo'), false);
  assert(rules.allows('/foo/bar'));
});

Deno.test("Allow l'emporte sur Disallow à motif de même longueur", () => {
  // « /a*c » et « /abc » ont tous deux 4 caractères. Les deux matchent
  // « /abc » : à égalité de longueur, Allow doit l'emporter.
  const rules = parseRobots(
    ['User-agent: *', 'Disallow: /a*c', 'Allow: /abc'].join('\n'),
    UA,
  );
  assert(rules.allows('/abc'));
});

Deno.test("plusieurs User-agent: empilées s'appliquent toutes au même groupe", () => {
  const rules = parseRobots(
    [
      `User-agent: ${UA}`,
      'User-agent: SomeOtherBot',
      'Disallow: /private',
    ].join('\n'),
    UA,
  );
  assertEquals(rules.allows('/private'), false);
  assert(rules.allows('/public'));
});

Deno.test('une directive intercalée entre deux User-agent: ferme la liste en cours', () => {
  // Le Crawl-delay clôt le groupe de fast-travail avant que SomeOtherBot ne
  // démarre le sien : notre agent ne doit pas hériter du Disallow ci-dessous.
  const rules = parseRobots(
    [
      `User-agent: ${UA}`,
      'Crawl-delay: 5',
      'User-agent: SomeOtherBot',
      'Disallow: /private',
    ].join('\n'),
    UA,
  );
  assert(rules.allows('/private'));
});
