import type { ScoringSummary } from './run-scoring.ts';
import type { LogLevel } from './logger.ts';

/**
 * Cumul de l'amorçage. `batches` compte les lots REELLEMENT traites : le tour
 * qui constate la file vide n'en est pas un.
 */
export interface BackfillTotals {
  batches: number;
  scored: number;
  failed: number;
  writeFailures: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

/**
 * Tout ce dont la boucle a besoin, reçu en parametre.
 *
 * Aucune lecture d'environnement, aucun client de base, aucun acces au
 * runtime : ce fichier respecte la neutralite de `_shared/`, et c'est aussi
 * ce qui le rend testable. Les fusibles ci-dessous protegent d'une boucle qui DEPENSE
 * de l'argent ; les laisser au niveau module d'un script — donc hors de portee
 * de tout test, puisque l'importer lirait l'environnement et pourrait tuer le
 * processus de test — reviendrait a ne les couvrir que par `deno check` et
 * `deno lint`. Une regression (un `>` devenu `>=`, un increment de lot
 * deplace, un `break` remis avant les cumuls) passerait alors la porte unique
 * sans rien casser de visible.
 */
export interface BackfillDeps {
  /** Un tour de scoring. Injectable : les tests n'appellent ni base ni API. */
  runScoring: () => Promise<ScoringSummary>;
  log: (level: LogLevel, message: string, data?: unknown) => void;
  /** Fusible absolu : nombre maximal de lots, quoi qu'il arrive. */
  maxBatches: number;
}

/**
 * L'amorçage n'est pas un mode : c'est le meme appel `runScoring` relance
 * jusqu'a epuisement de la file. Une coupure ne coute que le lot en cours.
 *
 * Les trois arrets ci-dessous sont des FUSIBLES, pas des branches de mode :
 * chacun leve, et l'appelant sort en code non nul.
 */
export async function runBackfill(deps: BackfillDeps): Promise<BackfillTotals> {
  const totals: BackfillTotals = {
    batches: 0,
    scored: 0,
    failed: 0,
    writeFailures: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
  };

  while (true) {
    const summary = await deps.runScoring();
    if (summary.candidates === 0) break;

    totals.batches += 1;
    totals.scored += summary.scored;
    totals.failed += summary.failed;
    totals.writeFailures += summary.writeFailures;
    totals.inputTokens += summary.inputTokens;
    totals.outputTokens += summary.outputTokens;
    totals.cacheReadTokens += summary.cacheReadTokens;
    deps.log('info', `lot ${totals.batches} termine`, summary);

    // ---- Fusible 1 : arret des la PREMIERE ligne perdue a l'ecriture. ----
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
      deps.log('error', `arret au lot ${totals.batches} : des scores payes non ecrits`, {
        lot: totals.batches,
        writeFailuresDuLot: summary.writeFailures,
        candidatsDuLot: summary.candidates,
        totals,
      });
      throw new Error(
        `lot ${totals.batches} : ${summary.writeFailures} ligne(s) jugee(s) et payee(s) n'ont ` +
          `pas ete ecrites en base. Ces offres seront reselectionnees et repayees au prochain ` +
          `tour : verifier SUPABASE_SERVICE_ROLE_KEY (clef service_role, pas anon), RLS et ` +
          `l'etat de la base avant de relancer.`,
      );
    }

    // ---- Fusible 2 : arret quand TOUT un lot echoue au jugement. ----
    //
    // Symetrique du precedent, pour le mode d'echec qu'il ne voit pas. Avec
    // une `ANTHROPIC_API_KEY` invalide, chaque offre echoue : `writeFailures`
    // vaut 0 (les lignes d'ERREUR, elles, s'ecrivent tres bien) et le fusible
    // 1 ne se declenche jamais. Or ces lignes portent les versions courantes
    // de prompt et de profil, donc les offres SORTENT definitivement de
    // `offers_ai_candidates` jusqu'a un changement de version : un amorçage
    // lance avec une clef morte marquerait les ~1 269 offres « en erreur » en
    // ~26 lots, afficherait « amorcage termine » et sortirait en 0. Un succes
    // rapporte sur une base cassee — exactement ce que le fusible 1 visait.
    //
    // Seuil retenu : `failed === candidates`, PAS `failed > candidates / 2`.
    //   - Des echecs isoles sont NORMAUX et deja geres (jugement malforme, 529
    //     sur un appel) : la ligne d'erreur les sort de la file, la file
    //     progresse, rien ne justifie de reveiller un humain.
    //   - Une surcharge transitoire cote API arrive par rafales et peut
    //     toucher plusieurs appels concurrents a la fois. Un seuil a la moitie
    //     du lot se declencherait sur ce bruit-la et rendrait le script
    //     inutilisable, sans qu'aucun reglage ne soit en cause.
    //   - Un lot ENTIER qui echoue, en revanche, n'est pas plausiblement du
    //     bruit : c'est systemique (clef morte ou revoquee, workspace faux,
    //     modele refuse, reseau coupe, schema rejete). Le fusible se declenche
    //     alors des le PREMIER lot — ~50 offres marquees en erreur, pas 1 269.
    // Le cout d'un faux negatif est borne : un demi-lot qui echoue laisse
    // l'autre moitie progresser, ce qui reste un amorçage qui avance.
    if (summary.failed === summary.candidates) {
      deps.log('error', `arret au lot ${totals.batches} : aucune offre du lot n'a ete jugee`, {
        lot: totals.batches,
        failedDuLot: summary.failed,
        candidatsDuLot: summary.candidates,
        totals,
      });
      throw new Error(
        `lot ${totals.batches} : les ${summary.failed} offres du lot ont echoue au jugement. ` +
          `Une ligne d'erreur a ete ecrite pour chacune, donc elles sortent de ` +
          `offers_ai_candidates jusqu'a un changement de version de prompt ou de profil. ` +
          `Cause systemique probable : verifier ANTHROPIC_API_KEY, ANTHROPIC_WORKSPACE_ID, le ` +
          `nom du modele et le journal des offres non jugees avant de relancer.`,
      );
    }

    // ---- Fusible 3 : borne absolue de lots. ----
    //
    // Couvre tout mode de non-progression AUTRE que les deux ci-dessus :
    // derive de schema, filtre de selection devenu toujours vrai, offre qui
    // revient sans jamais sortir de la file. Une boucle qui DEPENSE de
    // l'argent doit avoir une borne absolue, toujours — la condition d'arret
    // metier ne suffit pas.
    if (totals.batches >= deps.maxBatches) {
      deps.log('error', `arret : borne de ${deps.maxBatches} lots atteinte`, {
        lot: totals.batches,
        totals,
      });
      throw new Error(
        `borne de securite atteinte : ${deps.maxBatches} lots sans que la file ne se vide. ` +
          `La selection ne progresse pas ; inspecter offers_ai_candidates avant de relancer.`,
      );
    }
  }

  deps.log('info', 'amorcage termine', totals);
  return totals;
}
