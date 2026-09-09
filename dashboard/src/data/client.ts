import type {
  ApplicationPatchInput,
  ApplicationRow,
  CandidateProfileInput,
  ConfigResult,
  ImportCandidateProfileResult,
  OfferDashboardRow,
  OfferDetail,
  OffersListFilters,
  PageResult,
  Pagination,
  StatsResult,
  WorkModeFilter,
} from './types';

/**
 * Configuration du client — reçue en paramètre, jamais lue directement
 * depuis `import.meta.env` à l'intérieur des fonctions ci-dessous. Même
 * principe que CLAUDE.md impose côté Edge Functions (« la configuration
 * arrive en paramètre ») : ça rend le client testable sans `import.meta.env`
 * ni `fetch` global, et ça isole en un seul endroit
 * (`dashboardClientFromEnv`) la lecture des variables `VITE_*`.
 */
export interface DashboardClientConfig {
  /** Base de la fonction déployée, sans slash final (ex. `.../functions/v1/api-dashboard`). */
  baseUrl: string;
  /** Jeton `Authorization: Bearer` — la clé `anon` Supabase, exigée par `verify_jwt`. */
  anonKey: string;
  /** Secret partagé de la fonction (`x-dashboard-token`), distinct de `anonKey`. */
  dashboardToken: string;
  /** Injectable pour les tests ; par défaut le `fetch` global du navigateur. */
  fetchImpl?: typeof fetch;
}

/** Erreur porteuse du statut HTTP et du message rendu par la fonction (`{ error }` en JSON, sinon le corps brut). */
export class DashboardApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'DashboardApiError';
  }
}

/** `string[]` pose la MÊME clé plusieurs fois (`?workMode=a&workMode=b`) —
 * c'est ce que `getAll()` lit côté serveur (`dashboard-api.ts`, tâche 10).
 * Un tableau vide se comporte comme `undefined` (aucun paramètre posé) : les
 * appelants de ce dashboard n'en construisent jamais, mais rien ne le
 * suppose ici. */
function buildQuery(
  params: Record<string, string | number | boolean | readonly string[] | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) search.append(key, v);
    } else {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs === '' ? '' : `?${qs}`;
}

/**
 * Le client de lecture/écriture du tableau de bord.
 *
 * Chaque méthode correspond à une route de `api-dashboard` (tâche 6) — voir
 * `supabase/functions/_shared/dashboard-api.ts` pour le contrat exact.
 * Aucune méthode ne masque de filtre par défaut : les filtres absents ne
 * restreignent rien, comme côté serveur.
 */
export interface DashboardClient {
  listOffers(filters?: OffersListFilters): Promise<PageResult<OfferDashboardRow>>;
  listBrief(pagination?: Pagination): Promise<PageResult<OfferDashboardRow>>;
  getStats(): Promise<StatsResult>;
  getOfferDetail(id: string): Promise<OfferDetail | null>;
  openOffer(id: string): Promise<ApplicationRow>;
  patchApplication(id: string, patch: ApplicationPatchInput): Promise<ApplicationRow>;
  /** `GET /config` (tâche 10) : poids réglables, profil actif, compétences. */
  getConfig(): Promise<ConfigResult>;
  /** `POST /candidate-profile` (tâche 10) : importe un nouveau CV. Ne
   * rejuge RIEN (CLAUDE.md, décision tranchée) — voir `ProfilScreen`. */
  importCandidateProfile(input: CandidateProfileInput): Promise<ImportCandidateProfileResult>;
}

/** Compte les offres pour une valeur de `work_mode` donnée, sans rien lister
 * (`pageSize: 1`, seul `total` est lu) — sert au panneau de filtres, qui
 * doit chiffrer la ligne « non précisé » (GUIDELINES §3.2) sans la masquer. */
