import { createDbClient } from '../supabase/functions/_shared/db.ts';
import { runScoring } from '../supabase/functions/_shared/run-scoring.ts';
import { runBackfill } from '../supabase/functions/_shared/run-backfill.ts';
import { log } from '../supabase/functions/_shared/logger.ts';

/**
 * Ce fichier ne contient plus que le cablage : lecture de l'environnement,
 * construction du client, appel de la boucle, code de sortie. Toute la logique
 * — les trois fusibles qui empechent une boucle payante de tourner sans
 * avancer — vit dans `_shared/run-backfill.ts`, ou elle est testable sans
 * environnement ni client de base (`__tests__/run-backfill_test.ts`).
 */

/** Lecture de l'environnement : propre a Deno, donc hors de _shared/. */
function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`variable d'environnement manquante : ${name}`);
  return value;
}

/**
 * Le corpus courant est de 1 269 offres, soit ~26 lots de 50 : 60 lots en
 * couvrent 2,4 fois la taille, donc cette borne ne peut pas interrompre un
 * amorçage legitime.
 */
const MAX_BATCHES = 60;

const BATCH_SIZE = 50;

/**
 * Concurrence de l'amorçage. Contrairement au cron, le cache de prompt reste
 * CHAUD ici : les lots s'enchainent sans interruption, donc seule la toute
 * premiere vague paie la prime d'ecriture du cache. Voir le commentaire de
 * `DEFAULT_CONCURRENCY` dans `score-offers/index.ts` pour le cas inverse.
 */
const CONCURRENCY = 4;

/**
 * Drapeau explicite, absent par defaut : sans lui, l'amorçage se comporte
 * comme le cron — il ignore les offres dont seul le `profile_version` a
 * change (import de CV). Le passer demande le rejugement DELIBERE et PAYANT
 * du corpus deja juge sous un profil perime (~1 centime/offre, potentiellement
 * tout le corpus) — l'operation que `CLAUDE.md` decrit comme volontaire.
 * Usage : `npm run score:backfill -- --rejudge-stale-profile`.
 */
const REJUDGE_STALE_PROFILE_FLAG = '--rejudge-stale-profile';
const includeStaleProfile = Deno.args.includes(REJUDGE_STALE_PROFILE_FLAG);

const db = createDbClient({
  url: requireEnv('SUPABASE_URL'),
  serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
});

const claude = {
  apiKey: requireEnv('ANTHROPIC_API_KEY'),
  workspaceId: requireEnv('ANTHROPIC_WORKSPACE_ID'),
  model: 'claude-sonnet-5',
};

if (includeStaleProfile) {
  log(
    'warn',
    'rejugement du profil demande explicitement : offres au profile_version perime incluses, ce lot les repaie',
    {
      flag: REJUDGE_STALE_PROFILE_FLAG,
    },
  );
}

try {
  await runBackfill({
    runScoring: () =>
      runScoring({
        db,
        claude,
        limit: BATCH_SIZE,
        concurrency: CONCURRENCY,
        dryRun: false,
        includeStaleProfile,
      }),
    log,
    maxBatches: MAX_BATCHES,
  });
} catch (cause) {
  // Sortie en code non nul : un amorçage interrompu ne doit pas passer pour un
  // succes aupres de l'appelant (shell, Planificateur Windows, CI). Les
  // cumuls au moment de l'arret sont deja dans la ligne d'erreur emise par
  // `runBackfill`, qui seule les connait.
  log('error', 'amorcage interrompu', { cause: String(cause) });
  Deno.exit(1);
}
