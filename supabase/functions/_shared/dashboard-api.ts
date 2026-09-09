import type { DbClient } from './db.ts';
import {
  APPLICATION_OUTCOMES,
  APPLICATION_STATUSES,
  type ApplicationOutcome,
  type ApplicationPatchInput,
  type ApplicationStatus,
  BRIEF_THRESHOLD,
  type CandidateProfileInput,
  DEFAULT_PAGE_SIZE,
  ENGAGEMENTS,
  getConfig,
  getOfferDetail,
  getStats,
  getWorkModeCounts,
  importCandidateProfile,
  listBrief,
  listOffers,
  MAX_PAGE,
  MAX_PAGE_SIZE,
  openOffer,
  patchApplication,
  SORT_FIELDS,
  type SortField,
  SOURCES,
  ValidationError,
  WORK_MODE_UNSPECIFIED,
  WORK_MODES,
  type WorkModeFilter,
} from './dashboard-query.ts';

/**
 * Runtime-neutre : aucun accès à l'espace de noms global du runtime. Le client de base arrive en paramètre
 * (`DashboardApiDeps`). `api-dashboard/index.ts` lit l'environnement, vérifie
 * le secret partagé, puis délègue tout le routage ici — aucune logique
 * métier ne reste dans `index.ts`.
 *
 * Validation stricte des entrées, non négociable (CLAUDE.md /
 * task-6-brief.md) : un tri, un statut, une issue ou un booléen inattendu
 * rend un 400 explicite. Jamais un défaut silencieux — un tri inconnu qui
 * retomberait sur le tri par défaut ferait afficher autre chose que ce qui
 * est demandé, sans que rien ne le signale.
 */
export interface DashboardApiDeps {
  db: DbClient;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(raw: string): string {
  if (!UUID_RE.test(raw)) {
    throw new ValidationError(`identifiant invalide : "${raw}" (UUID attendu)`);
  }
  return raw;
}

function requireEnumParam<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const raw = params.get(key);
  if (raw === null) return undefined;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new ValidationError(
      `paramètre "${key}" invalide : "${raw}" — attendu parmi ${allowed.join(', ')}`,
    );
  }
  return raw as T;
}

/**
 * Version « plusieurs valeurs » de `requireEnumParam` (tâche 10, filtres
 * multi-valeurs) : chaque occurrence du paramètre (`?statut=a&statut=b`) est
 * validée individuellement — une seule valeur inconnue rejette tout l'appel
 * en 400, jamais un tri silencieux qui ignorerait la valeur fautive.
 * `undefined` quand le paramètre est absent (comportement inchangé : aucune
 * restriction), `[]` n'est jamais renvoyé — `getAll` sur une clé absente
 * rend déjà `[]`, distingué ici de « présent » par sa longueur.
 */
function requireEnumParamMulti<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
): T[] | undefined {
  const raw = params.getAll(key);
  if (raw.length === 0) return undefined;
  for (const value of raw) {
    if (!(allowed as readonly string[]).includes(value)) {
      throw new ValidationError(
        `paramètre "${key}" invalide : "${value}" — attendu parmi ${allowed.join(', ')}`,
      );
    }
  }
  return raw as T[];
}

/** Entier positif ou nul strict : pas de notation scientifique, pas de signe,
 * pas de décimale — un `parseInt` laxiste accepterait "12abc" comme 12. */
const UINT_RE = /^\d+$/;

function parseIntParam(
  params: URLSearchParams,
  key: string,
  opts: { min: number; fallback: number },
): number {
  const raw = params.get(key);
  if (raw === null) return opts.fallback;
  if (!UINT_RE.test(raw)) {
    throw new ValidationError(`paramètre "${key}" invalide : entier attendu, reçu "${raw}"`);
  }
  const value = Number(raw);
  if (value < opts.min) {
    throw new ValidationError(`paramètre "${key}" invalide : minimum ${opts.min}, reçu ${value}`);
  }
  return value;
}

function parseBoolParam(params: URLSearchParams, key: string): boolean | undefined {
  const raw = params.get(key);
  if (raw === null) return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new ValidationError(
    `paramètre "${key}" invalide : "true" ou "false" attendu, reçu "${raw}"`,
  );
}

function parseScoreParam(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null) return undefined;
  if (!UINT_RE.test(raw) || Number(raw) > 100) {
    throw new ValidationError(
      `paramètre "${key}" invalide : entier entre 0 et 100 attendu, reçu "${raw}"`,
    );
  }
  return Number(raw);
}

