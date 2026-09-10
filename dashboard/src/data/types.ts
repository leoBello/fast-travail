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

/** Ce que rend `GET /work-mode-counts` : TOUJOURS les quatre clés, y compris
 * à zéro. La vue de comptage ne rend que les valeurs présentes ; le serveur
 * complète (voir `getWorkModeCounts`, dashboard-query.ts), pour qu'un mode
 * dont aucune offre ne relève s'affiche « 0 » plutôt que de disparaître du
 * panneau. */
export type WorkModeCounts = Record<WorkModeFilter, number>;

// Même valeur que `STATUT_UNDECIDED` (dashboard-query.ts) : une offre sans
// ligne `offer_applications`, donc `candidature_statut` nul. `in` ne matche
// jamais `null` — c'est ce qui rend l'onglet « À traiter » possible.
export const STATUT_UNDECIDED = 'aucune' as const;
export type StatutFilter = ApplicationStatus | typeof STATUT_UNDECIDED;

/** Ce que rend `GET /statut-counts` : TOUJOURS les huit clefs, y compris à
 * zéro. La vue de comptage ne rend que les valeurs présentes ; le serveur
 * complète (voir `getStatutCounts`, dashboard-query.ts), pour qu'un onglet
 * dont aucune offre ne relève affiche « 0 » plutôt que de disparaître. */
export type StatutCounts = Record<StatutFilter, number>;

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
  /** Tâche 10 : les étiquettes des requêtes qui ont ramené cette offre, et si
   * l'une d'elles est `anchored` — lus sur `offers_ranked`, jamais sur
   * `offers_scored`/`offers_dashboard` (voir CLAUDE.md). `[]`/`false` par
   * défaut plutôt qu'absents : une offre peut n'avoir été trouvée par aucune
   * requête directement (jugée via une autre voie), ce n'est pas une panne. */
  found_by_labels: string[];
  trusted_query: boolean;
}

export interface PageResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Chaque dimension accepte plusieurs valeurs, composées en `OU` par le
 * serveur (tâche 10) — c'est ce qui rend possible « full remote OU non
 * précisé ». Un tableau absent ne restreint rien, comme avant ; un tableau
 * vide n'est jamais construit par ce dashboard — `FilterPanel` omet la clé
 * plutôt que d'envoyer un tableau vide (voir `MatinScreen`).
 */
