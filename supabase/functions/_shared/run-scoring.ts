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
}

const MAX_TOKENS = 1024;

const defaultCallClaude: CallClaude = (cfg, systemBlocks, userText) =>
  callClaudeStructured<OfferJudgement>(cfg, {
    systemBlocks,
    userText,
    schema: JUDGEMENT_SCHEMA,
    maxTokens: MAX_TOKENS,
  });

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
  };
  if (candidates.length === 0) return summary;

  const systemBlocks = buildSystemBlocks(profile, skills);
  const rows: Record<string, unknown>[] = [];

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
        rows.push({
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
        rows.push({
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

  if (!deps.dryRun && rows.length > 0) {
    const { error } = await deps.db.from('offer_ai_scores').upsert(rows, {
      onConflict: 'offer_id',
    });
    if (error) throw new Error(`ecriture des scores : ${error.message}`);
  }

  return summary;
}
