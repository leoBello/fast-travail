import { assertEquals, assertNotEquals } from '@std/assert';
import { mapAdzunaOffer, provenanceOf } from '../mapper.ts';
import type { SearchQueryRow } from '../../_shared/types.ts';

const provenance = { searchOriginInsee: '13055', searchRadiusKm: 40, impliesRemote: null };

const sample = {
  id: '4812345678',
  title: 'Développeur React / TypeScript',
  description: 'Rejoignez notre équipe pour développer en React et TypeScript à Marseille.',
  redirect_url: 'https://www.adzuna.fr/details/4812345678',
  created: '2026-09-02T08:00:00Z',
  company: { display_name: 'ACME SAS' },
  location: {
    display_name: 'Marseille, Bouches-du-Rhône',
    area: ['France', "Provence-Alpes-Côte d'Azur", 'Bouches-du-Rhône', 'Marseille'],
  },
  latitude: 43.2965,
  longitude: 5.3698,
  contract_type: 'permanent',
  contract_time: 'full_time',
  salary_min: 45000,
  salary_max: 55000,
};

Deno.test('mapAdzunaOffer projette les champs de base', () => {
  const offer = mapAdzunaOffer(sample, provenance)!;

  assertEquals(offer.source, 'adzuna');
  assertEquals(offer.external_id, '4812345678');
  assertEquals(offer.title, 'Développeur React / TypeScript');
  assertEquals(offer.company_name, 'ACME SAS');
  assertEquals(offer.url, 'https://www.adzuna.fr/details/4812345678');
  assertEquals(offer.city, 'Marseille, Bouches-du-Rhône');
  assertEquals(offer.latitude, 43.2965);
  assertEquals(offer.published_at, '2026-09-02T08:00:00.000Z');
});

Deno.test('mapAdzunaOffer traduit contract_type en vocabulaire France Travail', () => {
  assertEquals(mapAdzunaOffer(sample, provenance)!.contract_type, 'CDI');

  const cdd = { ...sample, contract_type: 'contract' };
  assertEquals(mapAdzunaOffer(cdd, provenance)!.contract_type, 'CDD');

  const unknown = { ...sample, contract_type: undefined };
  assertEquals(mapAdzunaOffer(unknown, provenance)!.contract_type, null);
});

Deno.test('mapAdzunaOffer compose une fourchette de salaire lisible', () => {
  assertEquals(mapAdzunaOffer(sample, provenance)!.salary_raw, '45000 - 55000 EUR/an');

  const single = { ...sample, salary_max: undefined };
  assertEquals(mapAdzunaOffer(single, provenance)!.salary_raw, '45000 EUR/an');

  const none = { ...sample, salary_min: undefined, salary_max: undefined };
  assertEquals(mapAdzunaOffer(none, provenance)!.salary_raw, null);
});

// --- Résolution B : department est un CODE INSEE, pas le nom brut d'Adzuna ---

Deno.test('mapAdzunaOffer déduit le code du département depuis la hiérarchie de zones', () => {
  // area = [pays, région, département, ville] ici, mais le mapper ne se fie à aucun
  // indice fixe : departmentCodeFromArea parcourt toutes les entrées.
  assertEquals(mapAdzunaOffer(sample, provenance)!.department, '13');

  const shallow = { ...sample, location: { display_name: 'France', area: ['France'] } };
  assertEquals(mapAdzunaOffer(shallow, provenance)!.department, null);
});

Deno.test('mapAdzunaOffer déduit aussi Var et Vaucluse', () => {
  const varOffer = {
    ...sample,
    location: {
      display_name: 'Toulon',
      area: ['France', "Provence-Alpes-Côte d'Azur", 'Var', 'Toulon'],
    },
  };
  assertEquals(mapAdzunaOffer(varOffer, provenance)!.department, '83');

  const vaucluseOffer = {
    ...sample,
    location: {
      display_name: 'Avignon',
      area: ['France', "Provence-Alpes-Côte d'Azur", 'Vaucluse', 'Avignon'],
    },
  };
  assertEquals(mapAdzunaOffer(vaucluseOffer, provenance)!.department, '84');
});