export interface OffersListFilters {
  sort?: SortField;
  page?: number;
  pageSize?: number;
  statut?: StatutFilter[];
  workMode?: WorkModeFilter[];
  engagement?: Engagement[];
  source?: Source[];
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

/**
 * Un jugement individuel d'`offers_scored` (tâche 8, `getOfferDetail` /
 * `supabase/functions/_shared/dashboard-query.ts`) : une ligne par SOURCE du
 * groupe d'affichage, `offer.id` compris. Miroir de la vue `offers_scored`
 * (migration `20260909040000_remuneration_par_nature_et_plafond_technos.sql`)
 * — mêmes colonnes qu'`OfferDashboardRow` moins `display_key`, `group_size`,
 * `group_sources` et les `candidature_*`, qui n'existent qu'au niveau du
 * GROUPE (`offers_dashboard`), pas d'un jugement pris isolément.
 */
export interface OfferScoredRow {
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
  /** Tâche 10 — voir `OfferDashboardRow.found_by_labels`. */
  found_by_labels: string[];
  trusted_query: boolean;
}

/**
 * `offer_application_state` (migration `20260910000000_offer_applications.sql`) :
 * l'état de candidature déjà PROPAGÉ au groupe d'affichage — `application_offer_id`
 * dit quelle ligne `offer_applications` porte réellement l'état, et `heritee`
 * (`offer_id <> application_offer_id`) dit si cet état vient d'une AUTRE
 * annonce du même groupe que celle affichée. `notes` et `status_changed_at`
 * ne sont délibérément pas sur `offers_dashboard` (une vue de liste n'a pas à
 * porter un champ de texte libre — CLAUDE.md) : ils n'arrivent qu'ici.
 */
export interface OfferApplicationState {
  offer_id: string;
  application_offer_id: string;
  status: ApplicationStatus;
  outcome: ApplicationOutcome | null;
  opened_at: string;
  status_changed_at: string;
  applied_at: string | null;
  last_followup_at: string | null;
  interview_at: string | null;
  notes: string | null;
  heritee: boolean;
}

export interface OfferDetail {
  offer: OfferDashboardRow;
  /** Un jugement par source du groupe, trié confiance décroissante puis
   * `final_score` décroissant (même ordre que `dashboard-query.ts`). Le
   * jugement RETENU n'est pas forcément `[0]` au pixel près de l'ordre
   * d'élection complet d'`offers_dashboard` (qui départage aussi par longueur
   * de description) : le identifier par `id === offer.id` plutôt que par
   * position est plus sûr — voir `TwoSourcesPanel`. */
  groupJudgements: OfferScoredRow[];
  /** `null` si aucune candidature n'a jamais été ouverte pour ce groupe. */
  application: OfferApplicationState | null;
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
  /** Tâche 10 — remplace le compteur `localStorage` de la tâche 7
   * (`decidedStorage.ts`, retiré) : une vérité serveur, comptée sur
   * `status_changed_at` en heure de Paris. */
  decidedToday: number;
}

/** Un profil candidat (`candidate_profile`), tel que `getConfig`/
 * `importCandidateProfile` le projettent côté serveur — miroir de
 * `ActiveProfile` (`dashboard-query.ts`). Toujours NON nul là où le serveur
 * le renvoie réellement ainsi (`ImportCandidateProfileResult.profile`,
 * ci-dessous) : `ConfigResult.activeProfile` est le SEUL endroit où
 * l'absence est un cas réel (aucun profil en base). */
export interface ActiveProfile {
  id: number;
  label: string;
  profileVersion: string;
  seniorityYears: number;
  createdAt: string;
}

/** `GET /config` (tâche 10) : les poids réglables, le profil actif et ses
 * compétences. Remplace `SALAIRE_FLOOR_DUPLIQUE` (`data/format.ts`, retiré) :
 * `scoringWeights.salaire_floor` est la SEULE source du seuil « unité
 * incertaine », lue en direct plutôt que recopiée en dur. */
export interface ConfigResult {
  scoringWeights: Record<string, number>;
  activeProfile: ActiveProfile | null;
  /** Les termes de `profile_skills`, en minuscules — comparés à
   * `extraction.stack` pour distinguer les technos présentes dans le CV
   * (`Detail.dc.html`, « En vert, les N technologies présentes dans votre
   * CV »). */
  cvSkills: string[];
  /** Offres jugées sous un `profile_version` différent de celui du profil
   * actif — 0 si aucun profil actif. */
  staleProfileOfferCount: number;
}

/** `POST /candidate-profile` (tâche 10, l'import du CV). Les quatre champs
 * sont tous obligatoires — un import pose un profil entier, jamais un
 * correctif partiel. */
export interface CandidateProfileInput {
  label: string;
  cvText: string;
  seniorityYears: number;
  profileVersion: string;
}

export interface ImportCandidateProfileResult {
  /** NON nul : `POST /candidate-profile` répond soit `201` avec un profil
   * fraîchement écrit, soit une erreur (4xx/5xx) — jamais un 2xx sans
   * profil (revue de tâche 10 : hérité de `ConfigResult['activeProfile']`
   * avant ce correctif, ça forçait un `??` défensif côté écran pour un cas
   * qui n'arrive pas). */
  profile: ActiveProfile;
  /** Recompté APRÈS l'écriture — voir CLAUDE.md : l'import ne rejuge RIEN,
   * ce nombre dit seulement ce que l'import laisse inchangé. */
  staleProfileOfferCount: number;
}

/**
 * Les quatre états de la collecte et les deux du jugement — miroir de
 * `CollecteStatus` / `JugementStatus` / `RobotStatusResult`
 * (`dashboard-query.ts`), validés par `Etats.dc.html`, planche « L'état des
 * deux robots, quatre cas ».
 *
 * Les horodatages sont BRUTS (ISO) : la mise en forme (« 8 h 30 », « hier »)
 * appartient à la SPA, jamais au module runtime-neutre qui les produit.
 */
export type CollecteStatus =
  | { etat: 'nominal'; at: string }
  | { etat: 'partielle'; at: string; sourcesIncompletes: number; sourcesTotal: number }
  | { etat: 'en_echec'; at: string; derniereReussite: string | null }
  | { etat: 'pas_encore'; derniere: string | null };

export type JugementStatus = { etat: 'fait'; at: string; count: number } | { etat: 'pas_encore' };

export interface RobotStatusResult {
  collecte: CollecteStatus;
  jugement: JugementStatus;
}
