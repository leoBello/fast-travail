import { createDbClient } from '../_shared/db.ts';
import { runScoring } from '../_shared/run-scoring.ts';

/**
 * Defaut d'un appel SANS corps. Le cron, lui, demande explicitement 100 (voir
 * la migration 20260909050000) : ce defaut n'est donc PAS le reglage du regime
 * quotidien, et il ne faut pas le lire comme tel.
 *
 * ATTENTION — le « ~41 offres par jour » qui justifiait ce 60 etait FAUX. Il
 * venait d'une moyenne sur 31 jours, biaisee : les sources retirent les
 * annonces expirees, donc les journees anciennes sont sous-representees.
 * Remesure du 2026-09-08 sur le perimetre geographique : 40,0/jour sur 31
 * jours, mais 64,9 sur 13 jours et 77,6 sur 7 jours, avec un MAXIMUM
 * journalier de 141. 60 ne tient pas le flux ; c'est le cron qui a ete
 * corrige, pas ce defaut.
 *
 * Ce qui reste vrai et gouverne la valeur : le plafond d'execution d'une Edge
 * Function est de 150 s, un appel au modele mesure 4,71 s (cache chaud), donc
 * a concurrence 4, 60 offres font 15 tours = ~71 s. Le defaut d'avant, 120,
 * faisait 30 tours = ~141 s pour 150 s de plafond — 6 % de marge, et le
 * commentaire qui affirmait « 120 laisse de la marge » etait deja faux. Un
 * appel manuel sans corps reste donc volontairement conservateur ; demander
 * davantage se fait dans le corps, et `runScoring` avertit quand le lot est
 * plein.
 */
const DEFAULT_LIMIT = 60;

/**
 * A consigner avant de poser le cron (tache 8) : le cache de prompt est FROID
 * a chaque execution. Son TTL est de 5 minutes, et deux executions du cron
 * sont separees de 24 h. Avec une concurrence de N, les N PREMIERS appels
 * d'une vague partent donc tous sur un cache vide et paient chacun la prime
 * d'ecriture : une entree de cache ne devient lisible qu'une fois la premiere
 * reponse commencee, pas des l'emission de la requete. Sur un lot de N offres
 * a concurrence 4, cela fait 4 ecritures et N-4 lectures — pas 1 et N-1.
 * Monter la concurrence augmente donc lineairement le nombre d'ecritures de
 * cache. (Le « ~41 offres » qui illustrait ce calcul etait faux, voir
 * DEFAULT_LIMIT ; la forme du calcul ne depend pas du volume.)
 * (Pour l'amorçage local, le sujet est negligeable : les lots s'enchainent et
 * le cache reste chaud d'un lot a l'autre.)
 */
const DEFAULT_CONCURRENCY = 4;

/**
 * Bornes hautes.
 *
 * Le plafond d'execution d'une Edge Function est de 150 s, et ce qui le
 * consomme est le nombre de TOURS — `limit / concurrency` — pas le nombre
 * d'offres. Un plafond fixe sur `limit` seul ne protege donc de rien : les
 * deux valeurs se validant independamment, `{"limit":200}` sans `concurrency`
 * retombe sur le defaut 4, soit 50 tours a 4,71 s = ~236 s. Debordement.
 *
 * D'ou le couplage ci-dessous : `limit` est plafonne a
 * `concurrency * MAX_TURNS`, EN PLUS du plafond absolu `MAX_LIMIT`. A 25 tours
 * de 4,71 s = ~118 s, il reste 32 s de marge sous les 150 s.
 *
 * `MAX_LIMIT` garde son role propre : empecher qu'une coquille — `1200` au
 * lieu de `120` dans la definition du cron — n'achete tout le corpus d'un
 * coup, meme a concurrence 8 (ou le couplage autoriserait 200 tout juste).
 */
const MAX_LIMIT = 200;
const MAX_CONCURRENCY = 8;
const MAX_TURNS = 25;

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

    // `concurrency` d'abord : c'est lui qui determine le plafond de `limit`.
    const concurrency = readOption(body, 'concurrency', DEFAULT_CONCURRENCY, MAX_CONCURRENCY);
    // Le `Math.min` est EXTERIEUR a `readOption` a dessein : `readOption` rend
    // son `fallback` tel quel quand la valeur est absente ou invalide, sans le
    // plafonner. Sans ce second bornage, `{"concurrency":1}` sans `limit`
    // partirait sur DEFAULT_LIMIT = 60 offres en 60 tours, soit ~283 s.
    const limit = Math.min(
      readOption(body, 'limit', DEFAULT_LIMIT, MAX_LIMIT),
      concurrency * MAX_TURNS,
    );

    const summary = await runScoring({
      db,
      claude: {
        apiKey: requireEnv('ANTHROPIC_API_KEY'),
        workspaceId: requireEnv('ANTHROPIC_WORKSPACE_ID'),
        model: 'claude-sonnet-5',
      },
      limit,
      concurrency,
      dryRun: readDryRun(body),
    });

    // Un 200 avec `writeFailures > 0` ferait enregistrer un succes au cron
    // alors que des jugements payes ont ete perdus. C'est le seul signal qui
    // avertit d'un probleme d'ecriture. Le resume complet reste dans le corps
    // pour rester diagnosticable.
    //
    // A consigner avant de poser le cron (tache 8) : ce 500 ne fera PAS
    // echouer le job `pg_cron`. Les deux crons existants font
    // `select net.http_post(...)` ; `pg_net` est ASYNCHRONE et rend
    // immediatement un identifiant de requete, jamais une reponse. Le `select`
    // reussit donc toujours, et `cron.job_run_details` enregistre « succeeded »
    // quel que soit le statut HTTP. Celui-ci n'atterrit que dans
    // `net._http_response`, qu'il faut interroger explicitement. Le 500 reste
    // la bonne reponse — c'est le seul signal diagnosticable, et il servirait
    // a un appelant synchrone — mais quiconque comptera sur un job en echec
    // pour etre averti se trompera.
    const status = summary.writeFailures > 0 ? 500 : 200;
    return Response.json(summary, { status });
  } catch (cause) {
    return Response.json({ error: String(cause) }, { status: 500 });
  }
});
