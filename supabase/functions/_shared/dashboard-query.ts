import type { DbClient } from './db.ts';

/**
 * Runtime-neutre : aucun accès à l'espace de noms global du runtime, aucune
 * lecture d'environnement directe. Le client de base (`DbClient`) et tous les
 * paramètres arrivent en argument — voir CLAUDE.md, section « Frontières
 * d'architecture ».
 *
 * Ce fichier construit les lectures et les écritures pour le tableau de
 * bord. Il ne connaît rien du HTTP : `dashboard-api.ts` traduit ses résultats
 * (et ses erreurs) en réponses. `ValidationError` est la seule exception que
 * ce fichier lève délibérément — elle porte une règle métier violée (les
 * mêmes contraintes que celles de la migration `offer_applications`), pas
 * une panne technique.
 */
export class ValidationError extends Error {}

// Les mêmes énumérations que les contraintes `check` de la migration
// `20260910000000_offer_applications.sql`. Toute divergence entre les deux
// laisserait passer un 400 ici et un rejet SQL derrière, ou l'inverse.
export const APPLICATION_STATUSES = [
  'a_traiter',
  'retenue',
  'postulee',
  'relancee',
  'entretien',
  'terminee',
  'ecartee',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_OUTCOMES = [
  'offre_recue',
  'refus',
  'sans_reponse',
  'desistement',
] as const;
export type ApplicationOutcome = (typeof APPLICATION_OUTCOMES)[number];

/** Les statuts qui exigent `applied_at` — miroir de la contrainte SQL. */
const STATUSES_REQUIRING_APPLIED_AT: ReadonlySet<ApplicationStatus> = new Set([
  'postulee',
  'relancee',
  'entretien',
  'terminee',
]);

// Enumérations de `OfferExtraction` (scoring-types.ts), reprises ici pour
// valider les filtres de lecture. `domain` est volontairement absent : 960
// valeurs distinctes sur 1 269 lignes, aucun filtre ne s'y prête (voir le
// plan de la tâche 7).
export const WORK_MODES = ['full_remote', 'hybride', 'sur_site'] as const;
export type WorkMode = (typeof WORK_MODES)[number];
/** Valeur de filtre supplémentaire : `work_mode IS NULL`, jamais un silence. */
export const WORK_MODE_UNSPECIFIED = 'non_precise';
export type WorkModeFilter = WorkMode | typeof WORK_MODE_UNSPECIFIED;

export const ENGAGEMENTS = ['freelance', 'cdi', 'cdd', 'autre'] as const;
export type Engagement = (typeof ENGAGEMENTS)[number];

export const SOURCES = ['france_travail', 'adzuna', 'free_work', 'collective'] as const;
export type Source = (typeof SOURCES)[number];

// Liste fermée de tri. Ce sont les noms de colonnes d'`offers_dashboard`, pas
// le vocabulaire d'écran (« rang », « correspondance ») : celui-ci est un
// choix d'i18n qui appartient à la SPA, pas au contrat de l'API.
export const SORT_FIELDS = ['final_score', 'fit_score', 'published_at'] as const;
export type SortField = (typeof SORT_FIELDS)[number];

/** Le seuil du brief du jour. Ne vaut QUE pour `/brief` — la liste complète
 * (`listOffers`) ne masque jamais rien en dessous. */
export const BRIEF_THRESHOLD = 50;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type Row = Record<string, unknown>;

export interface OffersListFilters {
  sort: SortField;
  page: number;
  pageSize: number;
  statut?: ApplicationStatus;
  workMode?: WorkModeFilter;
  engagement?: Engagement;
  source?: Source;
  agenticAi?: boolean;
  /** `final_score >= minScore`. Borné 0-100 par l'appelant. */
  minScore?: number;
}

export interface PageResult {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
}

function pageRange(page: number, pageSize: number): [number, number] {
  const from = (page - 1) * pageSize;
  return [from, from + pageSize - 1];
}

/**
 * `GET /offers` : la liste complète, rien de masqué. Les filtres sont tous
 * optionnels ; absents, ils ne restreignent rien.
 */
export async function listOffers(db: DbClient, filters: OffersListFilters): Promise<PageResult> {
  const [from, to] = pageRange(filters.page, filters.pageSize);

  let query = db.from('offers_dashboard').select('*', { count: 'exact' });

  if (filters.statut !== undefined) query = query.eq('candidature_statut', filters.statut);
  if (filters.engagement !== undefined) query = query.eq('engagement', filters.engagement);
  if (filters.source !== undefined) query = query.eq('source', filters.source);
  if (filters.agenticAi !== undefined) query = query.eq('agentic_ai', filters.agenticAi);
  if (filters.minScore !== undefined) query = query.gte('final_score', filters.minScore);
  if (filters.workMode === WORK_MODE_UNSPECIFIED) {
    query = query.is('work_mode', null);
  } else if (filters.workMode !== undefined) {
    query = query.eq('work_mode', filters.workMode);
  }

  query = query
    .order(filters.sort, { ascending: false, nullsFirst: false })
    .order('id', { ascending: true })
    .range(from, to);

  const { data, error, count } = await query;
  if (error) throw new Error(`lecture des offres : ${error.message}`);
  return {
    rows: (data ?? []) as Row[],
    total: count ?? 0,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

export interface Pagination {
  page: number;
  pageSize: number;
}

/**
 * `GET /brief` : au-dessus du seuil, sans décision enregistrée. « Sans
 * décision » veut dire qu'aucune ligne `offer_applications` n'existe encore
 * pour le groupe — dès qu'une existe (même `a_traiter`), l'offre est traitée
 * et sort du brief.
 */
export async function listBrief(db: DbClient, pagination: Pagination): Promise<PageResult> {
  const [from, to] = pageRange(pagination.page, pagination.pageSize);

  const { data, error, count } = await db
    .from('offers_dashboard')
    .select('*', { count: 'exact' })
    .gt('final_score', BRIEF_THRESHOLD)
    .is('candidature_statut', null)
    .order('final_score', { ascending: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: true })
    .range(from, to);

  if (error) throw new Error(`lecture du brief : ${error.message}`);
  return {
    rows: (data ?? []) as Row[],
    total: count ?? 0,
    page: pagination.page,
    pageSize: pagination.pageSize,
  };
}

const CONFIDENCE_RANK: Record<string, number> = { haute: 0, moyenne: 1, basse: 2 };

export interface OfferDetail {
  offer: Row;
  /** Un jugement par source du même groupe d'affichage, `offer.id` compris.
   * Trié confiance décroissante puis `final_score` décroissant — le même
   * ordre d'élection que la vue, pour que « retenu » corresponde toujours au
   * premier élément. */
  groupJudgements: Row[];
  /** `null` si aucune candidature n'a jamais été ouverte pour ce groupe. */
  application: Row | null;
}

/**
 * `GET /offers/:id` : le détail, avec les jugements de tout le groupe.
 *
 * `offers_dashboard` ne porte qu'UN représentant par groupe — les autres
 * jugements viennent d'une lecture séparée d'`offers_scored`, jointe via
 * `offer_display_groups`. `notes`, `status_changed_at` et
 * `application_offer_id` ne sont pas sur `offers_dashboard` (délibéré, voir
 * la revue de la tâche 5) : ils viennent d'`offer_application_state`, la vue
 * qui lit `offer_applications` en propageant l'état au groupe.
 */
export async function getOfferDetail(db: DbClient, id: string): Promise<OfferDetail | null> {
  const { data: offer, error: offerError } = await db
    .from('offers_dashboard')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (offerError) throw new Error(`lecture de l'offre : ${offerError.message}`);
  if (!offer) return null;

  const offerRow = offer as Row;
  const displayKey = offerRow.display_key as string;

  const { data: groupIdRows, error: groupError } = await db
    .from('offer_display_groups')
    .select('offer_id')
    .eq('display_key', displayKey);
  if (groupError) throw new Error(`lecture du groupe d'affichage : ${groupError.message}`);
  const groupIds = ((groupIdRows ?? []) as { offer_id: string }[]).map((row) => row.offer_id);

  const { data: judgementRows, error: judgementError } = await db
    .from('offers_scored')
    .select('*')
    .in('id', groupIds.length > 0 ? groupIds : [id]);
  if (judgementError) {
    throw new Error(`lecture des jugements du groupe : ${judgementError.message}`);
  }

  const groupJudgements = ((judgementRows ?? []) as Row[]).slice().sort((a, b) => {
    const rankA = CONFIDENCE_RANK[String(a.confidence)] ?? 3;
    const rankB = CONFIDENCE_RANK[String(b.confidence)] ?? 3;
    if (rankA !== rankB) return rankA - rankB;
    return (Number(b.final_score) || 0) - (Number(a.final_score) || 0);
  });

  const { data: applicationState, error: applicationError } = await db
    .from('offer_application_state')
    .select('*')
    .eq('offer_id', id)
    .maybeSingle();
  if (applicationError) {
    throw new Error(`lecture de l'état de candidature : ${applicationError.message}`);
  }

  return {
    offer: offerRow,
    groupJudgements,
    application: (applicationState as Row | null) ?? null,
  };
}

export type OpenOfferResult =
  | { outcome: 'offer_not_found' }
  | { outcome: 'created'; row: Row }
  | { outcome: 'already_open'; row: Row };

/** `POST /offers/:id/open` : crée la ligne `a_traiter` si absente. Cible
 * directement `:id` — la table n'est pas group-aware par construction (voir
 * la tâche 1) ; c'est `getOfferDetail`/`offer_application_state` qui portent
 * la propagation au groupe pour la LECTURE. */
export async function openOffer(db: DbClient, offerId: string): Promise<OpenOfferResult> {
  const { data: offerRow, error: offerError } = await db
    .from('offers')
    .select('id')
    .eq('id', offerId)
    .maybeSingle();
  if (offerError) throw new Error(`vérification de l'offre : ${offerError.message}`);
  if (!offerRow) return { outcome: 'offer_not_found' };

  const { data: existing, error: existingError } = await db
    .from('offer_applications')
    .select('*')
    .eq('offer_id', offerId)
    .maybeSingle();
  if (existingError) throw new Error(`lecture de la candidature : ${existingError.message}`);
  if (existing) return { outcome: 'already_open', row: existing as Row };

  const { data: inserted, error: insertError } = await db
    .from('offer_applications')
    .insert({ offer_id: offerId })
    .select()
    .single();
  if (insertError) throw new Error(`création de la candidature : ${insertError.message}`);
  return { outcome: 'created', row: inserted as Row };
}

/** Champs acceptés par `PATCH /offers/:id/application`. `undefined` = pas
 * touché par cette requête ; `null` (pour les champs qui l'acceptent) =
 * effacer explicitement. */
export interface ApplicationPatchInput {
  status?: ApplicationStatus;
  outcome?: ApplicationOutcome | null;
  appliedAt?: string | null;
  lastFollowupAt?: string | null;
  interviewAt?: string | null;
  notes?: string | null;
}

export type PatchApplicationResult = { outcome: 'not_found' } | { outcome: 'updated'; row: Row };

/**
 * `PATCH /offers/:id/application`. Revalide les mêmes règles que les
 * contraintes `check` de la migration AVANT d'écrire, pour rendre un 400
 * explicite plutôt que de laisser Postgres refuser l'update tel quel :
 *
 * - une issue ne qualifie qu'une candidature dont le statut EFFECTIF (après
 *   cette requête) est `terminee` ;
 * - un statut parmi postulee/relancee/entretien/terminee exige une date
 *   d'envoi EFFECTIVE (fournie par cette requête, ou déjà en base).
 *
 * Exige que la ligne existe déjà — `POST /offers/:id/open` la crée si elle
 * est absente. Ne pas fusionner les deux : l'ouverture et la mise à jour
 * sont deux actions distinctes du tableau de bord.
 */
export async function patchApplication(
  db: DbClient,
  offerId: string,
  patch: ApplicationPatchInput,
): Promise<PatchApplicationResult> {
  const { data: current, error: currentError } = await db
    .from('offer_applications')
    .select('*')
    .eq('offer_id', offerId)
    .maybeSingle();
  if (currentError) throw new Error(`lecture de la candidature : ${currentError.message}`);
  if (!current) return { outcome: 'not_found' };

  const currentRow = current as Row;
  const effectiveStatus: ApplicationStatus = patch.status ??
    (currentRow.status as ApplicationStatus);
  const effectiveOutcome: ApplicationOutcome | null = 'outcome' in patch
    ? (patch.outcome ?? null)
    : ((currentRow.outcome as ApplicationOutcome | null) ?? null);
  const effectiveAppliedAt: string | null = 'appliedAt' in patch
    ? (patch.appliedAt ?? null)
    : ((currentRow.applied_at as string | null) ?? null);

  if (effectiveOutcome !== null && effectiveStatus !== 'terminee') {
    throw new ValidationError(
      `"outcome" ne peut être renseigné que pour une candidature au statut "terminee" ` +
        `(statut effectif : "${effectiveStatus}")`,
    );
  }
  if (STATUSES_REQUIRING_APPLIED_AT.has(effectiveStatus) && !effectiveAppliedAt) {
    throw new ValidationError(
      `"appliedAt" est requis pour le statut "${effectiveStatus}" (absent, et absent en base)`,
    );
  }

  const update: Row = {};
  if (patch.status !== undefined) {
    update.status = patch.status;
    update.status_changed_at = new Date().toISOString();
  }
  if ('outcome' in patch) update.outcome = patch.outcome;
  if ('appliedAt' in patch) update.applied_at = patch.appliedAt;
  if ('lastFollowupAt' in patch) update.last_followup_at = patch.lastFollowupAt;
  if ('interviewAt' in patch) update.interview_at = patch.interviewAt;
  if ('notes' in patch) update.notes = patch.notes;

  if (Object.keys(update).length === 0) {
    throw new ValidationError('aucun champ à mettre à jour dans le corps de la requête');
  }

  const { data: updated, error: updateError } = await db
    .from('offer_applications')
    .update(update)
    .eq('offer_id', offerId)
    .select()
    .single();
  if (updateError) throw new Error(`mise à jour de la candidature : ${updateError.message}`);
  return { outcome: 'updated', row: updated as Row };
}

export interface StatsResult {
  /** Les trois premiers comptés en base ; les deux derniers viennent des
   * décisions et valent 0 tant qu'aucune n'a été prise — jamais masqués
   * (GUIDELINES.md §3.3). */
  funnel: {
    collected: number;
    scored: number;
    aboveThreshold: number;
    retained: number;
    applied: number;
  };
  byStatus: Record<ApplicationStatus, number>;
  streak: { days: number; recentDays: { date: string; sent: boolean }[] };
  /** Offres au-dessus du seuil sans ligne `offer_applications` — même
   * requête que `/brief`, comptée plutôt que listée. */
  neverOpened: number;
  responseRate: { responses: number; sent: number };
}

async function countExact(db: DbClient, table: string): Promise<number> {
  const { count, error } = await db.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`comptage de ${table} : ${error.message}`);
  return count ?? 0;
}

const RECENT_DAYS_WINDOW = 7;

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Jours avec au moins une candidature ENVOYÉE (`applied_at`), jamais lue
 * (GUIDELINES.md §3.3 : lire des offres ne maintient pas la série). Le jour
 * courant sans envoi ne casse pas la série — il n'est simplement pas encore
 * compté, comme un jeu qui n'a pas encore été joué aujourd'hui. */
export function computeStreak(
  sentDays: ReadonlySet<string>,
  today: Date = new Date(),
): { days: number; recentDays: { date: string; sent: boolean }[] } {
  const recentDays: { date: string; sent: boolean }[] = [];
  for (let i = RECENT_DAYS_WINDOW - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = toDateOnly(d);
    recentDays.push({ date: iso, sent: sentDays.has(iso) });
  }

  const cursor = new Date(today);
  if (!sentDays.has(toDateOnly(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let days = 0;
  while (sentDays.has(toDateOnly(cursor))) {
    days += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return { days, recentDays };
}

/** `GET /stats` : entonnoir, série, compteur anti-perte. */
export async function getStats(db: DbClient): Promise<StatsResult> {
  const collected = await countExact(db, 'offers');
  const scored = await countExact(db, 'offers_scored');

  const { count: aboveThresholdCount, error: aboveThresholdError } = await db
    .from('offers_scored')
    .select('*', { count: 'exact', head: true })
    .gt('final_score', BRIEF_THRESHOLD);
  if (aboveThresholdError) {
    throw new Error(`comptage au-dessus du seuil : ${aboveThresholdError.message}`);
  }

  const { count: neverOpenedCount, error: neverOpenedError } = await db
    .from('offers_dashboard')
    .select('*', { count: 'exact', head: true })
    .gt('final_score', BRIEF_THRESHOLD)
    .is('candidature_statut', null);
  if (neverOpenedError) throw new Error(`comptage anti-perte : ${neverOpenedError.message}`);

  const { data: appRows, error: appError } = await db
    .from('offer_applications')
    .select('status, outcome, applied_at');
  if (appError) throw new Error(`lecture des candidatures : ${appError.message}`);

  const applications = (appRows ?? []) as {
    status: string;
    outcome: string | null;
    applied_at: string | null;
  }[];

  const byStatus = Object.fromEntries(
    APPLICATION_STATUSES.map((status) => [status, 0]),
  ) as Record<ApplicationStatus, number>;
  let responses = 0;
  let sent = 0;
  const sentDays = new Set<string>();
  for (const app of applications) {
    if (app.status in byStatus) byStatus[app.status as ApplicationStatus] += 1;
    if (app.outcome) responses += 1;
    if (app.applied_at) {
      sent += 1;
      sentDays.add(app.applied_at.slice(0, 10));
    }
  }

  return {
    funnel: {
      collected,
      scored,
      aboveThreshold: aboveThresholdCount ?? 0,
      retained: byStatus.retenue,
      applied: byStatus.postulee,
    },
    byStatus,
    streak: computeStreak(sentDays),
    neverOpened: neverOpenedCount ?? 0,
    responseRate: { responses, sent },
  };
}
