import { assertEquals, assertNotEquals } from '@std/assert';
import { mapFtOffer, provenanceOf } from '../mapper.ts';
import type { SearchQueryRow } from '../../_shared/types.ts';

const provenance = { searchOriginInsee: '13055', searchRadiusKm: 40 };

const sample = {
  id: '190QRPX',
  intitule: 'Développeur Front-End React / TypeScript (H/F)',
  description: 'Vous rejoignez une équipe produit pour développer en React et TypeScript.',
  dateCreation: '2026-09-01T09:12:33.000Z',
  dateActualisation: '2026-09-03T11:00:00.000Z',
  lieuTravail: {
    libelle: '13 - MARSEILLE 02',
    latitude: 43.3049,
    longitude: 5.3661,
    codePostal: '13002',
    commune: '13202',
  },
  entreprise: { nom: 'ACME TECH' },
  typeContrat: 'CDI',
  typeContratLibelle: 'Contrat à durée indéterminée',
  experienceLibelle: '5 ans',
  salaire: { libelle: 'Annuel de 45000,00 Euros à 55000,00 Euros' },
  origineOffre: { urlOrigine: 'https://candidat.francetravail.fr/offres/recherche/detail/190QRPX' },
  dureeTravailLibelle: '35H Travail en journée',
};

Deno.test('mapFtOffer projette les champs de base', () => {
  const offer = mapFtOffer(sample, provenance)!;

  assertEquals(offer.source, 'france_travail');
  assertEquals(offer.external_id, '190QRPX');
  assertEquals(offer.title, 'Développeur Front-End React / TypeScript (H/F)');
  assertEquals(offer.company_name, 'ACME TECH');
  assertEquals(offer.contract_type, 'CDI');
  assertEquals(offer.contract_label, 'Contrat à durée indéterminée');
  assertEquals(offer.experience_raw, '5 ans');
  assertEquals(offer.salary_raw, 'Annuel de 45000,00 Euros à 55000,00 Euros');
  assertEquals(
    offer.url,
    'https://candidat.francetravail.fr/offres/recherche/detail/190QRPX',
  );
});

Deno.test('mapFtOffer extrait la géographie et le département depuis le code postal', () => {
  const offer = mapFtOffer(sample, provenance)!;

  assertEquals(offer.city, '13 - MARSEILLE 02');
  assertEquals(offer.postal_code, '13002');
  assertEquals(offer.commune_insee, '13202');
  assertEquals(offer.department, '13');
  assertEquals(offer.latitude, 43.3049);
  assertEquals(offer.longitude, 5.3661);
});

Deno.test('mapFtOffer conserve la provenance de la requête', () => {
  const offer = mapFtOffer(sample, provenance)!;
  assertEquals(offer.search_origin_insee, '13055');
  assertEquals(offer.search_radius_km, 40);
});

Deno.test('mapFtOffer normalise la date de publication en ISO', () => {
  const offer = mapFtOffer(sample, provenance)!;
  assertEquals(offer.published_at, '2026-09-01T09:12:33.000Z');
});

Deno.test('mapFtOffer conserve le payload brut', () => {
  const offer = mapFtOffer(sample, provenance)!;
  assertEquals((offer.raw as { id: string }).id, '190QRPX');
});

Deno.test('mapFtOffer détecte le télétravail dans la description', () => {
  const remote = { ...sample, description: 'Poste ouvert au télétravail complet.' };
  assertEquals(mapFtOffer(remote, provenance)!.is_remote, true);

  assertEquals(mapFtOffer(sample, provenance)!.is_remote, false);
});

Deno.test('mapFtOffer survit à une offre minimale sans champs optionnels', () => {
  const minimal = { id: 'X1', intitule: 'Dev' };
  const offer = mapFtOffer(minimal, provenance)!;

  assertEquals(offer.external_id, 'X1');
  assertEquals(offer.title, 'Dev');
  assertEquals(offer.description, null);
  assertEquals(offer.city, null);
  assertEquals(offer.latitude, null);
  assertEquals(offer.department, null);
});

Deno.test('mapFtOffer renvoie null sur un payload inutilisable', () => {
  assertEquals(mapFtOffer({}, provenance), null);
  assertEquals(mapFtOffer({ id: 'X' }, provenance), null);
  assertEquals(mapFtOffer(null, provenance), null);
});