Deno.test('mapAdzunaOffer ne confond pas une région avec un département', () => {
  // "Ile-de-France" est une région à l'indice 1, pas un département : le vrai département
  // ("Paris") est plus loin dans la hiérarchie et doit quand même être trouvé.
  const idf = {
    ...sample,
    location: {
      display_name: '1er Arrondissement',
      area: ['France', 'Ile-de-France', 'Paris', '1er Arrondissement'],
    },
  };
  assertEquals(mapAdzunaOffer(idf, provenance)!.department, '75');
});

// --- Résolution C : remote_label via classifyRemote, avec repli sur la provenance ---

Deno.test('mapAdzunaOffer détecte le télétravail explicite dans le texte, quelle que soit la provenance', () => {
  const remote = { ...sample, description: 'Poste 100% en télétravail.' };
  assertEquals(mapAdzunaOffer(remote, provenance)!.remote_label, 'full');
  assertEquals(mapAdzunaOffer(remote, provenance)!.is_remote, true);

  assertEquals(mapAdzunaOffer(sample, provenance)!.remote_label, null);
  assertEquals(mapAdzunaOffer(sample, provenance)!.is_remote, false);
});

Deno.test('mapAdzunaOffer retombe sur la garantie de la requête quand le texte est muet', () => {
  const mute = { ...sample, description: 'Rejoignez une équipe dynamique à taille humaine.' };
  const remoteProvenance = { ...provenance, impliesRemote: 'full' as const };

  assertEquals(mapAdzunaOffer(mute, remoteProvenance)!.remote_label, 'full');
  assertEquals(mapAdzunaOffer(mute, remoteProvenance)!.is_remote, true);
});

Deno.test('mapAdzunaOffer sans texte ni garantie reste null', () => {
  const mute = { ...sample, description: 'Rejoignez une équipe dynamique à taille humaine.' };
  assertEquals(mapAdzunaOffer(mute, provenance)!.remote_label, null);
  assertEquals(mapAdzunaOffer(mute, provenance)!.is_remote, false);
});

Deno.test(
  "mapAdzunaOffer ne ressuscite PAS en 'full' une offre qui refuse explicitement le télétravail, malgré la garantie de requête",
  () => {
    // classifyRemote rend null à la fois pour un texte muet et pour une négation
    // ("pas de télétravail") : la garantie de requête ne doit combler que le premier cas.
    const denies = { ...sample, description: 'Poste sur site, pas de télétravail possible.' };
    const remoteProvenance = { ...provenance, impliesRemote: 'full' as const };

    assertNotEquals(mapAdzunaOffer(denies, remoteProvenance)!.remote_label, 'full');
    assertEquals(mapAdzunaOffer(denies, remoteProvenance)!.remote_label, null);
    assertEquals(mapAdzunaOffer(denies, remoteProvenance)!.is_remote, false);
  },
);

Deno.test('mapAdzunaOffer : un texte explicite mais partiel (hybride) prime toujours sur la garantie', () => {
  const partial = {
    ...sample,
    description: 'Télétravail : 2 jours par semaine, le reste au bureau.',
  };
  const remoteProvenance = { ...provenance, impliesRemote: 'full' as const };

  assertEquals(mapAdzunaOffer(partial, remoteProvenance)!.remote_label, 'hybride');
  assertEquals(mapAdzunaOffer(partial, remoteProvenance)!.is_remote, true);
});

Deno.test('mapAdzunaOffer renvoie null sur un payload inutilisable', () => {
  assertEquals(mapAdzunaOffer({}, provenance), null);
  assertEquals(mapAdzunaOffer({ id: '1' }, provenance), null);
  assertEquals(mapAdzunaOffer(null, provenance), null);
});

// --- provenanceOf : lecture de extra_params.implies_remote ---

const baseQuery: SearchQueryRow = {
  id: 200,
  source: 'adzuna',
  label: 'adzuna:remote:full-remote',
  keywords: 'TypeScript',
  commune_insee: null,
  radius_km: null,
  extra_params: {},
  published_since_days: 3,
  priority: 50,
  enabled: true,
};

Deno.test('provenanceOf lit implies_remote quand la valeur est un mode connu', () => {
  const query = { ...baseQuery, extra_params: { implies_remote: 'full' } };
  assertEquals(provenanceOf(query).impliesRemote, 'full');
});

Deno.test('provenanceOf ignore une valeur inconnue de implies_remote', () => {
  const query = { ...baseQuery, extra_params: { implies_remote: 'nimportequoi' } };
  assertEquals(provenanceOf(query).impliesRemote, null);
});

