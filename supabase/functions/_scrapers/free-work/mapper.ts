// JSON-LD JobPosting -> NormalizedOffer.
//
// Free-Work est la première source du projet à rendre la description ENTIÈRE
// (mesuré : 577 à 7 752 caractères, médiane 1 176, contre 500 tronqués chez
// Adzuna). Le lexique de compétences y voit donc tout, comme sur France Travail.
// C'est aussi la première à porter un TJM structuré : `rate_raw`, restée nulle
// depuis le début du projet, se remplit enfin.

import { departmentCodeFromCityName } from '../../_shared/departments.ts';
import { classifyRemote, hasRemoteNegation } from '../../_shared/remote.ts';
import { emptyOffer, type NormalizedOffer } from '../../_shared/types.ts';
import { htmlToText } from '../_shared/html.ts';

interface PostalAddress {
  addressLocality?: unknown;
  postalCode?: unknown;
}

interface QuantitativeValue {
  value?: unknown;
  minValue?: unknown;
  maxValue?: unknown;
  unitText?: unknown;
}

interface JobPosting {
  title?: unknown;
  description?: unknown;
  datePosted?: unknown;
  employmentType?: unknown;
  jobLocationType?: unknown;
  hiringOrganization?: { name?: unknown };
  jobLocation?: { address?: PostalAddress };
  baseSalary?: { currency?: unknown; value?: QuantitativeValue };
}

interface RawOffer {
  path?: unknown;
  url?: unknown;
  jobPosting?: unknown;
}

/**
 * `addressLocality` vaut « France » quand l'annonce n'a pas de lieu — c'est le
 * cas typique d'une mission full remote. Ce n'est pas une ville : la stocker
 * comme telle salirait la colonne et ne servirait à personne.
 */
const NOT_A_CITY = new Set(['france']);

/**
 * Vocabulaire schema.org -> vocabulaire du dépôt. CONTRACTOR est testé EN
 * PREMIER parce qu'il cohabite avec FULL_TIME sur les missions freelance :
 * mesuré, 7 des 12 offres échantillonnées portent les deux, et c'est bien de
 * freelance qu'il s'agit.
 */
function contractTypeOf(types: string[]): string | null {
  if (types.includes('CONTRACTOR')) return 'Freelance';
  if (types.includes('TEMPORARY')) return 'CDD';
  if (types.includes('INTERN')) return 'Stage';
  if (types.includes('FULL_TIME') || types.includes('PART_TIME')) return 'CDI';
  return null;
}

function asStringArray(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Libellé lisible d'un montant, ou null. Gère la valeur unique et la fourchette. */
function amountLabel(salary: JobPosting['baseSalary']): { text: string; unit: string } | null {
  const value = salary?.value;
  if (!value) return null;
  const currency = asText(salary?.currency) ?? 'EUR';
  const unit = typeof value.unitText === 'string' ? value.unitText.toUpperCase() : '';

  if (typeof value.value === 'number') return { text: `${value.value} ${currency}`, unit };
  if (typeof value.minValue === 'number' && typeof value.maxValue === 'number') {
    return { text: `${value.minValue} - ${value.maxValue} ${currency}`, unit };
  }
  if (typeof value.minValue === 'number') return { text: `${value.minValue} ${currency}`, unit };
  return null;
}

export function mapFreeWorkOffer(raw: unknown): NormalizedOffer | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as RawOffer;
  if (!candidate.jobPosting || typeof candidate.jobPosting !== 'object') return null;

  const posting = candidate.jobPosting as JobPosting;
  const path = asText(candidate.path);
  const title = asText(posting.title);
  if (!path || !title) return null;

  const offer = emptyOffer('free_work', path, title);

  const description = typeof posting.description === 'string'
    ? htmlToText(posting.description)
    : null;
  offer.description = description;
  offer.url = asText(candidate.url);
  offer.company_name = asText(posting.hiringOrganization?.name);

  const types = asStringArray(posting.employmentType);
  offer.contract_type = contractTypeOf(types);
  offer.contract_label = types.length > 0 ? types.join(', ') : null;

  const amount = amountLabel(posting.baseSalary);
  if (amount) {
    if (amount.unit === 'DAY') offer.rate_raw = `${amount.text}/jour`;
    else if (amount.unit === 'HOUR') offer.rate_raw = `${amount.text}/heure`;
    else if (amount.unit === 'MONTH') offer.salary_raw = `${amount.text}/mois`;
    else if (amount.unit === 'YEAR') offer.salary_raw = `${amount.text}/an`;
    else offer.salary_raw = amount.text;
  }

  const address = posting.jobLocation?.address;
  const locality = asText(address?.addressLocality);
  offer.city = locality && !NOT_A_CITY.has(locality.toLowerCase()) ? locality : null;
  offer.postal_code = asText(address?.postalCode);
  // Le code postal prime ; le nom de commune n'est qu'un repli, et il est
  // souvent le seul disponible (les deux fixtures n'ont aucun code postal).
  offer.department = offer.postal_code?.slice(0, 2) ??
    departmentCodeFromCityName(offer.city);

  if (typeof posting.datePosted === 'string') {
    const date = new Date(posting.datePosted);
    offer.published_at = Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  // Même règle que pour Adzuna : le texte a toujours le dernier mot, et le champ
  // déclaré ne comble qu'un SILENCE, jamais une négation — sans quoi une offre
  // qui refuse le télétravail ressusciterait en 'full'.
  const text = `${title} ${description ?? ''}`;
  const declared = posting.jobLocationType === 'TELECOMMUTE' ? 'full' : null;
  const mode = classifyRemote(text) ?? (hasRemoteNegation(text) ? null : declared);
  offer.remote_label = mode;
  offer.is_remote = mode === 'full' || mode === 'hybride';

  offer.raw = raw;
  return offer;
}
