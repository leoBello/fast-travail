import { assertEquals } from '@std/assert';
import { runScoring } from '../run-scoring.ts';
import type { DbClient } from '../db.ts';
import type { ClaudeResult } from '../claude.ts';
import type { OfferJudgement, OfferToScore } from '../scoring-types.ts';

function candidate(id: string, over: Partial<OfferToScore> = {}): OfferToScore {
  return {
    id,
    source: 'adzuna',
    title: 'Developpeur React',
    description: 'Mission React TypeScript.',
    company_name: 'ACME',
    city: 'Marseille',
    department: '13',
    remote_label: 'full',
    contract_type: 'freelance',
    contract_label: null,
    salary_raw: null,
    rate_raw: '500',
    duration_raw: '12 mois',
    experience_raw: null,
    published_at: '2026-09-01T00:00:00Z',
    truncated_input: false,
    found_by_labels: ['adzuna:local:react-ts'],
    scored_prompt_version: null,
    scored_profile_version: null,
    ...over,
  };
}

interface Recorded {
  upserts: Record<string, unknown>[][];
}

function fakeDb(candidates: OfferToScore[]): { db: DbClient; rec: Recorded } {
  const rec: Recorded = { upserts: [] };
  const db = {
    from(table: string) {
      if (table === 'candidate_profile') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    label: 'CV',
                    cv_text: 'CV de test',
                    seniority_years: 7,
                    profile_version: 'cv-1',
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === 'profile_skills') {
        return {
          select: () =>
            Promise.resolve({
              data: [
                { term: 'react', occurrences: 7, last_used_year: 2026, stance: 'core', weight: 3 },
              ],
              error: null,
            }),
        };
      }
      if (table === 'offers_ai_candidates') {
        return {
          select: () => ({
            or: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: candidates, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'offer_ai_scores') {
        return {
          upsert(rows: Record<string, unknown>[]) {
            rec.upserts.push(rows);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`table inattendue : ${table}`);
    },
  } as unknown as DbClient;
  return { db, rec };
}

const claude = { apiKey: 'k', workspaceId: 'w', model: 'claude-sonnet-5' };

// Le type de retour est explicite : sans lui, TypeScript elargit 'senior' et
// 'freelance' en `string` et le double n'est plus assignable a OfferJudgement.
function judgement(score: number): ClaudeResult<OfferJudgement> {
  return {
    value: {
      fit_score: score,
      verdict: 'Bonne correspondance React.',
      extraction: {
        stack: ['react'],
        seniority: 'senior',
        work_mode: 'full_remote',
        engagement: 'freelance',
        duration_months: 12,
        compensation_kind: 'tjm',
        compensation_min: 500,
        compensation_max: 500,
        agentic_ai: false,
        unwanted_tech: [],
        domain: 'saas',
        confidence: 'haute',
      },
    },
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadInputTokens: 90,
      cacheCreationInputTokens: 0,
    },
  };
}

Deno.test('score chaque candidat et cumule l usage', async () => {
  const { db, rec } = fakeDb([candidate('a'), candidate('b')]);
  const summary = await runScoring({
    db,
    claude,
    limit: 10,
    concurrency: 2,
    dryRun: false,
    callClaude: () => Promise.resolve(judgement(80)),
  });

  assertEquals(summary.candidates, 2);
  assertEquals(summary.scored, 2);
  assertEquals(summary.failed, 0);
  assertEquals(summary.inputTokens, 200);
  assertEquals(summary.cacheReadTokens, 180);
  assertEquals(rec.upserts.length, 1);
  assertEquals(rec.upserts[0].length, 2);
  assertEquals(rec.upserts[0][0].fit_score, 80);
});

Deno.test('une offre en echec est comptee et porte son erreur, sans arreter le lot', async () => {
  const { db, rec } = fakeDb([candidate('a'), candidate('b')]);
  let appels = 0;
  const summary = await runScoring({
    db,
    claude,
    limit: 10,
    concurrency: 1,
    dryRun: false,
    callClaude: () => {
      appels += 1;
      return appels === 1
        ? Promise.reject(new Error('529 surcharge'))
        : Promise.resolve(judgement(70));
    },
  });

  assertEquals(summary.scored, 1);
  assertEquals(summary.failed, 1);
  const enEchec = rec.upserts[0].find((r) => r.error !== null);
  assertEquals(typeof enEchec?.error, 'string');
  assertEquals(enEchec?.fit_score, null);
});

Deno.test('dryRun n ecrit rien', async () => {
  const { db, rec } = fakeDb([candidate('a')]);
  const summary = await runScoring({
    db,
    claude,
    limit: 10,
    concurrency: 1,
    dryRun: true,
    callClaude: () => Promise.resolve(judgement(90)),
  });

  assertEquals(summary.scored, 1);
  assertEquals(rec.upserts.length, 0);
});

Deno.test('aucun candidat : succes silencieux, aucun appel paye', async () => {
  const { db, rec } = fakeDb([]);
  let appels = 0;
  const summary = await runScoring({
    db,
    claude,
    limit: 10,
    concurrency: 2,
    dryRun: false,
    callClaude: () => {
      appels += 1;
      return Promise.resolve(judgement(50));
    },
  });

  assertEquals(summary.candidates, 0);
  assertEquals(summary.scored, 0);
  assertEquals(appels, 0);
  assertEquals(rec.upserts.length, 0);
});
