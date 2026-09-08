import type { DbClient } from './db.ts';
import { log } from './logger.ts';
import { callClaudeStructured, type ClaudeConfig, type ClaudeResult } from './claude.ts';
import {
  buildOfferText,
  buildSystemBlocks,
  JUDGEMENT_SCHEMA,
  PROMPT_VERSION,
} from './scoring-prompt.ts';
import type {
  CandidateProfileRow,
  OfferJudgement,
  OfferToScore,
  ProfileSkillRow,
} from './scoring-types.ts';

/** Injectable pour les tests : la vraie implementation appelle l'API. */
export type CallClaude = (
  cfg: ClaudeConfig,
  systemBlocks: ReturnType<typeof buildSystemBlocks>,
  userText: string,
) => Promise<ClaudeResult<OfferJudgement>>;

export interface ScoringDeps {
  db: DbClient;
  claude: ClaudeConfig;
  limit: number;
  concurrency: number;
  /**
   * N'ecrit RIEN en base — mais appelle quand meme le modele. Ce n'est donc
   * pas un mode gratuit : chaque candidat est facture normalement, seul
   * `limit` reduit le cout d'un essai. Sert a verifier les jugements avant
   * de les laisser persister, pas a « tester sans depenser ».
   */
  dryRun: boolean;
  callClaude?: CallClaude;
}

export interface ScoringSummary {
  candidates: number;
  scored: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  /**
   * Nombre de LIGNES (pas de tranches) qu'une tranche en echec d'ecriture a
   * empeche d'atteindre la base. Un jugement deja paye et compte dans
   * `scored` peut donc ne pas etre persiste : c'est ce compteur qui le dit,
   * pour qu'un operateur sache qu'un re-passage re-payera ces lignes-la.
   */
  writeFailures: number;
}

// Mesure du 2026-09-08 sur 1 269 appels reels avec MAX_TOKENS = 1024 :
// 75 offres (5,9 %) ont echoue, toutes avec un JSON coupe en plein milieu ou
// (8 cas extremes) sans aucun bloc de texte. Releve en base sur les 1 194
// appels reussis : sortie moyenne 411 tokens, MAIS maximum exactement 1 024 —
// le plafond, atteint au token pres. La cause : `claude-sonnet-5` emet un
// bloc `thinking` AVANT le bloc `text`, et les deux puisent dans le MEME
// budget de sortie ; un appel qui reflechit beaucoup epuise les 1 024 tokens
// avant d'avoir fini son JSON, y compris pour des offres a description
// COURTE (923 caracteres en moyenne pour les echecs, contre 1 412 pour les
// reussites — ce n'est donc pas une question de taille d'offre).
//
// 8192 (x8) laisse une marge large : ~20x la sortie utile moyenne, et une
// reflexion qui epuiserait meme ce budget serait un cas tres different de
// ceux mesures (le pire cas observe consommait exactement l'ancien plafond
// de 1024, jamais plus). Un plafond plus haut que necessaire ne coute rien
// tant qu'il n'est pas atteint : Claude facture les tokens PRODUITS, pas le
// plafond declare — voir claude.ts pour la detection du cas ou meme ce
// budget elargi serait insuffisant (`stop_reason: "max_tokens"`).
const MAX_TOKENS = 8192;

/** Taille d'une tranche d'ecriture. Une coupure ne coute alors au plus que
 * cette tranche, jamais le lot entier — voir le commentaire sur `flushChunk`
 * pour la garantie de non-perte / non-doublon face a la concurrence. */
export const WRITE_CHUNK_SIZE = 25;

const defaultCallClaude: CallClaude = (cfg, systemBlocks, userText) =>
  callClaudeStructured<OfferJudgement>(cfg, {
    systemBlocks,
    userText,
    schema: JUDGEMENT_SCHEMA,
    maxTokens: MAX_TOKENS,
  });

/**
 * `.or()` de PostgREST separe ses conditions par une virgule : une valeur
 * interpolee qui en contient une romprait la syntaxe du filtre SANS erreur
 * visible — PostgREST verrait juste une condition de plus, ni trop large ni
 * trop stricte de façon evidente. Selon la forme exacte, ça ferait soit
 * reselectionner (et repayer) tout le corpus, soit ne plus rien scorer.
 * Mieux vaut un plantage bruyant ici qu'un silence couteux en base.
 */
function assertSafeForOrFilter(value: string, label: string): void {
  if (value.includes(',')) {
    throw new Error(
      `${label} contient une virgule ("${value}"), ce qui casserait le filtre .or() de ` +
        `PostgREST (la virgule y separe les conditions). Choisir une valeur sans virgule ` +
        `avant de relancer le scoring.`,
    );
  }
}

/**
 * Scoring idempotent et reprenable. Il n'y a pas de « mode backfill » : la
 * selection est « les offres eligibles pas encore jugees DANS LA VERSION
 * COURANTE du prompt et du profil ». Relancer jusqu'a ce que `candidates`
 * rende 0 amorce tout le corpus, et une coupure ne coute que le lot en cours.
 */