Deno.test('mapFtOffer classe le télétravail hybride via classifyRemote', () => {
  const hybride = {
    ...sample,
    description: 'Poste avec 2 jours de télétravail par semaine.',
  };
  const offer = mapFtOffer(hybride, provenance)!;
  assertEquals(offer.remote_label, 'hybride');
  assertEquals(offer.is_remote, true);
});

Deno.test('mapFtOffer classe le télétravail full via classifyRemote', () => {
  const full = { ...sample, description: 'Poste en télétravail complet, sans venue au bureau.' };
  const offer = mapFtOffer(full, provenance)!;
  assertEquals(offer.remote_label, 'full');
  assertEquals(offer.is_remote, true);
});

Deno.test('mapFtOffer marque le télétravail ponctuel comme non organisé (is_remote=false)', () => {
  const ponctuel = { ...sample, description: 'Télétravail possible selon les missions.' };
  const offer = mapFtOffer(ponctuel, provenance)!;
  assertEquals(offer.remote_label, 'ponctuel');
  assertEquals(offer.is_remote, false);
});

Deno.test('mapFtOffer marque une mention vague de télétravail comme non organisée (is_remote=false)', () => {
  const mention = {
    ...sample,
    description: 'Avantages : charte télétravail, CSE, épargne salariale.',
  };
  const offer = mapFtOffer(mention, provenance)!;
  assertEquals(offer.remote_label, 'mention');
  assertEquals(offer.is_remote, false);
});

Deno.test('mapFtOffer renvoie remote_label et is_remote à null/false sans aucune mention', () => {
  const offer = mapFtOffer(sample, provenance)!;
  assertEquals(offer.remote_label, null);
  assertEquals(offer.is_remote, false);
});

Deno.test('mapFtOffer combine contexteTravail.conditionsExercice pour classer le télétravail', () => {
  const withContext = {
    ...sample,
    description: 'Poste de développeur au sein de notre agence.',
    contexteTravail: { conditionsExercice: ['Possibilité de télétravail'] },
  };
  const offer = mapFtOffer(withContext, provenance)!;
  assertEquals(offer.remote_label, 'ponctuel');
  assertEquals(offer.is_remote, false);
});

Deno.test('mapFtOffer déduit le département du libellé de lieu quand codePostal est absent', () => {
  const noPostal = {
    ...sample,
    lieuTravail: { libelle: '75 - Paris 9e Arrondissement' },
  };
  const offer = mapFtOffer(noPostal, provenance)!;
  assertEquals(offer.department, '75');
});

Deno.test('mapFtOffer ne déduit pas de département depuis un libellé de région sans préfixe numérique', () => {
  const region = { ...sample, lieuTravail: { libelle: 'Ile-de-France' } };
  const offer = mapFtOffer(region, provenance)!;
  assertEquals(offer.department, null);
});

Deno.test('mapFtOffer privilégie codePostal au libellé quand les deux sont présents', () => {
  const both = {
    ...sample,
    lieuTravail: { libelle: '75 - Paris 9e Arrondissement', codePostal: '13001' },
  };
  const offer = mapFtOffer(both, provenance)!;
  assertEquals(offer.department, '13');
});

Deno.test('provenanceOf lit la commune et le rayon de la requête', () => {
  const query: SearchQueryRow = {
    id: 1,
    source: 'france_travail',
    label: 'ft:local:react',
    keywords: 'React',
    commune_insee: '13055',
    radius_km: 40,
    extra_params: {},
    published_since_days: 3,
    priority: 10,
    enabled: true,
  };
  assertEquals(provenanceOf(query), { searchOriginInsee: '13055', searchRadiusKm: 40 });

  const national: SearchQueryRow = { ...query, commune_insee: null, radius_km: null };
  assertEquals(provenanceOf(national), { searchOriginInsee: null, searchRadiusKm: null });
});

Deno.test('la fixture réelle se mappe sans exception', async () => {
  const text = await Deno.readTextFile(
    new URL('./fixtures/ft-search-response.json', import.meta.url),
  );
  const payload = JSON.parse(text) as { resultats: unknown[] };

  const mapped = payload.resultats.map((r) => mapFtOffer(r, provenance));

  assertNotEquals(mapped.length, 0);
  for (const offer of mapped) {
    assertNotEquals(offer, null);
    assertNotEquals(offer!.external_id, '');
    assertNotEquals(offer!.title, '');
  }
});