Deno.test('provenanceOf renvoie null sans implies_remote', () => {
  assertEquals(provenanceOf(baseQuery).impliesRemote, null);
});

Deno.test(
  "provenanceOf ignore les propriétés héritées d'Object (toString, constructor)",
  () => {
    // La garde de type interroge un objet indexé par les modes valides. Avec
    // l'opérateur `in`, qui remonte la chaîne de prototypes, « toString » et
    // « constructor » auraient été acceptés comme des modes de télétravail —
    // et une requête portant `implies_remote: "toString"` aurait écrit cette
    // chaîne dans offers.remote_label. D'où Object.hasOwn.
    for (const hérité of ['toString', 'constructor', 'hasOwnProperty', '__proto__']) {
      const query = { ...baseQuery, extra_params: { implies_remote: hérité } };
      assertEquals(provenanceOf(query).impliesRemote, null, `${hérité} doit être rejeté`);
    }
  },
);

// Valeurs attendues écrites en dur d'après le contenu réel de la fixture (vérifiées en
// exécutant mapAdzunaOffer dessus), pas relues dynamiquement depuis elle : le test doit
// prouver la justesse du mapping (Résolutions B et C), pas seulement l'absence
// d'exception. L'ordre suit celui de la fixture (verbatim de l'échantillon source).
const FIXTURE_EXPECTATIONS = [
  {
    external_id: '5856347976',
    title: 'Développeur Java / JavaFX (H/F/X)',
    department: '13', // Bouches-du-Rhône, via Aix-en-Provence dans location.area
    contract_type: null, // contract_type absent de cette offre
    contract_label: 'full_time',
    salary_raw: '35000 - 45000 EUR/an',
    remote_label: null, // aucune mention de télétravail dans titre + description
  },
  {
    external_id: '5831898463',
    title: 'Administrateur système Confirmé F/H',
    department: '13', // Bouches-du-Rhône, via Marseille/Allauch
    contract_type: 'CDI', // contract_type: 'permanent'
    contract_label: null, // contract_time absent de cette offre
    salary_raw: '45000 - 55000 EUR/an',
    remote_label: null,
  },
  {
    external_id: '5859603653',
    title: 'Consultant Sage 100 - CDI (H/F) - Full remote',
    department: '13', // Bouches-du-Rhône, via Marseille/Allauch
    contract_type: 'CDI',
    contract_label: 'full_time',
    salary_raw: '35000 - 50000 EUR/an',
    remote_label: 'full', // "Full remote" dans le titre ET la description
  },
] as const;

Deno.test('la fixture Adzuna réelle se mappe conformément aux Résolutions B et C', async () => {
  const text = await Deno.readTextFile(
    new URL('./fixtures/adzuna-search-response.json', import.meta.url),
  );
  const payload = JSON.parse(text) as { results: unknown[] };

  assertEquals(payload.results.length, FIXTURE_EXPECTATIONS.length);
  const mapped = payload.results.map((r) => mapAdzunaOffer(r, provenance));

  for (const [offer, expected] of mapped.map((o, i) => [o, FIXTURE_EXPECTATIONS[i]] as const)) {
    assertNotEquals(offer, null);
    assertEquals(offer!.external_id, expected.external_id);
    assertEquals(offer!.title, expected.title);
    // Résolution B : le département est un code INSEE dérivé de location.area, pas le
    // nom brut d'Adzuna.
    assertEquals(offer!.department, expected.department, `department pour ${expected.title}`);
    // Résolution C : remote_label via classifyRemote (+ repli sur la garantie, muette ici).
    assertEquals(
      offer!.remote_label,
      expected.remote_label,
      `remote_label pour ${expected.title}`,
    );
    assertEquals(
      offer!.is_remote,
      expected.remote_label === 'full' || expected.remote_label === 'hybride',
      `is_remote pour ${expected.title}`,
    );
    assertEquals(
      offer!.contract_type,
      expected.contract_type,
      `contract_type pour ${expected.title}`,
    );
    assertEquals(
      offer!.contract_label,
      expected.contract_label,
      `contract_label pour ${expected.title}`,
    );
    assertEquals(offer!.salary_raw, expected.salary_raw, `salary_raw pour ${expected.title}`);
  }
});
