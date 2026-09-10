import { assertEquals, assertRejects } from '@std/assert';
import { runScoring, WRITE_CHUNK_SIZE } from '../run-scoring.ts';
import type { DbClient } from '../db.ts';
import { ClaudeApiError, type ClaudeResult } from '../claude.ts';
import type { LogLevel } from '../logger.ts';
import { PROMPT_VERSION } from '../scoring-prompt.ts';
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
  /** Dernier filtre `.or(...)` passe a `offers_ai_candidates` (voir C1). */
  orFilter: string | null;
}

interface FakeDbOptions {
  /** Remplace le profil actif par defaut (utile pour la profile_version). */
  profileVersion?: string;
  /** Simule le resultat d'un upsert ; par defaut, toujours un succes. */
  onUpsert?: (rows: Record<string, unknown>[]) => { error: { message: string } | null };
}

/**
 * Simule (a minima) la semantique de `.or()` de PostgREST pour les champs
 * utilises ici : chaque condition est `champ.op.valeur`, separees par des
 * virgules et combinees en OU. Sans ça, un test qui passe un `includeStaleProfile`
 * different ne verifierait que le libelle du filtre, jamais son EFFET — ce
 * qui est exactement le point de C1.
 */
function applyOrFilter(rows: OfferToScore[], filter: string): OfferToScore[] {
  const conditions = filter.split(',').map((c) => {
    const [field, op, value] = c.split('.');
    return { field: field as keyof OfferToScore, op, value };
  });
  return rows.filter((row) =>
    conditions.some(({ field, op, value }) => {
      const actual = row[field];
      if (op === 'is') return value === 'null' ? actual === null : false;
      if (op === 'neq') return actual !== value;
      return false;
    })
  );
}

function fakeDb(
  candidates: OfferToScore[],
  opts: FakeDbOptions = {},
): { db: DbClient; rec: Recorded } {
  const rec: Recorded = { upserts: [], orFilter: null };
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
                    profile_version: opts.profileVersion ?? 'cv-1',
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
            or: (filter: string) => {
              rec.orFilter = filter;
              return {
                order: () => ({
                  limit: () =>
                    Promise.resolve({ data: applyOrFilter(candidates, filter), error: null }),
                }),
              };
            },
          }),
        };
      }
      if (table === 'offer_ai_scores') {
        return {
          upsert(rows: Record<string, unknown>[]) {
            rec.upserts.push(rows);
            return Promise.resolve(opts.onUpsert ? opts.onUpsert(rows) : { error: null });
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

Deno.test('un echec PERMANENT est compte et porte son erreur, sans arreter le lot', async () => {
  // L'exemple d'echec permanent etait « sortie structuree illisible » sur un
  // 200. Il a change le 2026-09-10 : cette classe est passee REJOUABLE, la
  // mesure ayant montre que 18 offres sur 18 se jugeaient sans erreur au
  // deuxieme essai, texte inchange (P31 dans ETAT.md). Le refus prend sa
  // place — c'est desormais le seul echec permanent qui porte un 200, et il
  // se signale par le drapeau, pas par le statut.
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
        ? Promise.reject(new ClaudeApiError('refus du modele', 200, true))
        : Promise.resolve(judgement(70));
    },
  });

  assertEquals(summary.scored, 1);
  assertEquals(summary.failed, 1);
  assertEquals(summary.failedPermanent, 1);
  assertEquals(summary.failedRetryable, 0);
  const enEchec = rec.upserts[0].find((r) => r.error !== null);
  assertEquals(typeof enEchec?.error, 'string');
  assertEquals(enEchec?.fit_score, null);
});

Deno.test('un echec REJOUABLE n ecrit AUCUNE ligne : l offre reste candidate', async () => {
  // Le defaut corrige : une ligne d'erreur porte les versions courantes, ce
  // qui sort l'offre de offers_ai_candidates pour toujours. Une surcharge de
  // trois secondes condamnait donc definitivement les offres en vol.
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
        ? Promise.reject(new ClaudeApiError('Claude a repondu 529 : surcharge', 529))
        : Promise.resolve(judgement(70));
    },
  });

  assertEquals(summary.scored, 1);
  assertEquals(summary.failed, 1);
  assertEquals(summary.failedRetryable, 1);
  assertEquals(summary.failedPermanent, 0);
  // Une seule ligne ecrite : celle qui a ete jugee. Rien pour l'offre en echec.
  const lignes = rec.upserts.flat();
  assertEquals(lignes.length, 1);
  assertEquals(lignes[0].offer_id, 'b');
});

