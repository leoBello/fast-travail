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

Deno.test('la fixture Adzuna réelle se mappe sans exception', async () => {
  const text = await Deno.readTextFile(
    new URL('./fixtures/adzuna-search-response.json', import.meta.url),
  );
  const payload = JSON.parse(text) as { results: unknown[] };

  const mapped = payload.results.map((r) => mapAdzunaOffer(r, provenance));

  assertNotEquals(mapped.length, 0);
  for (const offer of mapped) {
    assertNotEquals(offer, null);
    assertNotEquals(offer!.external_id, '');
  }
});
