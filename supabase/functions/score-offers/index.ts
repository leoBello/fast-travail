import { createDbClient } from '../_shared/db.ts';
import { runScoring } from '../_shared/run-scoring.ts';

/**
 * Le flux quotidien mesure ~41 offres, donc 60 suffit largement a l'absorber.
 *
 * Le plafond d'execution d'une Edge Function est de 150 s. Un appel au modele
 * mesure 4,71 s (cache chaud). A concurrence 4, 60 offres font 15 tours, soit
 * ~71 s : plus du double de marge. Le defaut precedent, 120, faisait 30 tours
 * = ~141 s pour 150 s de plafond — 6 % de marge, et le commentaire qui
 * affirmait « 120 laisse de la marge » etait donc faux. Un premier appel du
 * cron sur un arriere aurait deborde, perdant jusqu'a 24 jugements PAYES
 * restes dans le tampon d'ecriture.
 */
const DEFAULT_LIMIT = 60;
const DEFAULT_CONCURRENCY = 4;

/**
 * Bornes hautes. `limit` a 200 reste sous le plafond de 150 s tant que la
 * concurrence suit (200 offres a concurrence 8 = 25 tours = ~118 s) et evite
 * qu'une coquille — `1200` au lieu de `120` dans la definition du cron —
 * n'achete tout le corpus d'un coup.
 */
const MAX_LIMIT = 200;
const MAX_CONCURRENCY = 8;

/** Lecture de l'environnement : propre a Deno, donc hors de _shared/. */
function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`variable d'environnement manquante : ${name}`);
  return value;
}

/**
 * `req.json()` rend `any` : une `interface RequestBody` posee dessus ne valide
 * rien, ni a la compilation ni a l'execution — `{"limit":100000}` passerait
 * tel quel jusqu'a l'API payante. La validation se fait donc a la main, sur
 * une valeur restee `unknown`. Absente, non numerique, non finie ou < 1 : on
 * retombe sur le defaut ; au-dessus du maximum : on plafonne.
 */
function readOption(body: unknown, key: string, fallback: number, max: number): number {
  const raw: unknown = typeof body === 'object' && body !== null
    ? Reflect.get(body, key)
    : undefined;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  const value = Math.floor(raw);
  if (value < 1) return fallback;
  return Math.min(value, max);
}

/** `dryRun` n'est vrai que sur le booleen exact : tout le reste depense. */
function readDryRun(body: unknown): boolean {
  const raw: unknown = typeof body === 'object' && body !== null
    ? Reflect.get(body, 'dryRun')
    : undefined;
  return raw === true;
}

Deno.serve(async (req) => {
  try {
    const body: unknown = await req.json().catch(() => ({}));

    // Dans le `try` : une SUPABASE_URL manquante doit rendre le meme contrat
    // JSON {"error":…} qu'une ANTHROPIC_API_KEY manquante. Hors du `try`,
    // Deno.serve rattrapait bien le throw mais repondait un 500 en texte brut.
    const db = createDbClient({
      url: requireEnv('SUPABASE_URL'),
      serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    });

    const summary = await runScoring({
      db,
      claude: {
        apiKey: requireEnv('ANTHROPIC_API_KEY'),
        workspaceId: requireEnv('ANTHROPIC_WORKSPACE_ID'),
        model: 'claude-sonnet-5',
      },
      limit: readOption(body, 'limit', DEFAULT_LIMIT, MAX_LIMIT),
      concurrency: readOption(body, 'concurrency', DEFAULT_CONCURRENCY, MAX_CONCURRENCY),
      dryRun: readDryRun(body),
    });

    // Un 200 avec `writeFailures > 0` ferait enregistrer un succes au cron
    // alors que des jugements payes ont ete perdus. C'est le seul signal qui
    // avertit d'un probleme d'ecriture. Le resume complet reste dans le corps
    // pour rester diagnosticable.
    const status = summary.writeFailures > 0 ? 500 : 200;
    return Response.json(summary, { status });
  } catch (cause) {
    return Response.json({ error: String(cause) }, { status: 500 });
  }
});