Deno.test('un echec reseau (pas une ClaudeApiError) est traite comme rejouable', async () => {
  const { db, rec } = fakeDb([candidate('a')]);
  const summary = await runScoring({
    db,
    claude,
    limit: 10,
    concurrency: 1,
    dryRun: false,
    callClaude: () => Promise.reject(new TypeError('error sending request')),
  });

  assertEquals(summary.failedRetryable, 1);
  assertEquals(summary.failedPermanent, 0);
  assertEquals(rec.upserts.length, 0);
});

Deno.test('un 400 est PERMANENT : la ligne est ecrite pour ne pas bloquer la file', async () => {
  const { db, rec } = fakeDb([candidate('a')]);
  const summary = await runScoring({
    db,
    claude,
    limit: 10,
    concurrency: 1,
    dryRun: false,
    callClaude: () => Promise.reject(new ClaudeApiError('Claude a repondu 400 : schema', 400)),
  });

  assertEquals(summary.failedPermanent, 1);
  assertEquals(summary.failedRetryable, 0);
  assertEquals(rec.upserts.flat().length, 1);
});

Deno.test('un lot PLEIN journalise un avertissement de saturation', async () => {
  // `candidates === limit` : il en restait peut-etre, et le reliquat est
  // toujours fait des offres les PLUS ANCIENNES, que la collecte du lendemain
  // repousse encore. Sans ce signal, le resume est indiscernable d'une
  // journee entierement traitee.
  const lignes: { level: LogLevel; message: string }[] = [];
  const original = console.warn;
  console.warn = (text: string) => {
    lignes.push(JSON.parse(text) as { level: LogLevel; message: string });
  };
  try {
    const { db } = fakeDb([candidate('a'), candidate('b')]);
    const summary = await runScoring({
      db,
      claude,
      limit: 2,
      concurrency: 2,
      dryRun: false,
      callClaude: () => Promise.resolve(judgement(80)),
    });
    assertEquals(summary.candidates, 2);
  } finally {
    console.warn = original;
  }

  const saturation = lignes.filter((l) => l.message.includes('lot plein'));
  assertEquals(saturation.length, 1);
  assertEquals(saturation[0].level, 'warn');
});

