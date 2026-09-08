// Projet Collective.work -> NormalizedOffer.
//
// Le payload est déjà structuré : rien à extraire d'un HTML de présentation,
// seulement la description à convertir en texte. Collective est la seule source
// du projet à porter un champ de télétravail EXPLICITE (workPreferences), mais
// la règle du dépôt ne change pas pour autant : le texte a le dernier mot, le
// champ déclaré ne comble qu'un silence.

import { departmentCodeFromCityName } from '../../_shared/departments.ts';
import { classifyRemote, hasRemoteNegation } from '../../_shared/remote.ts';
import { emptyOffer, type NormalizedOffer } from '../../_shared/types.ts';
import type { RemoteMode } from '../../_shared/remote.ts';
import { htmlToText } from '../_shared/html.ts';

interface CollectiveProject {
  id?: unknown;
  slug?: unknown;
  name?: unknown;
  description?: unknown;
  publishedAt?: unknown;
  budgetBrief?: unknown;
  idealStartDate?: unknown;
  isPermanentContract?: unknown;
  workPreferences?: unknown;
  company?: { name?: unknown };
  location?: { fullNameFrench?: unknown };
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * `workPreferences` est une liste : une mission peut accepter plusieurs modes.
 * On retient le plus favorable au profil, le full remote étant la seule
 * modalité exploitable hors de la zone (voir ROADMAP).
 */
function declaredRemote(value: unknown): RemoteMode {
  if (!Array.isArray(value)) return null;
  if (value.includes('REMOTE')) return 'full';
  if (value.includes('HYBRID')) return 'hybride';
  return null;
}

/** « Aix-en-Provence, France » -> « Aix-en-Provence ». Le pays n'est pas une ville. */
function cityOf(location: CollectiveProject['location']): string | null {
  const full = asText(location?.fullNameFrench);
  if (!full) return null;
  return asText(full.split(',')[0]);
}

export function mapCollectiveOffer(raw: unknown): NormalizedOffer | null {
  if (!raw || typeof raw !== 'object') return null;
  const project = raw as CollectiveProject;

  const id = asText(project.id);
  const title = asText(project.name);
  if (!id || !title) return null;

  const offer = emptyOffer('collective', id, title);

  const description = typeof project.description === 'string'
    ? htmlToText(project.description)
    : null;
  offer.description = description;

  const slug = asText(project.slug);
  offer.url = slug ? `https://www.collective.work/jobs/${slug}` : null;
  offer.company_name = asText(project.company?.name);
  offer.contract_type = project.isPermanentContract === true ? 'CDI' : 'Freelance';
  // Libellé libre côté source, ex. « 450 à 550€ » : rate_raw est fait pour ça.
  offer.rate_raw = asText(project.budgetBrief);
  offer.start_date_raw = asText(project.idealStartDate);

  offer.city = cityOf(project.location);
  offer.department = departmentCodeFromCityName(offer.city);

  if (typeof project.publishedAt === 'string') {
    const date = new Date(project.publishedAt);
    offer.published_at = Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const text = `${title} ${description ?? ''}`;
  const declared = declaredRemote(project.workPreferences);
  const mode = classifyRemote(text) ?? (hasRemoteNegation(text) ? null : declared);
  offer.remote_label = mode;
  offer.is_remote = mode === 'full' || mode === 'hybride';

  offer.raw = raw;
  return offer;
}
