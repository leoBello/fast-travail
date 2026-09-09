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
/** Plafond de `page`, au même titre que `MAX_PAGE_SIZE` pour `pageSize` —
 * sans lui, une valeur qui dépasse la précision d'un nombre JS (`Number()`
 * sur une chaîne de centaines de chiffres rend `Infinity`) passe la validation
 * de type (`>= min` est vrai pour `Infinity`) et atteint `range()` telle
 * quelle. Bornée, comme `pageSize` — pas rejetée : voir la revue de la
 * tâche 6. */
export const MAX_PAGE = 100_000;

export type Row = Record<string, unknown>;

/**
 * Chaque dimension accepte désormais PLUSIEURS valeurs, composées en `OU` —
 * tâche 10 : c'est ce qui rend possible « full remote OU non précisé »,
 * la requête réellement utile puisque `work_mode` est nul sur 863 offres
 * (68 % du corpus, GUIDELINES §3.2). Un tableau vide n'est jamais construit
 * par l'appelant (`dashboard-api.ts` rend `undefined` quand le paramètre est
 * absent) : `listOffers` traite « présent mais vide » et « absent » de la
 * même façon (aucune restriction), par simplicité, mais ce cas ne se
 * produit jamais en pratique via l'API HTTP.
 */
export interface OffersListFilters {
  sort: SortField;
  page: number;
  pageSize: number;
  statut?: ApplicationStatus[];
  workMode?: WorkModeFilter[];
  engagement?: Engagement[];
  source?: Source[];
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

