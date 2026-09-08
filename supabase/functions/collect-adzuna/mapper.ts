import { emptyOffer, type NormalizedOffer, type SearchQueryRow } from '../_shared/types.ts';
import { departmentCodeFromArea } from '../_shared/departments.ts';
import { classifyRemote, hasRemoteNegation, type RemoteMode } from '../_shared/remote.ts';

/**
 * Clé de extra_params portant la garantie de télétravail de la requête. Une seule
 * constante, importée par client.ts (qui doit ne JAMAIS la transmettre à l'URL Adzuna)
 * et par ce fichier (qui la lit) : un renommage des deux côtés ne peut pas diverger.
 */
export const IMPLIES_REMOTE_KEY = 'implies_remote';

/** Valeurs acceptées pour extra_params.implies_remote — le reste est ignoré. RemoteMode
 * inclut déjà `null`, donc le tuple couvre tout le type sans qu'il faille répéter `| null`
 * dans AdzunaProvenance ci-dessous. */
const REMOTE_MODE_VALUES = ['full', 'hybride', 'ponctuel', 'mention'] as const;

export interface AdzunaProvenance {
  searchOriginInsee: string | null;
  searchRadiusKm: number | null;
  /**
   * Garantie portée par la requête elle-même (ex. what_phrase=full remote) :
   * Adzuna indexe le texte intégral, mais ne renvoie que les 500 premiers
   * caractères de la description (Fait 1). Une offre trouvée par une requête
   * de télétravail EST en télétravail même si ces 500 caractères sont muets
   * à ce sujet ; à l'inverse un texte qui parle explicitement de télétravail —
   * y compris pour le refuser — l'emporte toujours sur cette garantie (voir
   * mapAdzunaOffer) : elle ne comble qu'un silence, jamais une négation.
   */
  impliesRemote: RemoteMode;
}

/** Adzuna a son propre vocabulaire de contrat : on le ramène à celui de France Travail. */
const CONTRACT_MAP: Record<string, string> = {
  permanent: 'CDI',
  contract: 'CDD',
};

interface AdzunaRawOffer {
  id?: string | number;
  title?: string;
  description?: string;
  redirect_url?: string;
  created?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  latitude?: number;
  longitude?: number;
  contract_type?: string;
  contract_time?: string;
  salary_min?: number;
  salary_max?: number;
}

/**
 * Garde de type sur le tuple `as const` : un seul `as` (élargissement du tuple littéral
 * vers `readonly string[]` pour que `.includes` accepte un `string` quelconque), au lieu
 * des deux conversions de l'ancienne version (`REMOTE_MODES as readonly string[]` en
 * entrée ET `raw as RemoteMode` en sortie). Grâce à ce prédicat, TypeScript restreint
 * automatiquement le type de `raw` dans le ternaire de `asRemoteMode` : la valeur de
 * retour n'a plus besoin d'aucune conversion.
 */
function isRemoteModeValue(value: string): value is (typeof REMOTE_MODE_VALUES)[number] {
  return (REMOTE_MODE_VALUES as readonly string[]).includes(value);
}

function asRemoteMode(raw: unknown): RemoteMode {
  return typeof raw === 'string' && isRemoteModeValue(raw) ? raw : null;
}

export function provenanceOf(query: SearchQueryRow): AdzunaProvenance {
  const impliesRemote = asRemoteMode(query.extra_params?.[IMPLIES_REMOTE_KEY]);

  return {
    searchOriginInsee: query.commune_insee,
    searchRadiusKm: query.radius_km,
    impliesRemote,
  };
}

function salaryLabel(min: number | undefined, max: number | undefined): string | null {
  // Comparaison à `null` (présence), pas à la véracité : un salaire de 0 est une valeur
  // reçue, pas une absence — `if (min && max)` l'aurait traitée comme absente.
  if (min != null && max != null) return `${min} - ${max} EUR/an`;
  if (min != null) return `${min} EUR/an`;
  if (max != null) return `jusqu'à ${max} EUR/an`;
  return null;
}

export function mapAdzunaOffer(
  raw: unknown,
  provenance: AdzunaProvenance,
): NormalizedOffer | null {
  if (!raw || typeof raw !== 'object') return null;
  const ad = raw as AdzunaRawOffer;
  if (ad.id === undefined || ad.id === null || !ad.title) return null;

  const offer = emptyOffer('adzuna', String(ad.id), ad.title);

  offer.description = ad.description ?? null;
  offer.company_name = ad.company?.display_name ?? null;
  offer.url = ad.redirect_url ?? null;
  offer.contract_type = ad.contract_type ? CONTRACT_MAP[ad.contract_type] ?? null : null;
  offer.contract_label = ad.contract_time ?? null;
  offer.salary_raw = salaryLabel(ad.salary_min, ad.salary_max);

  offer.city = ad.location?.display_name ?? null;
  offer.latitude = ad.latitude ?? null;
  offer.longitude = ad.longitude ?? null;
  // area est hiérarchique mais de profondeur variable ; on ne se fie à aucun indice fixe
  // (Résolution B) — area contient des NOMS, pas des codes, d'où le passage par _shared/departments.ts.
  offer.department = departmentCodeFromArea(ad.location?.area);

  if (ad.created) {
    const date = new Date(ad.created);
    offer.published_at = Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  // Résolution C : classifieur partagé, jamais un heuristique par sous-chaîne local.
  // Repli sur la garantie de la requête seulement quand le texte est MUET (Fait 1 :
  // Adzuna tronque la description à 500 caractères, la stack et le télétravail sont
  // souvent plus loin) — d'où le `??` et non `||` : un texte explicite l'emporte toujours.
  // classifyRemote rend `null` aussi bien sur un texte muet que sur une négation
  // explicite ("pas de télétravail") : ces deux cas ne doivent PAS être traités pareil,
  // sous peine de ressusciter en 'full' une offre qui refuse le télétravail. hasRemoteNegation
  // distingue les deux : le repli ne s'applique qu'à un vrai silence.
  const text = `${ad.title} ${ad.description ?? ''}`;
  const mode = classifyRemote(text) ?? (hasRemoteNegation(text) ? null : provenance.impliesRemote);
  offer.remote_label = mode;
  offer.is_remote = mode === 'full' || mode === 'hybride';

  offer.search_origin_insee = provenance.searchOriginInsee;
  offer.search_radius_km = provenance.searchRadiusKm;
  offer.raw = raw;

  return offer;
}
