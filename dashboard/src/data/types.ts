/**
 * Les formes de données que rend `api-dashboard` (tâche 6,
 * `supabase/functions/_shared/dashboard-query.ts` /
 * `supabase/functions/_shared/dashboard-api.ts`) et sur lesquelles ce
 * dashboard lit et écrit.
 *
 * Redéfinies ici plutôt qu'importées, comme `i18n/domaine.ts` le fait déjà
 * pour le même motif : le dashboard est un projet Node distinct de
 * l'exécution Deno des Edge Functions (CLAUDE.md, frontières
 * d'architecture). Chaque énumération porte, en commentaire, le fichier
 * source dont elle doit rester le miroir.
 */

// Mêmes valeurs que `APPLICATION_STATUSES` (dashboard-query.ts), miroir de
// la contrainte `offer_applications_status_connu`.
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

// Mêmes valeurs que `APPLICATION_OUTCOMES` (dashboard-query.ts).
export const APPLICATION_OUTCOMES = [
  'offre_recue',
  'refus',
  'sans_reponse',
  'desistement',
] as const;
export type ApplicationOutcome = (typeof APPLICATION_OUTCOMES)[number];

// Mêmes valeurs que `WORK_MODES` / `WORK_MODE_UNSPECIFIED` (dashboard-query.ts).
// `domain` reste volontairement absent (960 valeurs distinctes sur 1 269
// lignes) : aucun filtre ne s'y prête (task-7-brief.md).
export const WORK_MODES = ['full_remote', 'hybride', 'sur_site'] as const;
export type WorkMode = (typeof WORK_MODES)[number];
export const WORK_MODE_UNSPECIFIED = 'non_precise' as const;
export type WorkModeFilter = WorkMode | typeof WORK_MODE_UNSPECIFIED;

// Mêmes valeurs que `ENGAGEMENTS` (dashboard-query.ts).
export const ENGAGEMENTS = ['freelance', 'cdi', 'cdd', 'autre'] as const;
export type Engagement = (typeof ENGAGEMENTS)[number];

// Mêmes valeurs que `SOURCES` (dashboard-query.ts).
export const SOURCES = ['france_travail', 'adzuna', 'free_work', 'collective'] as const;
export type Source = (typeof SOURCES)[number];

// Mêmes valeurs que `SORT_FIELDS` (dashboard-query.ts) — noms de colonnes,
// pas le vocabulaire d'écran (« rang », « correspondance »), qui reste un
// choix d'i18n propre à cette SPA.
export const SORT_FIELDS = ['final_score', 'fit_score', 'published_at'] as const;
export type SortField = (typeof SORT_FIELDS)[number];

// Même valeur que `BRIEF_THRESHOLD` (dashboard-query.ts). Ne vaut QUE pour
// la bande « Ce matin » — la liste complète ne masque jamais rien en dessous.
export const BRIEF_THRESHOLD = 50;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type Seniority = 'junior' | 'confirme' | 'senior' | 'lead' | null;
export type CompensationKind = 'tjm' | 'salaire' | null;

/** `OfferExtraction` (scoring-types.ts) — le jugement brut du modèle. */
export interface OfferExtraction {
  stack: string[];
  seniority: Seniority;
  work_mode: WorkMode | null;
  engagement: Engagement | null;
  duration_months: number | null;
  compensation_kind: CompensationKind;
  compensation_min: number | null;
  compensation_max: number | null;
  agentic_ai: boolean;
  unwanted_tech: string[];
  domain: string | null;
  confidence: 'haute' | 'moyenne' | 'basse';
}

/**
 * Une ligne d'`offers_dashboard` (migration `20260910010000_offers_dashboard.sql`) :
 * un représentant par groupe de doublons, avec l'état de candidature du
 * groupe déjà propagé (colonnes `candidature_*`).
 */
export interface OfferDashboardRow {
  id: string;
  source: Source;
  title: string | null;
  company_name: string | null;
  city: string | null;
  department: string | null;
  url: string | null;
  published_at: string | null;
  fit_score: number;
  verdict: string;
  engagement: Engagement | null;
  work_mode: WorkMode | null;
  seniority: Seniority;
  domain: string | null;
  confidence: 'haute' | 'moyenne' | 'basse';
  agentic_ai: boolean;
  duration_months: number | null;
  compensation_kind: CompensationKind;
  compensation_min: number | null;
  compensation_max: number | null;
  unwanted_count: number;
  truncated_input: boolean;
  age_days: number;
  extraction: OfferExtraction;
  bonus_engagement: number;
  bonus_remote: number;
  bonus_remuneration: number;
  bonus_duree: number;
  bonus_agentique: number;
  malus_technos: number;
  malus_fraicheur: number;
  final_score: number;
  display_key: string;
  group_size: number;
  group_sources: Source[];
  candidature_statut: ApplicationStatus | null;
  candidature_issue: ApplicationOutcome | null;
  candidature_ouverte_le: string | null;
  candidature_envoyee_le: string | null;
  candidature_relancee_le: string | null;
  candidature_entretien_le: string | null;
  candidature_heritee: boolean | null;
}

export interface PageResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OffersListFilters {
  sort?: SortField;
  page?: number;
  pageSize?: number;
  statut?: ApplicationStatus;
  workMode?: WorkModeFilter;
  engagement?: Engagement;
  source?: Source;
  agenticAi?: boolean;
  minScore?: number;
}

export interface Pagination {
  page?: number;
  pageSize?: number;
}

export interface ApplicationRow {
  offer_id: string;
  status: ApplicationStatus;
  outcome: ApplicationOutcome | null;
  opened_at: string;
  status_changed_at: string;
  applied_at: string | null;
  last_followup_at: string | null;
  interview_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface OfferDetail {
  offer: OfferDashboardRow;
  groupJudgements: Record<string, unknown>[];
  application: (Record<string, unknown> & { offer_id: string }) | null;
}

export interface ApplicationPatchInput {
  status?: ApplicationStatus;
  outcome?: ApplicationOutcome | null;
  appliedAt?: string | null;
  lastFollowupAt?: string | null;
  interviewAt?: string | null;
  notes?: string | null;
}

export interface StatsResult {
  funnel: {
    collected: number;
    scored: number;
    aboveThreshold: number;
    retained: number;
    applied: number;
  };
  byStatus: Record<ApplicationStatus, number>;
  streak: { days: number; recentDays: { date: string; sent: boolean }[] };
  neverOpened: number;
  responseRate: { responses: number; sent: number };
}
