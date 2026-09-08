import { assertEquals } from '@std/assert';
import { departmentCodeFromArea, departmentCodeFromName, DEPARTMENTS } from '../departments.ts';
import { departmentCodeFromCityName } from '../departments.ts';

Deno.test('departmentCodeFromName trouve les trois départements du filtre local', () => {
  assertEquals(departmentCodeFromName('Bouches-du-Rhône'), '13');
  assertEquals(departmentCodeFromName('Var'), '83');
  assertEquals(departmentCodeFromName('Vaucluse'), '84');
});

Deno.test('departmentCodeFromName ignore accents et casse', () => {
  assertEquals(departmentCodeFromName('bouches du rhone'), '13');
  assertEquals(departmentCodeFromName('BOUCHES-DU-RHÔNE'), '13');
});

Deno.test('departmentCodeFromName gère la Corse et les DOM', () => {
  assertEquals(departmentCodeFromName('Corse-du-Sud'), '2A');
  assertEquals(departmentCodeFromName('Haute-Corse'), '2B');
  assertEquals(departmentCodeFromName('La Réunion'), '974');
});

Deno.test('departmentCodeFromName renvoie null pour un nom inconnu', () => {
  assertEquals(departmentCodeFromName('Ile-de-France'), null);
  assertEquals(departmentCodeFromName('France'), null);
  assertEquals(departmentCodeFromName(''), null);
  assertEquals(departmentCodeFromName(null), null);
  assertEquals(departmentCodeFromName(undefined), null);
});

Deno.test('la table des départements compte exactement 101 entrées', () => {
  const codes = Object.keys(DEPARTMENTS);
  assertEquals(codes.length, 101);
  assertEquals(new Set(codes).size, 101, 'code en doublon détecté dans la table');
});

/**
 * Normalisation indépendante de celle de departments.ts (NFD + suppression des marques
 * diacritiques + minuscules + séparateurs ramenés à un espace) : ne réutilise
 * délibérément aucune fonction du module testé. L'ancienne version de ce test appelait
 * `departmentCodeFromName` sur les noms de `DEPARTMENTS` elle-même — une boucle
 * aller-retour qui ne peut structurellement pas échouer, y compris sur une entrée mal
 * transcrite comme `'84': 'Vaucluze'` (le nom fautif se retrouverait quand même via sa
 * propre normalisation).
 */
function independentNormalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’\-\s]+/g, ' ')
    .trim();
}

Deno.test('aucun nom de la table ne partage sa forme normalisée avec un autre', () => {
  const names = Object.values(DEPARTMENTS);
  const normalized = names.map(independentNormalize);
  assertEquals(
    new Set(normalized).size,
    names.length,
    'deux noms de départements distincts normalisent vers la même clé',
  );
});

// Échantillon écrit en dur, indépendant de DEPARTMENTS, réparti sur toute la table :
// métropole, Corse (2A/2B), DOM. S'ajoute aux trois du filtre local (13, 83, 84) déjà
// couverts plus haut. Une entrée mal transcrite dans la table (ex. `'84': 'Vaucluze'`)
// ferait échouer l'une de ces assertions, puisque le nom attendu est écrit ici, pas lu
// depuis la table testée.
Deno.test('un échantillon de noms écrits en dur retrouve le bon code, sur toute la table', () => {
  const samples: ReadonlyArray<[string, string]> = [
    ['Ain', '01'],
    ['Alpes-Maritimes', '06'],
    ["Côte-d'Or", '21'],
    ['Finistère', '29'],
    ['Haute-Garonne', '31'],
    ['Gironde', '33'],
    ['Hérault', '34'],
    ['Ille-et-Vilaine', '35'],
    ['Isère', '38'],
    ['Loire-Atlantique', '44'],
    ['Marne', '51'],
    ['Nord', '59'],
    ['Pas-de-Calais', '62'],
    ['Bas-Rhin', '67'],
    ['Rhône', '69'],
    ['Paris', '75'],
    ['Seine-Maritime', '76'],
    ['Territoire de Belfort', '90'],
    ['Guadeloupe', '971'],
    ['Martinique', '972'],
    ['Guyane', '973'],
    ['Mayotte', '976'],
  ];
  for (const [name, code] of samples) {
    assertEquals(departmentCodeFromName(name), code, `échec pour ${name}`);
  }
});

Deno.test('departmentCodeFromArea parcourt toutes les entrées, sans se fier à un indice fixe', () => {
  assertEquals(
    departmentCodeFromArea([
      'France',
      "Provence-Alpes-Côte d'Azur",
      'Bouches-du-Rhône',
      'Marseille',
      'Allauch',
    ]),
    '13',
  );
  assertEquals(departmentCodeFromArea(['France', 'Ile-de-France', 'Paris']), '75');
});

Deno.test('departmentCodeFromArea renvoie null sans zone reconnue', () => {
  assertEquals(departmentCodeFromArea(['France', 'Ile-de-France']), null);
  assertEquals(departmentCodeFromArea([]), null);
  assertEquals(departmentCodeFromArea(null), null);
  assertEquals(departmentCodeFromArea(undefined), null);
});

Deno.test('departmentCodeFromCityName traduit les communes de la zone', () => {
  assertEquals(departmentCodeFromCityName('Marseille'), '13');
  assertEquals(departmentCodeFromCityName('Aix-en-Provence'), '13');
  assertEquals(departmentCodeFromCityName('Toulon'), '83');
  assertEquals(departmentCodeFromCityName('Avignon'), '84');
});

Deno.test('departmentCodeFromCityName ignore casse, accents et séparateurs', () => {
  assertEquals(departmentCodeFromCityName('AIX EN PROVENCE'), '13');
  assertEquals(departmentCodeFromCityName('aix-en-provence'), '13');
  assertEquals(departmentCodeFromCityName("L'Isle-sur-la-Sorgue"), '84');
});

Deno.test('departmentCodeFromCityName rend null hors zone ou sur une entrée vide', () => {
  assertEquals(departmentCodeFromCityName('Paris'), null);
  assertEquals(departmentCodeFromCityName('Antibes'), null);
  assertEquals(departmentCodeFromCityName('France'), null);
  assertEquals(departmentCodeFromCityName(null), null);
  assertEquals(departmentCodeFromCityName(''), null);
});