function parsePagination(params: URLSearchParams): { page: number; pageSize: number } {
  const rawPage = parseIntParam(params, 'page', { min: 1, fallback: 1 });
  const rawPageSize = parseIntParam(params, 'pageSize', { min: 1, fallback: DEFAULT_PAGE_SIZE });
  // « Bornée », pas rejetée : une valeur au-dessus du maximum est ramenée au
  // maximum plutôt que refusée — c'est le sens de « pagination bornée » du
  // brief, à la différence d'un tri ou d'un statut inconnus, qui eux sont
  // rejetés (aucun « bon » repli n'existe pour une énumération fermée).
  // `page` a le MÊME traitement que `pageSize`, pas seulement ce dernier :
  // sans plafond, une chaîne de centaines de chiffres passe la regex d'entier
  // positif, et `Number()` la convertit en `Infinity`, qui satisfait
  // `>= min` — la revue de la tâche 6 l'a mesuré. `Math.min(Infinity, MAX_PAGE)`
  // referme cette échappatoire au passage, sans logique séparée.
  return {
    page: Math.min(rawPage, MAX_PAGE),
    pageSize: Math.min(rawPageSize, MAX_PAGE_SIZE),
  };
}

/** Version « plusieurs valeurs » de `workMode` : chaque occurrence peut être
 * une valeur connue OU `WORK_MODE_UNSPECIFIED` — c'est cette combinaison
 * qui rend possible « full remote OU non précisé » (tâche 10). */
function parseWorkModeParamMulti(params: URLSearchParams): WorkModeFilter[] | undefined {
  const raw = params.getAll('workMode');
  if (raw.length === 0) return undefined;
  for (const value of raw) {
    if (value !== WORK_MODE_UNSPECIFIED && !(WORK_MODES as readonly string[]).includes(value)) {
      throw new ValidationError(
        `paramètre "workMode" invalide : "${value}" — attendu parmi ${
          WORK_MODES.join(', ')
        }, ${WORK_MODE_UNSPECIFIED}`,
      );
    }
  }
  return raw as WorkModeFilter[];
}

function parseOffersListFilters(params: URLSearchParams) {
  const { page, pageSize } = parsePagination(params);
  const sort: SortField = requireEnumParam(params, 'sort', SORT_FIELDS) ?? 'final_score';
  const statut = requireEnumParamMulti(params, 'statut', APPLICATION_STATUSES);
  const engagement = requireEnumParamMulti(params, 'engagement', ENGAGEMENTS);
  const source = requireEnumParamMulti(params, 'source', SOURCES);
  const workMode = parseWorkModeParamMulti(params);
  const agenticAi = parseBoolParam(params, 'agenticAi');
  const minScore = parseScoreParam(params, 'minScore');

  return { sort, page, pageSize, statut, workMode, engagement, source, agenticAi, minScore };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoDateOrNull(value: unknown): value is string | null {
  if (value === null) return true;
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/** Parse et valide le corps de `PATCH /offers/:id/application`. Chaque champ
 * est optionnel (absent = pas touché) ; présent mais mal formé = 400. */
function parseApplicationPatch(body: unknown): ApplicationPatchInput {
  if (!isPlainObject(body)) {
    throw new ValidationError('corps de requête invalide : objet JSON attendu');
  }

  const patch: ApplicationPatchInput = {};

  if ('status' in body) {
    const raw = body.status;
    if (typeof raw !== 'string' || !(APPLICATION_STATUSES as readonly string[]).includes(raw)) {
      throw new ValidationError(
        `"status" invalide : attendu parmi ${APPLICATION_STATUSES.join(', ')}`,
      );
    }
    patch.status = raw as ApplicationStatus;
  }

  if ('outcome' in body) {
    const raw = body.outcome;
    if (
      raw !== null &&
      (typeof raw !== 'string' || !(APPLICATION_OUTCOMES as readonly string[]).includes(raw))
    ) {
      throw new ValidationError(
        `"outcome" invalide : attendu null ou parmi ${APPLICATION_OUTCOMES.join(', ')}`,
      );
    }
    patch.outcome = raw as ApplicationOutcome | null;
  }

  for (const field of ['appliedAt', 'lastFollowupAt', 'interviewAt'] as const) {
    if (field in body) {
      const raw = body[field];
      if (!isIsoDateOrNull(raw)) {
        throw new ValidationError(`"${field}" invalide : date ISO 8601 ou null attendue`);
      }
      patch[field] = raw;
    }
  }

  if ('notes' in body) {
    const raw = body.notes;
    if (raw !== null && typeof raw !== 'string') {
      throw new ValidationError('"notes" invalide : chaîne ou null attendue');
    }
    patch.notes = raw;
  }

  return patch;
}

/** Parse et valide le corps de `POST /candidate-profile` (tâche 10, l'import
 * du CV). Les quatre champs sont OBLIGATOIRES — contrairement au `PATCH`
 * d'application, il n'y a pas de notion de « champ non touché » : un import
 * pose un profil entier, jamais un correctif partiel. */
function parseCandidateProfileInput(body: unknown): CandidateProfileInput {
  if (!isPlainObject(body)) {
    throw new ValidationError('corps de requête invalide : objet JSON attendu');
  }

  const label = body.label;
  if (typeof label !== 'string' || label.trim() === '') {
    throw new ValidationError('"label" invalide : chaîne non vide attendue');
  }

  const cvText = body.cvText;
  if (typeof cvText !== 'string' || cvText.trim() === '') {
    throw new ValidationError('"cvText" invalide : chaîne non vide attendue');
  }

  const seniorityYears = body.seniorityYears;
  if (
    typeof seniorityYears !== 'number' || !Number.isFinite(seniorityYears) || seniorityYears < 0
  ) {
    throw new ValidationError('"seniorityYears" invalide : nombre positif ou nul attendu');
  }

  const profileVersion = body.profileVersion;
  if (typeof profileVersion !== 'string' || profileVersion.trim() === '') {
    throw new ValidationError('"profileVersion" invalide : chaîne non vide attendue');
  }

  return { label, cvText, seniorityYears, profileVersion };
}

async function parseJsonBody(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.trim() === '') return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError('corps de requête invalide : JSON mal formé');
  }
}

