const TOKEN_URL =
  'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
const SCOPE = 'api_offresdemploiv2 o2dsoffre';
/** Marge avant expiration : on ne réutilise pas un token qui expire dans moins d'une minute. */
const SAFETY_MARGIN_MS = 60_000;

export interface FtAuthConfig {
  clientId: string;
  clientSecret: string;
}

let cachedToken: string | null = null;
let cachedUntil = 0;

/** À appeler entre deux tests pour isoler le cache module-scope. */
export function resetTokenCache(): void {
  cachedToken = null;
  cachedUntil = 0;
}

export async function getAccessToken(
  cfg: FtAuthConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (cachedToken && Date.now() < cachedUntil) return cachedToken;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: SCOPE,
  });

  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`token France Travail refusé (${response.status})`);
  }

  const payload = await response.json() as { access_token: string; expires_in: number };
  const ttlMs = payload.expires_in * 1000;

  // Un token à durée de vie courte n'est pas mis en cache : le remettre en
  // cache ferait échouer la requête suivante avec un 401 difficile à lire.
  if (ttlMs > SAFETY_MARGIN_MS) {
    cachedToken = payload.access_token;
    cachedUntil = Date.now() + ttlMs - SAFETY_MARGIN_MS;
  } else {
    resetTokenCache();
  }

  return payload.access_token;
}
