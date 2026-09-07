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