function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

/** Retire tout préfixe jusqu'à `/api-dashboard` inclus : selon le contexte
 * d'invocation (local vs déployé derrière la passerelle), `req.url` peut
 * porter `/api-dashboard/offers`, `/functions/v1/api-dashboard/offers` ou
 * directement `/offers`. Les trois routent pareil. */
function normalizePath(pathname: string): string {
  const marker = '/api-dashboard';
  const idx = pathname.indexOf(marker);
  const stripped = idx === -1 ? pathname : pathname.slice(idx + marker.length);
  return stripped === '' ? '/' : stripped;
}

/** Point d'entrée du routage. Toute `ValidationError` levée par un parseur ou
 * par `dashboard-query.ts` (règles métier) devient un 400 ; toute autre
 * erreur (panne de base, etc.) devient un 500 dont le message ne peut pas
 * contenir la clé `service_role` — elle n'apparaît jamais dans un message
 * d'erreur du client Supabase, seulement passée à sa construction. */
export async function routeDashboardRequest(
  req: Request,
  deps: DashboardApiDeps,
): Promise<Response> {
  const url = new URL(req.url);
  const path = normalizePath(url.pathname);
  const { db } = deps;

  try {
    if (req.method === 'GET' && path === '/offers') {
      const filters = parseOffersListFilters(url.searchParams);
      return Response.json(await listOffers(db, filters));
    }

    if (req.method === 'GET' && path === '/brief') {
      return Response.json(await listBrief(db, parsePagination(url.searchParams)));
    }

    if (req.method === 'GET' && path === '/stats') {
      return Response.json(await getStats(db));
    }

    if (req.method === 'GET' && path === '/work-mode-counts') {
      return Response.json(await getWorkModeCounts(db));
    }

    if (req.method === 'GET' && path === '/config') {
      return Response.json(await getConfig(db));
    }

    if (req.method === 'POST' && path === '/candidate-profile') {
      const input = parseCandidateProfileInput(await parseJsonBody(req));
      return Response.json(await importCandidateProfile(db, input), { status: 201 });
    }

    const detailMatch = path.match(/^\/offers\/([^/]+)$/);
    if (req.method === 'GET' && detailMatch) {
      const id = assertUuid(detailMatch[1]);
      const detail = await getOfferDetail(db, id);
      if (!detail) return jsonError(404, `offre introuvable : ${id}`);
      return Response.json(detail);
    }

    const openMatch = path.match(/^\/offers\/([^/]+)\/open$/);
    if (req.method === 'POST' && openMatch) {
      const id = assertUuid(openMatch[1]);
      const result = await openOffer(db, id);
      if (result.outcome === 'offer_not_found') return jsonError(404, `offre introuvable : ${id}`);
      return Response.json(result.row, { status: result.outcome === 'created' ? 201 : 200 });
    }

    const applicationMatch = path.match(/^\/offers\/([^/]+)\/application$/);
    if (req.method === 'PATCH' && applicationMatch) {
      const id = assertUuid(applicationMatch[1]);
      const patch = parseApplicationPatch(await parseJsonBody(req));
      const result = await patchApplication(db, id, patch);
      if (result.outcome === 'not_found') {
        return jsonError(
          404,
          `aucune candidature pour l'offre ${id} — POST /offers/${id}/open d'abord`,
        );
      }
      return Response.json(result.row);
    }

    return jsonError(404, `route inconnue : ${req.method} ${path}`);
  } catch (cause) {
    if (cause instanceof ValidationError) return jsonError(400, cause.message);
    return jsonError(500, String(cause));
  }
}

// Réexporté pour les tests et pour `api-dashboard/index.ts`, qui n'a rien
// d'autre à connaître de ce module que ce point d'entrée et ce seuil (pour
// l'exposer, par exemple, dans une future page d'état).
export { BRIEF_THRESHOLD };