export async function countByWorkMode(
  client: DashboardClient,
  workMode: WorkModeFilter,
): Promise<number> {
  const page = await client.listOffers({ workMode: [workMode], pageSize: 1 });
  return page.total;
}

export function createDashboardClient(config: DashboardClientConfig): DashboardClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const base = config.baseUrl.replace(/\/+$/, '');

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetchImpl(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.anonKey}`,
        'x-dashboard-token': config.dashboardToken,
        ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...init?.headers,
      },
    });

    const text = await response.text();
    const body: unknown = text === '' ? undefined : JSON.parse(text);

    if (!response.ok) {
      const message =
        body !== undefined &&
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof (body as { error: unknown }).error === 'string'
          ? (body as { error: string }).error
          : `requête échouée (${response.status})`;
      throw new DashboardApiError(response.status, message);
    }

    return body as T;
  }

  return {
    listOffers(filters = {}) {
      const query = buildQuery({
        sort: filters.sort,
        page: filters.page,
        pageSize: filters.pageSize,
        statut: filters.statut,
        workMode: filters.workMode,
        engagement: filters.engagement,
        source: filters.source,
        agenticAi: filters.agenticAi,
        minScore: filters.minScore,
      });
      return request<PageResult<OfferDashboardRow>>(`/offers${query}`);
    },

    listBrief(pagination = {}) {
      const query = buildQuery({ page: pagination.page, pageSize: pagination.pageSize });
      return request<PageResult<OfferDashboardRow>>(`/brief${query}`);
    },

    getStats() {
      return request<StatsResult>('/stats');
    },

    async getOfferDetail(id) {
      try {
        return await request<OfferDetail>(`/offers/${id}`);
      } catch (cause) {
        if (cause instanceof DashboardApiError && cause.status === 404) return null;
        throw cause;
      }
    },

    openOffer(id) {
      return request<ApplicationRow>(`/offers/${id}/open`, { method: 'POST' });
    },

    patchApplication(id, patch) {
      return request<ApplicationRow>(`/offers/${id}/application`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
    },

    getConfig() {
      return request<ConfigResult>('/config');
    },

    importCandidateProfile(input) {
      return request<ImportCandidateProfileResult>('/candidate-profile', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
  };
}

/**
 * Construit le client à partir des variables `VITE_*` — le seul endroit qui
 * lit `import.meta.env` dans `data/`. `App.tsx` l'appelle une fois ; tout le
 * reste reçoit le client en prop, comme `DashboardClientConfig` le prévoit.
 *
 * Trois variables, pas une seule : `VITE_DASHBOARD_API_URL` (l'URL de la
 * fonction déployée), `VITE_DASHBOARD_TOKEN` (le secret partagé,
 * `x-dashboard-token`) et `VITE_SUPABASE_ANON_KEY` (le jeton `Authorization`
 * qu'exige `verify_jwt`, toujours actif — CLAUDE.md, « Secrets »). La clé
 * `anon` est publique par conception : elle est censée voyager dans le
 * bundle d'une SPA. Voir `.env.example`.
 */
export function dashboardClientFromEnv(): DashboardClient {
  const env = import.meta.env;
  const baseUrl = env.VITE_DASHBOARD_API_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  const dashboardToken = env.VITE_DASHBOARD_TOKEN;

  const manquantes = [
    baseUrl === undefined || baseUrl === '' ? 'VITE_DASHBOARD_API_URL' : null,
    anonKey === undefined || anonKey === '' ? 'VITE_SUPABASE_ANON_KEY' : null,
    dashboardToken === undefined || dashboardToken === '' ? 'VITE_DASHBOARD_TOKEN' : null,
  ].filter((nom): nom is string => nom !== null);

  if (manquantes.length > 0) {
    throw new Error(
      `Variable(s) d'environnement manquante(s) : ${manquantes.join(', ')}. Voir dashboard/.env.example.`,
    );
  }

  return createDashboardClient({ baseUrl, anonKey, dashboardToken });
}
