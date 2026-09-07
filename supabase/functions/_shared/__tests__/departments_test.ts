import { assertEquals } from '@std/assert';
import { departmentCodeFromArea, departmentCodeFromName, DEPARTMENTS } from '../departments.ts';

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

Deno.test('la table des départements compte 101 entrées sans doublon de code', () => {
  const codes = Object.keys(DEPARTMENTS);
  assertEquals(codes.length, 101);
  assertEquals(new Set(codes).size, 101, 'code en doublon détecté dans la table');

  // Chaque nom doit se retrouver via departmentCodeFromName, sinon la normalisation
  // ou la transcription d'un nom est en cause.
  for (const [code, name] of Object.entries(DEPARTMENTS)) {
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
