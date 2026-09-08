// Runtime-neutre : aucun Deno.* ici. fetch, AbortSignal et setTimeout sont des
// API web. La configuration — agent utilisateur, délai, plafonds — arrive en
// paramètre, jamais de l'environnement : elle vient de la table `sources`.

export interface PoliteFetchOptions {
  /** Agent utilisateur honnête. Jamais un navigateur usurpé, jamais d'adresse personnelle. */
  userAgent: string;
  /** Délai minimal entre deux requêtes vers la même source, en millisecondes. */
  minDelayMs: number;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface FetchedPage {
  url: string;
  status: number;
  body: string;
}

/**
 * Ce dont un client de source a besoin, et rien de plus. C'est CE type que les
 * clients acceptent en paramètre, jamais la classe : un test peut alors injecter
 * un double de trois lignes, sans réseau et sans horloge.
 */
export interface PageFetcher {
  get(url: string): Promise<FetchedPage>;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;

/** Codes qui méritent une seconde chance : surcharge passagère, pas erreur de requête. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Client HTTP poli : un seul en vol à la fois, délai minimal respecté entre deux
 * requêtes, agent utilisateur annoncé, temporisation et reprise sur surcharge.
 *
 * Le délai n'est PAS appliqué avant la première requête : il sépare deux
 * requêtes, il ne retarde pas le démarrage.
 */
export class PoliteFetcher implements PageFetcher {
  readonly #userAgent: string;
  readonly #minDelayMs: number;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #now: () => number;
  #lastRequestAt: number | null = null;
  #requestCount = 0;

  constructor(opts: PoliteFetchOptions) {
    this.#userAgent = opts.userAgent;
    this.#minDelayMs = opts.minDelayMs;
    this.#timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.#fetch = opts.fetchImpl ?? fetch;
    this.#sleep = opts.sleep ?? defaultSleep;
    this.#now = opts.now ?? Date.now;
  }

  /** Nombre de requêtes réellement émises, tentatives comprises. Sert à la télémétrie. */
  get requestCount(): number {
    return this.#requestCount;
  }

  async get(url: string): Promise<FetchedPage> {
    let lastStatus = 0;

    for (let attempt = 0; attempt <= this.#maxRetries; attempt++) {
      await this.#waitTurn();

      const response = await this.#fetch(url, {
        headers: {
          'user-agent': this.#userAgent,
          'accept-language': 'fr',
        },
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
      this.#requestCount++;
      lastStatus = response.status;

      if (response.ok) {
        return { url, status: response.status, body: await response.text() };
      }

      // Le corps est lu même sur erreur : sans cela le flux reste ouvert.
      await response.text();

      if (!RETRYABLE_STATUS.has(response.status)) break;
      if (attempt < this.#maxRetries) {
        await this.#sleep(this.#minDelayMs * (attempt + 1));
      }
    }

    throw new Error(`HTTP ${lastStatus} sur ${url}`);
  }

  async #waitTurn(): Promise<void> {
    if (this.#lastRequestAt !== null) {
      const remaining = this.#minDelayMs - (this.#now() - this.#lastRequestAt);
      if (remaining > 0) await this.#sleep(remaining);
    }
    this.#lastRequestAt = this.#now();
  }
}
