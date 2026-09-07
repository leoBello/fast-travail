import { emptyOffer, type NormalizedOffer, type SearchQueryRow } from '../_shared/types.ts';

export interface FtProvenance {
  searchOriginInsee: string | null;
  searchRadiusKm: number | null;
}

const REMOTE_HINTS = ['télétravail', 'teletravail', 'remote', 'à distance', 'full remote'];

interface FtRawOffer {
  id?: string;
  intitule?: string;
  description?: string;
  dateCreation?: string;
  dateActualisation?: string;
  lieuTravail?: {
    libelle?: string;
    latitude?: number;
    longitude?: number;
    codePostal?: string;
    commune?: string;
  };
  entreprise?: { nom?: string };
  typeContrat?: string;
  typeContratLibelle?: string;
  experienceLibelle?: string;
  salaire?: { libelle?: string };
  origineOffre?: { urlOrigine?: string };
  dureeTravailLibelle?: string;
}

export function provenanceOf(query: SearchQueryRow): FtProvenance {
  return {
    searchOriginInsee: query.commune_insee,
    searchRadiusKm: query.radius_km,
  };
}

function toIso(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Renvoie null quand le payload n'a pas le minimum exploitable : id et intitulé. */
export function mapFtOffer(raw: unknown, provenance: FtProvenance): NormalizedOffer | null {
  if (!raw || typeof raw !== 'object') return null;
  const ft = raw as FtRawOffer;
  if (!ft.id || !ft.intitule) return null;

  const offer = emptyOffer('france_travail', ft.id, ft.intitule);

  offer.description = ft.description ?? null;
  offer.company_name = ft.entreprise?.nom ?? null;
  offer.contract_type = ft.typeContrat ?? null;
  offer.contract_label = ft.typeContratLibelle ?? null;
  offer.experience_raw = ft.experienceLibelle ?? null;
  offer.salary_raw = ft.salaire?.libelle ?? null;
  offer.duration_raw = ft.dureeTravailLibelle ?? null;
  offer.url = ft.origineOffre?.urlOrigine ?? null;
  offer.published_at = toIso(ft.dateCreation);

  offer.city = ft.lieuTravail?.libelle ?? null;
  offer.postal_code = ft.lieuTravail?.codePostal ?? null;
  offer.commune_insee = ft.lieuTravail?.commune ?? null;
  offer.latitude = ft.lieuTravail?.latitude ?? null;
  offer.longitude = ft.lieuTravail?.longitude ?? null;
  // Le département se déduit du code postal : l'API ne l'expose pas en clair.
  offer.department = ft.lieuTravail?.codePostal?.slice(0, 2) ?? null;

  // L'API n'a pas de filtre télétravail fiable : on le déduit du texte.
  const haystack = `${ft.intitule} ${ft.description ?? ''}`.toLowerCase();
  offer.is_remote = REMOTE_HINTS.some((hint) => haystack.includes(hint));

  offer.search_origin_insee = provenance.searchOriginInsee;
  offer.search_radius_km = provenance.searchRadiusKm;
  offer.raw = raw;

  return offer;
}