  if (filters.statut !== undefined && filters.statut.length > 0) {
    query = query.in('candidature_statut', filters.statut);
  }
  if (filters.engagement !== undefined && filters.engagement.length > 0) {
    query = query.in('engagement', filters.engagement);
  }
  if (filters.source !== undefined && filters.source.length > 0) {
    query = query.in('source', filters.source);
  }
  if (filters.agenticAi !== undefined) query = query.eq('agentic_ai', filters.agenticAi);
  if (filters.minScore !== undefined) query = query.gte('final_score', filters.minScore);
  if (filters.workMode !== undefined && filters.workMode.length > 0) {
    const contientNonPrecise = filters.workMode.includes(WORK_MODE_UNSPECIFIED);
    const valeursConnues = filters.workMode.filter(
      (v): v is WorkMode => v !== WORK_MODE_UNSPECIFIED,
    );
    if (contientNonPrecise && valeursConnues.length > 0) {
      // `OU` entre « non précisé » (work_mode NULL) et une ou plusieurs
      // valeurs connues : c'est la requête que la tâche 10 rend possible.
      // Syntaxe PostgREST du filtre composé — voir `.or()` de supabase-js.
      query = query.or(`work_mode.is.null,work_mode.in.(${valeursConnues.join(',')})`);
    } else if (contientNonPrecise) {
      query = query.is('work_mode', null);
    } else {
      query = query.in('work_mode', valeursConnues);
    }
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

/** Les quatre valeurs de `work_mode` chiffrées : les trois connues, plus
 * « non précisé » que GUIDELINES §3.2 interdit de masquer. Toujours les
 * QUATRE clés, y compris à zéro. */
export type WorkModeCounts = Record<WorkModeFilter, number>;

/**
 * `GET /work-mode-counts` : un seul balayage pour les quatre nombres.
 *
 * Remplace quatre appels `GET /offers?workMode=…&pageSize=1` dont seul le
 * `total` était lu. Le gain n'est pas de trois requêtes HTTP mais de trois
 * balayages du corpus : le coût d'une lecture d'`offers_dashboard` ne dépend
 * PAS de `pageSize` — ni le `distinct on` ni les fonctions de fenêtrage ne
 * laissent descendre un filtre, donc la vue est intégralement matérialisée
 * avant que `work_mode` ne retienne quoi que ce soit (mesuré : `pageSize=1`
 * coûtait autant que la page complète).
 *
 * La vue ne rend que les valeurs PRÉSENTES ; les absentes sont complétées à
 * zéro ici, jamais laissées manquantes. Un mode de travail dont aucune offre
 * ne relève doit s'afficher « 0 » dans le panneau, pas disparaître — c'est la
 * même règle qu'ailleurs dans ce tableau : un vide se nomme.
 */
export async function getWorkModeCounts(db: DbClient): Promise<WorkModeCounts> {
  const { data, error } = await db
    .from('offers_dashboard_work_mode_counts')
    .select('work_mode, total');
  if (error) throw new Error(`comptage par mode de travail : ${error.message}`);

  const counts = Object.fromEntries(
    [...WORK_MODES, WORK_MODE_UNSPECIFIED].map((mode) => [mode, 0]),
  ) as WorkModeCounts;
  for (const row of (data ?? []) as { work_mode: string; total: number | string }[]) {
    // Une valeur que la vue rendrait sans que le code la connaisse est
    // ignorée plutôt qu'ajoutée : le contrat de sortie est fermé sur les
    // quatre clés, et une cinquième ferait mentir le type sans que rien ne le
    // signale.
    if (row.work_mode in counts) counts[row.work_mode as WorkModeFilter] = Number(row.total);
  }
  return counts;
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

  // `found_by_labels`/`trusted_query` (tâche 10, section « Trouvée par » du
  // détail) vivent sur `offers_ranked`, pas sur `offers_scored` — voir
  // CLAUDE.md. Lues ICI, filtrées sur les quelques ids du GROUPE
  // (`.in('id', groupIds)`), jamais sur la liste complète : c'est ce filtre
  // qui garde le coût négligeable — mesuré au rapport de tâche — à la
  // différence d'une lecture d'`offers_ranked` sans filtre, qui répète le
  // balayage lexical (`offer_lexical_score`) sur tout le corpus et coûte ce
  // qu'`offers_shortlist` coûte déjà (~0,76 s, CLAUDE.md).
  const provenanceIds = groupIds.length > 0 ? groupIds : [id];
  const { data: provenanceRows, error: provenanceError } = await db
    .from('offers_ranked')
    .select('id, found_by_labels, trusted_query')
    .in('id', provenanceIds);
  if (provenanceError) {
    throw new Error(`lecture de la provenance : ${provenanceError.message}`);
  }
  const provenanceById = new Map(
    ((provenanceRows ?? []) as Row[]).map((row) => [row.id as string, row]),
  );
  function avecProvenance(row: Row): Row {
    const provenance = provenanceById.get(row.id as string);
    return {
      ...row,
      found_by_labels: (provenance?.found_by_labels as string[] | undefined) ?? [],
      trusted_query: (provenance?.trusted_query as boolean | undefined) ?? false,
    };
  }

  const { data: applicationState, error: applicationError } = await db
    .from('offer_application_state')
    .select('*')
    .eq('offer_id', id)
    .maybeSingle();
  if (applicationError) {
    throw new Error(`lecture de l'état de candidature : ${applicationError.message}`);
  }

  return {
    offer: avecProvenance(offerRow),
    groupJudgements: groupJudgements.map(avecProvenance),
    application: (applicationState as Row | null) ?? null,
  };
}

export type OpenOfferResult =
  | { outcome: 'offer_not_found' }
  | { outcome: 'created'; row: Row }
  | { outcome: 'already_open'; row: Row };

/** Résout l'`offer_id` qui porte réellement la candidature du GROUPE
 * d'affichage auquel `offerId` appartient, via `offer_application_state`
 * (jointure `INNER` : pas de ligne du tout si personne dans le groupe n'a de
 * candidature). `null` si le groupe n'a encore aucune candidature nulle
 * part.
 *
 * Existe pour que `openOffer` et `patchApplication` n'écrivent JAMAIS sur
 * l'id littéral de l'URL sans avoir d'abord vérifié que le groupe n'a pas
 * déjà sa candidature ailleurs — voir la revue de la tâche 6 : sans cette
 * résolution, agir sur un id qui n'est plus l'élu du groupe (l'élection
 * change, voir `offers_dashboard`) crée une SECONDE ligne plus fraîche, que
 * `offer_application_state` se met alors à préférer pour tout le groupe :
 * l'état affiché RÉGRESSE en silence (ex. `entretien` → `a_traiter`). */
async function resolveGroupApplicationOfferId(
  db: DbClient,
  offerId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from('offer_application_state')
    .select('application_offer_id')
    .eq('offer_id', offerId)
    .maybeSingle();
  if (error) throw new Error(`lecture de l'état du groupe : ${error.message}`);
  return (data as { application_offer_id: string } | null)?.application_offer_id ?? null;
}

/** `POST /offers/:id/open` : crée la ligne `a_traiter` si le GROUPE n'a
 * encore aucune candidature nulle part — pas seulement `:id`. Une candidature
 * déjà ouverte sur une autre offre du même groupe (l'élection a pu bouger
 * depuis) compte comme déjà ouverte ; ne rien créer de plus, sous peine de
 * doublon (voir `resolveGroupApplicationOfferId`). */
export async function openOffer(db: DbClient, offerId: string): Promise<OpenOfferResult> {
  const { data: offerRow, error: offerError } = await db
    .from('offers')
    .select('id')
    .eq('id', offerId)
    .maybeSingle();
  if (offerError) throw new Error(`vérification de l'offre : ${offerError.message}`);
  if (!offerRow) return { outcome: 'offer_not_found' };

  const existingId = await resolveGroupApplicationOfferId(db, offerId);
  if (existingId) {
    const { data: existing, error: existingError } = await db
      .from('offer_applications')
      .select('*')
      .eq('offer_id', existingId)
      .single();
    if (existingError) throw new Error(`lecture de la candidature : ${existingError.message}`);
    return { outcome: 'already_open', row: existing as Row };
  }

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
 *
 * **Group-aware** : écrit sur la ligne qui porte RÉELLEMENT la candidature du
 * groupe (`offer_application_state.application_offer_id`), jamais sur l'id
 * littéral de l'URL si celui-ci n'est plus l'élu du groupe. Sans ça, un
 * `PATCH` sur une offre qui vient de perdre l'élection rendrait 404 (« aucune
 * candidature ») alors que le `GET` venait de montrer un état existant —
 * poussant l'utilisateur vers `POST /open`, qui créerait alors une seconde
 * ligne plus fraîche et ferait régresser tout le groupe (voir la revue de la
 * tâche 6 et `resolveGroupApplicationOfferId`).
 */
export async function patchApplication(
  db: DbClient,
  offerId: string,
  patch: ApplicationPatchInput,
): Promise<PatchApplicationResult> {
  const targetId = await resolveGroupApplicationOfferId(db, offerId);
  if (!targetId) return { outcome: 'not_found' };

  const { data: current, error: currentError } = await db
    .from('offer_applications')
    .select('*')
    .eq('offer_id', targetId)
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
    // Seulement sur une VRAIE transition. `offer_application_state` élit la
    // candidature la plus fraîche du groupe par `status_changed_at desc` : le
    // bouger sur un statut inchangé agrandirait sans raison la fenêtre
    // pendant laquelle un id périmé (voir `resolveGroupApplicationOfferId`)
    // pourrait sembler plus « à jour » qu'il ne l'est. Revu par la tâche 6.
    if (patch.status !== currentRow.status) {
      update.status_changed_at = new Date().toISOString();
    }
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
    .eq('offer_id', targetId)
    .select()
    .single();
  if (updateError) throw new Error(`mise à jour de la candidature : ${updateError.message}`);
  return { outcome: 'updated', row: updated as Row };
}

/**
 * Les statuts qui comptent comme « au moins retenue » — l'étage `retained`
 * de l'entonnoir. `retenue` est le premier échelon du pipeline séquentiel
 * (`SuiviSection.PIPELINE`, `dashboard/`) : l'interface ne fait avancer
 * qu'un cran à la fois, jamais de saut, donc un statut plus avancé implique
 * d'avoir été `retenue` au passage. Exclut `a_traiter` (jamais décidée) et
 * `ecartee` (sortie possible à TOUT moment du pipeline, y compris avant
 * `retenue` — `MatinScreen.decider('ecarter')` l'atteint directement depuis
 * `a_traiter` sans jamais passer par `retenue`) : la base ne conservant que
 * le statut COURANT, pas l'historique, une candidature écartée ne peut pas
 * être classée avec certitude comme « déjà retenue puis écartée » — voir
 * constat I3, revue finale de branche phase 3.
 */
const RETAINED_OR_LATER = new Set<ApplicationStatus>([
  'retenue',
  'postulee',
  'relancee',
  'entretien',
  'terminee',
]);

export interface StatsResult {
  /** Les trois premiers comptés en base ; les deux derniers viennent des
   * décisions et valent 0 tant qu'aucune n'a été prise — jamais masqués
   * (GUIDELINES.md §3.3).
   *
   * `retained` et `applied` sont CUMULATIFS, pas le statut courant (constat
   * I3, revue finale de branche phase 3) : un entonnoir compte ce qui est
   * PASSÉ PAR une étape, pas ce qui y stationne. Compter `byStatus.retenue`
   * ferait retomber « retenues » à 0 dès qu'une candidature avance à
   * `postulee` — perdant le fait qu'elle EST passée par `retenue`.
   * `applied` réutilise `sent` (`applied_at is not null`), déjà cumulatif et
   * déjà exposé par `responseRate.sent` plus bas ; `retained` utilise
   * `RETAINED_OR_LATER` (voir sa doc) faute d'un équivalent horodaté. */
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
  /** Candidatures dont le STATUT a réellement changé aujourd'hui (heure de
   * PARIS, jamais UTC — même piège que `computeStreak`, corrigé en tâche 6).
   * Remplace le compteur `localStorage` de la tâche 7 (`decidedStorage.ts`) :
   * une vérité serveur, partagée entre tous les navigateurs, plutôt qu'un
   * fait local à CE poste. `status <> 'a_traiter'` exclut l'ouverture seule
   * (`POST /offers/:id/open` pose `status_changed_at` à l'insertion sans
   * qu'aucune décision n'ait encore été prise) : chaque appelant du
   * tableau de bord enchaîne toujours `open` puis un `PATCH` vers un statut
   * réel dans le même geste (voir `MatinScreen.decider`, `DetailScreen`), ce
   * compteur ne compte donc que les VRAIES décisions. */
  decidedToday: number;
}

async function countExact(db: DbClient, table: string): Promise<number> {
  const { count, error } = await db.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`comptage de ${table} : ${error.message}`);
  return count ?? 0;
}

const RECENT_DAYS_WINDOW = 7;
const STREAK_TIME_ZONE = 'Europe/Paris';

// `Intl` est un global standard du langage, pas un accès à l'espace de noms
// du runtime : ce formateur ne casse pas la neutralité de ce fichier.
const parisDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: STREAK_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Clé de jour calendaire en heure de PARIS (`YYYY-MM-DD`), jamais en UTC.
 *
 * Revu par la tâche 6 : une clé en UTC mentait dans les deux sens autour de
 * minuit heure de Paris (UTC+1 ou +2 selon la saison). Exemple mesuré : un
 * envoi à 00 h 30 heure de Paris (22 h 30 UTC la veille en été) tombait, en
 * UTC, sur le MÊME jour qu'un envoi de la veille en fin d'après-midi — la
 * série avalait un jour réellement sauté. Symétriquement, un envoi à 00 h 30
 * heure de Paris pouvait retomber, en UTC, sur un jour déjà couvert : l'action
 * de l'utilisateur sur ce qu'il vit comme « aujourd'hui » n'incrémentait
 * rien, et une série vivante se cassait. C'est un compteur de motivation
 * (GUIDELINES.md §3.3) : un chiffre qui ment dans un sens ou dans l'autre est
 * pire qu'un chiffre absent. */
export function parisDateKey(date: Date): string {
  return parisDateFormatter.format(date);
}

/** Calculatrice de calendrier pure : construit un instant à MINUIT UTC du
 * jour "YYYY-MM-DD" donné, uniquement pour additionner/soustraire des jours
 * civils via les accesseurs UTC. Jamais interprété comme un instant réel, et
 * jamais reformaté autrement qu'en Y/M/D — aucun DST ne peut donc y fausser
 * un calcul, puisqu'aucune heure n'y est jamais lue. */
function previousDateKey(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  calendar.setUTCDate(calendar.getUTCDate() - 1);
  const y = calendar.getUTCFullYear();
  const m = String(calendar.getUTCMonth() + 1).padStart(2, '0');
  const d = String(calendar.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Jours avec au moins une candidature ENVOYÉE (`applied_at`), jamais lue
 * (GUIDELINES.md §3.3 : lire des offres ne maintient pas la série). Le jour
 * courant sans envoi ne casse pas la série — il n'est simplement pas encore
 * compté, comme un jeu qui n'a pas encore été joué aujourd'hui. Les clés de
 * `sentDays` DOIVENT être produites par `parisDateKey` (voir `getStats`) :
 * cette fonction ne reconvertit rien, elle ne fait que comparer des clés. */
export function computeStreak(
  sentDays: ReadonlySet<string>,
  today: Date = new Date(),
): { days: number; recentDays: { date: string; sent: boolean }[] } {
  const todayKey = parisDateKey(today);

  const dayKeys: string[] = [todayKey];
  for (let i = 1; i < RECENT_DAYS_WINDOW; i += 1) {
    dayKeys.push(previousDateKey(dayKeys[i - 1]));
  }
  dayKeys.reverse();
  const recentDays = dayKeys.map((date) => ({ date, sent: sentDays.has(date) }));

  let cursor = todayKey;
  if (!sentDays.has(cursor)) cursor = previousDateKey(cursor);
  let days = 0;
  while (sentDays.has(cursor)) {
    days += 1;
    cursor = previousDateKey(cursor);
  }
  return { days, recentDays };
}

/** `GET /stats` : entonnoir, série, compteur anti-perte.
 *
 * `now` est injectable (défaut `new Date()`) — même principe que
 * `computeStreak` : un test peut fixer « aujourd'hui » sans dépendre de
 * l'horloge réelle, pour `decidedToday` comme pour la série. */
export async function getStats(db: DbClient, now: Date = new Date()): Promise<StatsResult> {
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
    .select('status, outcome, applied_at, status_changed_at');
  if (appError) throw new Error(`lecture des candidatures : ${appError.message}`);

  const applications = (appRows ?? []) as {
    status: string;
    outcome: string | null;
    applied_at: string | null;
    status_changed_at: string;
  }[];

  const byStatus = Object.fromEntries(
    APPLICATION_STATUSES.map((status) => [status, 0]),
  ) as Record<ApplicationStatus, number>;
  let responses = 0;
  let sent = 0;
  let retained = 0;
  let decidedToday = 0;
  const sentDays = new Set<string>();
  const todayKey = parisDateKey(now);
  for (const app of applications) {
    if (app.status in byStatus) byStatus[app.status as ApplicationStatus] += 1;
    if (app.outcome) responses += 1;
    if (app.applied_at) {
      sent += 1;
      sentDays.add(parisDateKey(new Date(app.applied_at)));
    }
    if (RETAINED_OR_LATER.has(app.status as ApplicationStatus)) retained += 1;
    if (app.status !== 'a_traiter' && parisDateKey(new Date(app.status_changed_at)) === todayKey) {
      decidedToday += 1;
    }
  }

  return {
    funnel: {
      collected,
      scored,
      aboveThreshold: aboveThresholdCount ?? 0,
      // Cumulatifs, tous les deux — voir la doc de `StatsResult.funnel` et de
      // `RETAINED_OR_LATER` (constat I3, revue finale de branche phase 3).
      retained,
      applied: sent,
    },
    byStatus,
    streak: computeStreak(sentDays, now),
    neverOpened: neverOpenedCount ?? 0,
    decidedToday,
    responseRate: { responses, sent },
  };
}

// ----------------------------------------------------------------------------
// GET /config — les poids réglables et le profil actif (tâche 10)
// ----------------------------------------------------------------------------

export interface ActiveProfile {
  id: number;
  label: string;
  profileVersion: string;
  seniorityYears: number;
  createdAt: string;
}

export interface ConfigResult {
  /** Toutes les lignes de `scoring_weights` (`key` -> `value`), pas
   * seulement `salaire_floor` : la route existe pour que PLUS AUCUN poids
   * réglable n'ait jamais besoin d'être recopié en dur côté navigateur
   * (CLAUDE.md, « les axes réglables sont des lignes en base »), même si
   * `salaire_floor` est aujourd'hui le seul que la SPA consomme. */
  scoringWeights: Record<string, number>;
  activeProfile: ActiveProfile | null;
  /** Les termes de `profile_skills`, tels quels (minuscules, comme semés) —
   * TOUTE la table, pas seulement `stance = 'core'` : chaque ligne provient
   * d'une lecture littérale du CV (voir la migration `20260908250000`), donc
   * chacune est bien « présente dans le CV » au sens de la maquette
   * (`Detail.dc.html`, « les N technologies présentes dans votre CV ») —
   * qu'elle soit désirée (`core`/`adjacent`) ou non (`unwanted`). Comparée
   * en minuscules à `extraction.stack` par l'appelant. */
  cvSkills: string[];
  /** Offres jugées (`offer_ai_scores`) sous un `profile_version` DIFFÉRENT
   * de celui du profil actif — 0 si aucun profil actif. Répond à « combien
   * de jugements datent d'un CV antérieur », sans jamais déclencher un
   * rejugement (CLAUDE.md : décision tranchée, l'import ne repaie rien). */
  staleProfileOfferCount: number;
}

/** Nombre d'offres jugées sous un `profile_version` différent de celui
 * fourni — partagé entre `getConfig` (l'état courant) et
 * `importCandidateProfile` (l'état juste après l'import), pour ne jamais
 * dupliquer la question. */
async function countStaleProfileOffers(
  db: DbClient,
  currentProfileVersion: string,
): Promise<number> {
  const { count, error } = await db
    .from('offer_ai_scores')
    .select('*', { count: 'exact', head: true })
    .neq('profile_version', currentProfileVersion);
  if (error) {
    throw new Error(`comptage des offres à profil antérieur : ${error.message}`);
  }
  return count ?? 0;
}

function toActiveProfile(row: Row): ActiveProfile {
  return {
    id: row.id as number,
    label: row.label as string,
    profileVersion: row.profile_version as string,
    seniorityYears: Number(row.seniority_years),
    createdAt: row.created_at as string,
  };
}

const CANDIDATE_PROFILE_COLUMNS = 'id, label, profile_version, seniority_years, created_at';

/**
 * Le profil actif — ou, si AUCUNE ligne ne porte `is_active = true`, le plus
 * récemment créé.
 *
 * **Lecture robuste plutôt qu'écriture atomique** (revue de tâche 10) :
 * `importCandidateProfile` désactive l'ancien profil puis insère le nouveau
 * en deux écritures séquentielles (voir sa doc) — une panne entre les deux
 * (coupure réseau, par exemple) laisserait alors TOUTES les lignes à
 * `is_active = false`. Sans ce repli, `getConfig` rendrait
 * `activeProfile: null` **et** `staleProfileOfferCount: 0` : l'écran
 * afficherait « aucune offre périmée » alors que TOUTES le seraient — un
 * mensonge silencieux, pire que l'incohérence qu'il masquerait. Ce repli
 * referme le trou de lui-même au prochain appel, sans intervention
 * manuelle, et protège aussi contre toute autre incohérence de même forme
 * (une ligne insérée à la main, par exemple). Retenu plutôt qu'une fonction
 * SQL transactionnelle : plus simple, et couvre des origines de trou que
 * l'atomicité de CET appel ne couvrirait pas.
 */
async function getActiveOrLatestProfileRow(db: DbClient): Promise<Row | null> {
  const { data: activeRow, error: activeError } = await db
    .from('candidate_profile')
    .select(CANDIDATE_PROFILE_COLUMNS)
    .eq('is_active', true)
    .maybeSingle();
  if (activeError) throw new Error(`lecture du profil actif : ${activeError.message}`);
  if (activeRow !== null) return activeRow as Row;

  const { data: latestRows, error: latestError } = await db
    .from('candidate_profile')
    .select(CANDIDATE_PROFILE_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(1);
  if (latestError) {
    throw new Error(`lecture du profil le plus récent : ${latestError.message}`);
  }
  return ((latestRows ?? []) as Row[])[0] ?? null;
}

/** `GET /config` : les poids réglables (`scoring_weights`), le profil actif
 * et ses compétences, le compte d'offres à profil antérieur. Remplace la
 * copie en dur `SALAIRE_FLOOR_DUPLIQUE` de `dashboard/src/data/format.ts`
 * (tâche 10) : le seuil « unité incertaine » redevient une lecture de
 * `scoring_weights.salaire_floor`, réglable par `UPDATE` sans redéploiement,
 * comme CLAUDE.md le promet pour tous les axes de ce tableau. */
export async function getConfig(db: DbClient): Promise<ConfigResult> {
  const { data: weightRows, error: weightError } = await db
    .from('scoring_weights')
    .select('key, value');
  if (weightError) throw new Error(`lecture des poids réglables : ${weightError.message}`);
  const scoringWeights = Object.fromEntries(
    ((weightRows ?? []) as { key: string; value: number }[]).map((row) => [
      row.key,
      Number(row.value),
    ]),
  );

  const profileRow = await getActiveOrLatestProfileRow(db);

  const { data: skillRows, error: skillError } = await db.from('profile_skills').select('term');
  if (skillError) {
    throw new Error(`lecture des compétences du profil : ${skillError.message}`);
  }
  const cvSkills = ((skillRows ?? []) as { term: string }[]).map((row) => row.term);

  const activeProfile = profileRow === null ? null : toActiveProfile(profileRow);
  const staleProfileOfferCount = activeProfile === null
    ? 0
    : await countStaleProfileOffers(db, activeProfile.profileVersion);

  return { scoringWeights, activeProfile, cvSkills, staleProfileOfferCount };
}

// ----------------------------------------------------------------------------
// POST /candidate-profile — l'import du CV (tâche 10)
// ----------------------------------------------------------------------------

export interface CandidateProfileInput {
  label: string;
  cvText: string;
  seniorityYears: number;
  profileVersion: string;
}

export interface ImportCandidateProfileResult {
  profile: ActiveProfile;
  /** Recompté APRÈS l'écriture, par rapport à la version qui vient d'être
   * importée — c'est le nombre que l'écran doit afficher pour dire « voilà
   * ce que cet import laisse inchangé », jamais un nombre proposé à recalculer. */
  staleProfileOfferCount: number;
}

/**
 * `POST /candidate-profile` : importe un nouveau CV.
 *
 * **Décision tranchée (task-10-brief.md), à respecter à la lettre : ne
 * rejuge RIEN.** Cette fonction n'écrit que sur `candidate_profile` — jamais
 * sur `offer_ai_scores`, jamais de file de rejugement posée. Le rejugement
 * reste une opération délibérée en ligne de commande (~12 € le passage,
 * CLAUDE.md), jamais un effet de bord de cet import.
 *
 * Désactive l'ancien profil actif puis insère le nouveau — deux écritures
 * séquentielles, **pas** une transaction : `candidate_profile_one_active`
 * (index unique partiel sur `is_active`) interdit deux lignes actives à la
 * fois, donc l'ordre (désactiver, PUIS insérer active) est obligatoire quel
 * que soit le mécanisme.
 *
 * **Réserve assumée, couverte en lecture plutôt qu'en écriture** (revue de
 * tâche 10) : une panne entre les deux écritures (coupure réseau, par
 * exemple) laisserait toutes les lignes à `is_active = false`. Plutôt que de
 * rendre CETTE fonction atomique (une fonction SQL dédiée), c'est
 * `getActiveOrLatestProfileRow` — utilisée ici ET par `getConfig` — qui
 * répare : retombe sur le profil le plus récent quand aucun n'est marqué
 * actif. Choix délibéré : plus simple qu'une fonction SQL, et couvre aussi
 * les incohérences nées autrement (une ligne modifiée à la main). Le point
 * qui aurait pu mentir — `getConfig` rendant `activeProfile: null` **et**
 * `staleProfileOfferCount: 0` alors que des offres restent bel et bien
 * périmées — est donc fermé côté lecture, là où il se manifesterait.
 *
 * Rejette (`ValidationError`, 400) si `profileVersion` égale la version
 * active : CLAUDE.md prévient explicitement que changer le CV SANS faire
 * évoluer la version est pire que de payer un rejugement — « le corpus
 * porterait deux populations jugées sous deux profils différents, sans rien
 * pour les distinguer ». Ce garde-fou refuse ce cas au lieu de le permettre
 * en silence.
 */
export async function importCandidateProfile(
  db: DbClient,
  input: CandidateProfileInput,
): Promise<ImportCandidateProfileResult> {
  const currentActiveRow = await getActiveOrLatestProfileRow(db);
  const currentVersion = currentActiveRow?.profile_version as string | undefined;
  if (currentVersion === input.profileVersion) {
    throw new ValidationError(
      `"profileVersion" doit différer de la version active ("${input.profileVersion}") — ` +
        'un CV changé sans faire évoluer la version mélangerait deux populations de ' +
        'jugements sans rien pour les distinguer (CLAUDE.md)',
    );
  }

  const { error: deactivateError } = await db
    .from('candidate_profile')
    .update({ is_active: false })
    .eq('is_active', true);
  if (deactivateError) {
    throw new Error(`désactivation du profil précédent : ${deactivateError.message}`);
  }

  const { data: inserted, error: insertError } = await db
    .from('candidate_profile')
    .insert({
      label: input.label,
      cv_text: input.cvText,
      seniority_years: input.seniorityYears,
      profile_version: input.profileVersion,
      is_active: true,
    })
    .select('id, label, profile_version, seniority_years, created_at')
    .single();
  if (insertError) throw new Error(`écriture du profil : ${insertError.message}`);

  const profile = toActiveProfile(inserted as Row);
  const staleProfileOfferCount = await countStaleProfileOffers(db, profile.profileVersion);

  return { profile, staleProfileOfferCount };
}
