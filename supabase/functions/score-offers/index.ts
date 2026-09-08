import { createDbClient } from '../_shared/db.ts';
import { runScoring } from '../_shared/run-scoring.ts';

interface RequestBody {
  limit?: number;
  concurrency?: number;
  dryRun?: boolean;
}

/** Lecture de l'environnement : propre a Deno, donc hors de _shared/. */
function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`variable d'environnement manquante : ${name}`);
  return value;
}

Deno.serve(async (req) => {
  const body: RequestBody = await req.json().catch(() => ({}));

  const db = createDbClient({
    url: requireEnv('SUPABASE_URL'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  });

  try {
    const summary = await runScoring({
      db,
      claude: {
        apiKey: requireEnv('ANTHROPIC_API_KEY'),
        workspaceId: requireEnv('ANTHROPIC_WORKSPACE_ID'),
        model: 'claude-sonnet-5',
      },
      // Le flux quotidien mesure ~41 offres. 120 laisse de la marge tout en
      // tenant dans les 150 s de plafond avec une concurrence de 4.
      limit: body.limit ?? 120,
      concurrency: body.concurrency ?? 4,
      dryRun: body.dryRun === true,
    });
    return Response.json(summary);
  } catch (cause) {
    return Response.json({ error: String(cause) }, { status: 500 });
  }
});
