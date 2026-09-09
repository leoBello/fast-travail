import { createDbClient } from '../_shared/db.ts';
import { routeDashboardRequest } from '../_shared/dashboard-api.ts';

/**
 * Point d'entrée du tableau de bord — le SEUL chemin par lequel le
 * navigateur atteint la base. Aucune logique métier ici : lire
 * l'environnement, vérifier le secret partagé, déléguer. Voir
 * `_shared/dashboard-api.ts` pour le routage et la validation, et
 * `_shared/dashboard-query.ts` pour les lectures et écritures.
 *
 * Trois barrières, dont AUCUNE n'est une authentification (à consigner dans
 * ETAT.md comme condition, pas comme option, si la SPA est publiée un jour) :
 *
 * 1. `verify_jwt = true` (config plateforme) — écarte tout appel sans jeton
 *    valide. La clé `anon` du navigateur suffit à le franchir, comme pour les
 *    crons existants.
 * 2. Le secret partagé vérifié ci-dessous — écarte qui connaîtrait la seule
 *    référence de projet et la clé `anon`, toutes deux publiques par
 *    construction.
 * 3. RLS actif sans policy sur toutes les tables — la clé `anon` ne lit rien
 *    directement ; seule la clé `service_role`, injectée par la plateforme
 *    dans CETTE fonction et qui n'en sort jamais, le peut. Ça inclut les VUES
 *    du tableau de bord (`offers_dashboard`, `offers_scored`,
 *    `offer_display_groups`, `offer_application_state`) : une vue s'exécute
 *    par défaut avec les droits de son PROPRIÉTAIRE, pas de l'appelant, et
 *    contournerait donc le RLS des tables sans l'option
 *    `security_invoker = on` posée dessus par la migration
 *    `20260910020000_views_security_invoker.sql` — vérifié en base (constat
 *    I1, revue finale de branche phase 3) : `anon` y rendait tout le corpus
 *    avant ce correctif.
 */
function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`variable d'environnement manquante : ${name}`);
  return value;
}

const DASHBOARD_TOKEN_HEADER = 'x-dashboard-token';

// La SPA est servie en local (Vite) : l'origine varie selon le port choisi
// au démarrage. `*` n'affaiblit rien de plus que ce que la posture décrit
// déjà ci-dessus — le secret partagé reste la seule barrière applicative, et
// il est vérifié quelle que soit l'origine.
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': `authorization, apikey, content-type, ${DASHBOARD_TOKEN_HEADER}`,
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

Deno.serve(async (req) => {
  // Le préflight CORS ne porte ni jeton ni secret par construction — c'est
  // le navigateur qui l'émet, pas la SPA. Le laisser passer avant les deux
  // vérifications ne contourne rien : la vraie requête qui suit, elle,
  // passe par les deux.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

  try {
    const expectedToken = requireEnv('DASHBOARD_TOKEN');
    const providedToken = req.headers.get(DASHBOARD_TOKEN_HEADER);
    if (providedToken !== expectedToken) {
      return withCors(
        Response.json({ error: 'secret de tableau de bord invalide ou absent' }, { status: 403 }),
      );
    }

    const db = createDbClient({
      url: requireEnv('SUPABASE_URL'),
      serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    });

    return withCors(await routeDashboardRequest(req, { db }));
  } catch (cause) {
    return withCors(Response.json({ error: String(cause) }, { status: 500 }));
  }
});
