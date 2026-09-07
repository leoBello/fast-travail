import { assertEquals } from '@std/assert';
import { classifyRemote } from '../remote.ts';

// --- full ---

Deno.test('classifyRemote détecte "Full Remote"', () => {
  assertEquals(classifyRemote('Poste en Full Remote pour toute la France.'), 'full');
});

Deno.test('classifyRemote détecte "100 % à distance"', () => {
  assertEquals(classifyRemote('Ce poste est proposé 100 % à distance.'), 'full');
});

Deno.test('classifyRemote détecte "100% télétravail"', () => {
  assertEquals(classifyRemote('Poste en 100% télétravail, sans venue au bureau.'), 'full');
});

Deno.test('classifyRemote détecte "télétravail à 100%"', () => {
  assertEquals(classifyRemote('Télétravail à 100% possible dès la prise de poste.'), 'full');
});

Deno.test('classifyRemote détecte le télétravail complet', () => {
  assertEquals(classifyRemote('Nous proposons un télétravail complet pour ce poste.'), 'full');
});

// --- hybride ---

Deno.test('classifyRemote détecte "hybride"', () => {
  assertEquals(
    classifyRemote('Le poste est en mode hybride, entre bureau et domicile.'),
    'hybride',
  );
});

Deno.test('classifyRemote détecte le nombre de jours placé après le mot télétravail', () => {
  assertEquals(classifyRemote('Télétravail : 2 jours par semaine'), 'hybride');
});

Deno.test('classifyRemote détecte "télétravailler jusqu\'à N jours"', () => {
  assertEquals(
    classifyRemote("Un accord télétravail pour télétravailler jusqu'à 2 jours par semaine"),
    'hybride',
  );
});

Deno.test('classifyRemote détecte "télétravail (jusqu\'à N jours)"', () => {
  assertEquals(classifyRemote("télétravail (jusqu'à 3 jours)"), 'hybride');
});

// --- ponctuel ---

Deno.test('classifyRemote détecte "possibilité de télétravail"', () => {
  assertEquals(classifyRemote('Possibilité de télétravail selon les missions.'), 'ponctuel');
});

Deno.test('classifyRemote détecte le télétravail occasionnel', () => {
  assertEquals(classifyRemote('Télétravail occasionnel envisageable.'), 'ponctuel');
});

Deno.test('classifyRemote lit extraConditions quand le texte principal est muet', () => {
  assertEquals(
    classifyRemote('Poste de développeur au sein de notre agence.', 'Possibilité de télétravail'),
    'ponctuel',
  );
});

// --- mention ---

Deno.test('classifyRemote retombe sur "mention" pour une mention vague', () => {
  assertEquals(
    classifyRemote('Avantages : charte télétravail, CSE, épargne salariale.'),
    'mention',
  );
});

// --- null ---

Deno.test('classifyRemote ignore le piège du "100%" hors contexte télétravail', () => {
  assertEquals(
    classifyRemote('Notre client affiche 100% de satisfaction. Poste sur site.'),
    null,
  );
});

Deno.test('classifyRemote renvoie null sur une négation explicite malgré le mot télétravail', () => {
  assertEquals(classifyRemote('Pas de télétravail sur ce poste'), null);
});

Deno.test('classifyRemote renvoie null sur "sans télétravail"', () => {
  assertEquals(classifyRemote('Poste sans télétravail, présence requise 5 jours sur 5.'), null);
});

Deno.test("classifyRemote renvoie null quand rien n'évoque le télétravail", () => {
  assertEquals(
    classifyRemote('Développeur front-end React/TypeScript, poste sur site à Marseille.'),
    null,
  );
});
