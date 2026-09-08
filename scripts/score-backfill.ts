import { createDbClient } from '../supabase/functions/_shared/db.ts';
import { runScoring } from '../supabase/functions/_shared/run-scoring.ts';
import { log } from '../supabase/functions/_shared/logger.ts';

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`variable d'environnement manquante : ${name}`);
  return value;
}

const db = createDbClient({
  url: requireEnv('SUPABASE_URL'),
  serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
});

const claude = {
  apiKey: requireEnv('ANTHROPIC_API_KEY'),
  workspaceId: requireEnv('ANTHROPIC_WORKSPACE_ID'),
  model: 'claude-sonnet-5',
};

/**
 * Fusible : nombre maximal de lots, quoi qu'il arrive.
 *
 * Le corpus courant est de 1 269 offres, soit ~26 lots de 50 : 60 lots en
 * couvrent 2,4 fois la taille, donc cette borne ne peut pas interrompre un
 * amorçage legitime. Elle couvre tout mode de non-progression AUTRE que
 * l'echec d'ecriture (traite juste en dessous) : derive de schema, filtre de
 * selection devenu toujours vrai, offre qui revient sans jamais sortir de la
 * file. Une boucle qui DEPENSE de l'argent doit avoir une borne absolue,
 * toujours — la condition d'arret metier ne suffit pas.
 */
const MAX_BATCHES = 60;

// L'amorçage n'est pas un mode : c'est le meme appel relance jusqu'a
// epuisement de la file. Une coupure ne coute que le lot en cours.
const totals = {
  scored: 0,
  failed: 0,
  writeFailures: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
};
let lot = 0;

async function main(): Promise<void> {
  while (true) {
    const summary = await runScoring({ db, claude, limit: 50, concurrency: 4, dryRun: false });
    if (summary.candidates === 0) break;

    lot += 1;
    totals.scored += summary.scored;
    totals.failed += summary.failed;
    totals.writeFailures += summary.writeFailures;
    totals.inputTokens += summary.inputTokens;
    totals.outputTokens += summary.outputTokens;
    totals.cacheReadTokens += summary.cacheReadTokens;
    log('info', `lot ${lot} termine`, summary);

    // Arret immediat et bruyant des la PREMIERE ligne perdue.
    //
    // `summary.candidates` compte les offres SELECTIONNEES, pas ECRITES. Une
    // ecriture qui echoue ne leve pas : `runScoring` la compte dans
    // `writeFailures` et rend quand meme un resume. L'offre garde alors un
    // `scored_prompt_version` a null, la vue `offers_ai_candidates` la
    // reselectionne au tour suivant, et la boucle repaie eternellement le meme
    // lot — mesure a ~16 EUR/heure sans la moindre progression, avec un
    // journal qui ressemble a du progres (~130 EUR au matin, base vide).
    //
    // Le declencheur le plus plausible est une panne PARTIELLE :
    // `SUPABASE_SERVICE_ROLE_KEY` renseignee avec la clef `anon` (deux JWT
    // visuellement identiques dans .env.local) — les lectures passent, RLS
    // refuse les ecritures. Rien ne leve non plus cote client : postgrest-js
    // rend TOUTE erreur (RLS, verrou, timeout, DNS, coupure reseau) en valeur
    // de retour, `shouldThrowOnError` n'etant pas active.
    //
    // Le seuil est strict (> 0, pas « tout le lot ») : une perte partielle
    // fait bien avancer la file, mais elle signifie qu'un jugement DEJA PAYE
    // est parti a la poubelle. Sur un script qui depense, ça merite un humain,
    // pas une reprise silencieuse.
    if (summary.writeFailures > 0) {
      log('error', `arret au lot ${lot} : des scores payes n'ont pas ete ecrits en base`, {
        lot,
        writeFailuresDuLot: summary.writeFailures,
        candidatsDuLot: summary.candidates,
        totals,
      });
      throw new Error(
        `lot ${lot} : ${summary.writeFailures} ligne(s) jugee(s) et payee(s) n'ont pas ete ` +
          `ecrites en base. Ces offres seront reselectionnees et repayees au prochain tour : ` +
          `verifier SUPABASE_SERVICE_ROLE_KEY (clef service_role, pas anon), RLS et l'etat de ` +
          `la base avant de relancer.`,
      );
    }

    if (lot >= MAX_BATCHES) {
      log('error', `arret : borne de ${MAX_BATCHES} lots atteinte sans epuiser la file`, {
        lot,
        totals,
      });
      throw new Error(
        `borne de securite atteinte : ${MAX_BATCHES} lots de 50 (soit 2,4 fois le corpus) sans ` +
          `que la file ne se vide. La selection ne progresse pas ; inspecter ` +
          `offers_ai_candidates avant de relancer.`,
      );
    }
  }

  log('info', 'amorcage termine', totals);
}

try {
  await main();
} catch (cause) {
  // Sortie en code non nul : un amorçage interrompu ne doit pas passer pour un
  // succes aupres de l'appelant (shell, Planificateur Windows, CI).
  log('error', 'amorcage interrompu', { cause: String(cause), totals });
  Deno.exit(1);
}