Deno.test('un lot NON plein ne journalise aucun avertissement de saturation', async () => {
  const lignes: { message: string }[] = [];
  const original = console.warn;
  console.warn = (text: string) => {
    lignes.push(JSON.parse(text) as { message: string });
  };
  try {
    const { db } = fakeDb([candidate('a')]);
    await runScoring({
      db,
      claude,
      limit: 60,
      concurrency: 2,
      dryRun: false,
      callClaude: () => Promise.resolve(judgement(80)),
    });
  } finally {
    console.warn = original;
  }

  assertEquals(lignes.filter((l) => l.message.includes('lot plein')).length, 0);
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

Deno.test('un lot plus grand que WRITE_CHUNK_SIZE produit plusieurs ecritures, toutes les lignes finissent ecrites', async () => {
  const total = WRITE_CHUNK_SIZE * 2 + 3;
  const candidates = Array.from({ length: total }, (_, i) => candidate(`c${i}`));
  const { db, rec } = fakeDb(candidates);

  const summary = await runScoring({
    db,
    claude,
    limit: total,
    concurrency: 4,
    dryRun: false,
    callClaude: () => Promise.resolve(judgement(80)),
  });

  assertEquals(summary.scored, total);
  assertEquals(summary.writeFailures, 0);
  // Plus d'une tranche : la preuve que l'ecriture se fait au fil de l'eau,
  // pas en un seul upsert final.
  assertEquals(rec.upserts.length > 1, true);
  const toutesLesLignes = rec.upserts.flat();
  assertEquals(toutesLesLignes.length, total);
  // Aucune ligne perdue ni ecrite deux fois : les id sont tous distincts.
  const ids = toutesLesLignes.map((r) => r.offer_id);
  assertEquals(new Set(ids).size, total);
});

Deno.test('une ecriture qui echoue est comptee dans writeFailures et n empeche pas les autres tranches d etre ecrites', async () => {
  const total = WRITE_CHUNK_SIZE * 2;
  const candidates = Array.from({ length: total }, (_, i) => candidate(`c${i}`));
  let appelsUpsert = 0;
  const { db, rec } = fakeDb(candidates, {
    onUpsert: () => {
      appelsUpsert += 1;
      return appelsUpsert === 1 ? { error: { message: 'coupure reseau' } } : { error: null };
    },
  });

  const summary = await runScoring({
    db,
    claude,
    limit: total,
    concurrency: 1,
    dryRun: false,
    callClaude: () => Promise.resolve(judgement(80)),
  });

  assertEquals(summary.scored, total);
  assertEquals(summary.failed, 0);
  assertEquals(summary.writeFailures, WRITE_CHUNK_SIZE);
  assertEquals(rec.upserts.length, 2);
});

Deno.test('une profile_version contenant une virgule casse la selection : echec bruyant, pas de filtre silencieusement faux', async () => {
  const { db } = fakeDb([candidate('a')], { profileVersion: 'cv-1,evil' });

  await assertRejects(
    () =>
      runScoring({
        db,
        claude,
        limit: 10,
        concurrency: 1,
        dryRun: false,
        callClaude: () => Promise.resolve(judgement(80)),
      }),
    Error,
    'virgule',
  );
});

// --- C1 : un changement de CV seul ne doit pas rendre le corpus candidat ---
// (revue finale de branche, phase 3). Les deux tests suivants portent sur le
// meme candidat — deja juge sous le PROMPT_VERSION courant, mais sous un
// profile_version perime — et verifient les deux sens de `includeStaleProfile`.

function staleProfileCandidate(): OfferToScore {
  return candidate('a', {
    scored_prompt_version: PROMPT_VERSION,
    scored_profile_version: 'cv-0-perime',
  });
}

Deno.test('un profile_version perime seul ne produit AUCUN candidat par defaut (cron)', async () => {
  const { db, rec } = fakeDb([staleProfileCandidate()], { profileVersion: 'cv-1' });

  const summary = await runScoring({
    db,
    claude,
    limit: 10,
    concurrency: 1,
    dryRun: false,
    callClaude: () => Promise.resolve(judgement(80)),
  });

  assertEquals(summary.candidates, 0);
  assertEquals(summary.scored, 0);
  // Le filtre envoye a PostgREST ne doit meme pas porter la condition sur
  // scored_profile_version : elle serait sans effet ici, mais son ABSENCE est
  // le point verifie (voir C1 — la condition ne doit exister qu'a la demande).
  assertEquals(rec.orFilter?.includes('scored_profile_version'), false);
});

Deno.test('le meme profile_version perime PRODUIT un candidat avec includeStaleProfile: true', async () => {
  const { db, rec } = fakeDb([staleProfileCandidate()], { profileVersion: 'cv-1' });

  const summary = await runScoring({
    db,
    claude,
    limit: 10,
    concurrency: 1,
    dryRun: false,
    includeStaleProfile: true,
    callClaude: () => Promise.resolve(judgement(80)),
  });

  assertEquals(summary.candidates, 1);
  assertEquals(summary.scored, 1);
  assertEquals(rec.orFilter?.includes('scored_profile_version.neq.cv-1'), true);
});

Deno.test('includeStaleProfile: true n altere pas l amorcage d offres jamais jugees', async () => {
  // Offre jamais jugee (scored_prompt_version null) : elle doit rester
  // selectionnee que l'option soit activee ou non — c'est le cas de
  // l'amorçage initial, que C1 ne doit pas casser.
  const { db, rec } = fakeDb([candidate('never-scored')], { profileVersion: 'cv-1' });

  const summary = await runScoring({
    db,
    claude,
    limit: 10,
    concurrency: 1,
    dryRun: false,
    includeStaleProfile: true,
    callClaude: () => Promise.resolve(judgement(80)),
  });

  assertEquals(summary.candidates, 1);
  assertEquals(rec.orFilter?.includes('scored_prompt_version.is.null'), true);
});