export async function runScoring(deps: ScoringDeps): Promise<ScoringSummary> {
  const call = deps.callClaude ?? defaultCallClaude;

  const { data: profileRow, error: profileError } = await deps.db
    .from('candidate_profile')
    .select('label, cv_text, seniority_years, profile_version')
    .eq('is_active', true)
    .single();
  if (profileError || !profileRow) {
    throw new Error(`profil actif introuvable : ${profileError?.message ?? 'aucune ligne'}`);
  }
  const profile = profileRow as CandidateProfileRow;

  const { data: skillRows, error: skillsError } = await deps.db
    .from('profile_skills')
    .select('term, occurrences, last_used_year, stance, weight');
  if (skillsError) throw new Error(`lecture des competences : ${skillsError.message}`);
  const skills = (skillRows ?? []) as ProfileSkillRow[];

  assertSafeForOrFilter(PROMPT_VERSION, 'PROMPT_VERSION');
  assertSafeForOrFilter(profile.profile_version, 'candidate_profile.profile_version');

  const { data: candidateRows, error: candidatesError } = await deps.db
    .from('offers_ai_candidates')
    .select('*')
    .or(
      `scored_prompt_version.is.null,scored_prompt_version.neq.${PROMPT_VERSION},` +
        `scored_profile_version.neq.${profile.profile_version}`,
    )
    .order('published_at', { ascending: false })
    .limit(deps.limit);
  if (candidatesError) throw new Error(`lecture des candidats : ${candidatesError.message}`);

  const candidates = (candidateRows ?? []) as OfferToScore[];
  const summary: ScoringSummary = {
    candidates: candidates.length,
    scored: 0,
    failed: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    writeFailures: 0,
  };
  if (candidates.length === 0) return summary;

  const systemBlocks = buildSystemBlocks(profile, skills);

  // Tampon partage entre les workers. Vide par tranches de WRITE_CHUNK_SIZE
  // au fil de l'eau plutot qu'en un seul upsert final : une coupure ne coute
  // alors au plus qu'une tranche, jamais le lot entier.
  const buffer: Record<string, unknown>[] = [];
  const pendingWrites: Promise<void>[] = [];

  // Ecrit une tranche. Un echec est journalise et compte en LIGNES dans
  // `writeFailures`, sans lever : une tranche perdue ne doit pas empecher les
  // suivantes d'etre ecrites. N'est jamais appelee en dryRun (voir `pushRow`).
  const flushChunk = (chunk: Record<string, unknown>[]): void => {
    if (chunk.length === 0) return;
    pendingWrites.push(
      Promise.resolve(
        deps.db.from('offer_ai_scores').upsert(chunk, { onConflict: 'offer_id' }),
      ).then(({ error }) => {
        if (error) {
          summary.writeFailures += chunk.length;
          log('error', 'echec d ecriture d une tranche de scores', {
            count: chunk.length,
            cause: error.message,
          });
        }
      }),
    );
  };

  // Pousse une ligne jugee dans le tampon, et declenche l'ecriture de la
  // tranche des qu'elle atteint WRITE_CHUNK_SIZE.
  //
  // Surete face a la concurrence : plusieurs `worker()` appellent `pushRow`
  // en parallele logique, mais JavaScript est mono-thread — un worker ne
  // cede la main qu'a un `await`. Le corps de `pushRow` (push, test de
  // taille, `splice`) ne contient AUCUN `await` : il s'execute donc en
  // entier avant qu'un autre worker ne puisse toucher `buffer`. Deux workers
  // ne peuvent donc jamais lire la meme longueur ni `splice` la meme ligne :
  // chaque ligne poussee est videe exactement une fois — jamais perdue,
  // jamais doublee. Si ce code bouge, garder l'invariant : ne jamais inserer
  // d'`await` entre le `push` et le `splice`.
  const pushRow = (row: Record<string, unknown>): void => {
    if (deps.dryRun) return;
    buffer.push(row);
    if (buffer.length >= WRITE_CHUNK_SIZE) {
      flushChunk(buffer.splice(0, WRITE_CHUNK_SIZE));
    }
  };

  // Un appel par offre : un lot partagerait un contexte, et une offre
  // contaminerait le jugement de la suivante. La concurrence remplace le lot.
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < candidates.length) {
      const offer = candidates[next++];
      const base = {
        offer_id: offer.id,
        truncated_input: offer.truncated_input,
        model: deps.claude.model,
        prompt_version: PROMPT_VERSION,
        profile_version: profile.profile_version,
        scored_at: new Date().toISOString(),
      };
      try {
        const result = await call(deps.claude, systemBlocks, buildOfferText(offer));
        summary.scored += 1;
        summary.inputTokens += result.usage.inputTokens;
        summary.outputTokens += result.usage.outputTokens;
        summary.cacheReadTokens += result.usage.cacheReadInputTokens;
        pushRow({
          ...base,
          fit_score: result.value.fit_score,
          verdict: result.value.verdict,
          extraction: result.value.extraction,
          input_tokens: result.usage.inputTokens,
          output_tokens: result.usage.outputTokens,
          cache_read_tokens: result.usage.cacheReadInputTokens,
          error: null,
        });
      } catch (cause) {
        summary.failed += 1;
        log('warn', 'offre non jugee', { offerId: offer.id, cause: String(cause) });
        // La ligne est ecrite quand meme : sans elle, l'offre reviendrait a
        // chaque passage et un echec permanent bloquerait la file. Avec elle,
        // l'offre sort de la selection jusqu'au prochain changement de version.
        pushRow({
          ...base,
          fit_score: null,
          verdict: null,
          extraction: null,
          input_tokens: 0,
          output_tokens: 0,
          cache_read_tokens: 0,
          error: String(cause),
        });
      }
    }
  };

  const workers = Math.max(1, Math.min(deps.concurrency, candidates.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));

  // Tous les workers sont termines : `buffer` ne bouge plus, le reliquat se
  // vide sans concurrence a gerer.
  flushChunk(buffer.splice(0, buffer.length));
  await Promise.all(pendingWrites);

  return summary;
}
