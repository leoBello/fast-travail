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
}

log('info', 'amorcage termine', totals);
