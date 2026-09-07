import { emptyOffer, type NormalizedOffer, type SearchQueryRow } from '../_shared/types.ts';
import { classifyRemote } from '../_shared/remote.ts';

export interface FtProvenance {
  searchOriginInsee: string | null;
  searchRadiusKm: number | null;
}

/** Préfixe département d'un libellé de lieu France Travail, ex. "13 - Marseille 8e Arrondissement". */
const DEPARTMENT_PREFIX = /^(\d{2,3})\s*-/;

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
  contexteTravail?: { conditionsExercice?: string[] };
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
  // Le département se déduit d'abord du code postal ; à défaut (fréquent, l'API ne le
  // renvoie que par intermittence), on retombe sur le préfixe du libellé de lieu
  // ("13 - Marseille 8e Arrondissement"). Un libellé de région ("Ile-de-France") n'en a pas.
  const libelleDepartment = ft.lieuTravail?.libelle?.match(DEPARTMENT_PREFIX)?.[1] ?? null;
  offer.department = ft.lieuTravail?.codePostal?.slice(0, 2) ?? libelleDepartment;

  // L'API n'a pas de filtre télétravail fiable : on le déduit du texte via le
  // classifieur partagé, précis pour l'exploitabilité (full/hybride = organisé).
  const text = `${ft.intitule} ${ft.description ?? ''}`;
  const extraConditions = ft.contexteTravail?.conditionsExercice?.join(' ');
  const mode = classifyRemote(text, extraConditions);
  offer.remote_label = mode;
  offer.is_remote = mode === 'full' || mode === 'hybride';

  offer.search_origin_insee = provenance.searchOriginInsee;
  offer.search_radius_km = provenance.searchRadiusKm;
  offer.raw = raw;

  return offer;
}
