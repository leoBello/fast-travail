import { createDbClient } from '../_shared/db.ts';
import { runCollection } from '../_shared/run-collection.ts';
import type { CollectionMode, RunTrigger, SearchQueryRow } from '../_shared/types.ts';
import { fetchAllAdzunaPages } from './client.ts';
import { mapAdzunaOffer, provenanceOf } from './mapper.ts';

interface RequestBody {
  mode?: CollectionMode;
  trigger?: RunTrigger;
  dryRun?: boolean;
  queryIds?: number[];
}

/** Lecture de l'environnement : propre à Deno, donc hors de _shared/. */
function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`variable d'environnement manquante : ${name}`);
  return value;
}

Deno.serve(async (req) => {
  const body: RequestBody = await req.json().catch(() => ({}));
  const mode: CollectionMode = body.mode === 'backfill' ? 'backfill' : 'delta';
  const trigger: RunTrigger = body.trigger === 'cron' ? 'cron' : 'manual';
  const dryRun = body.dryRun === true;

  const db = createDbClient({
    url: requireEnv('SUPABASE_URL'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  });

  const cfg = {
    appId: requireEnv('ADZUNA_APP_ID'),
    appKey: requireEnv('ADZUNA_APP_KEY'),
  };

  let queryBuilder = db
    .from('search_queries')
    .select('*')
    .eq('source', 'adzuna')
    .eq('enabled', true)
    .order('priority', { ascending: true });

  if (body.queryIds?.length) queryBuilder = queryBuilder.in('id', body.queryIds);

  const { data, error } = await queryBuilder;
  if (error) {
    return Response.json({ error: `lecture des requêtes : ${error.message}` }, { status: 500 });
  }

  const queries = (data ?? []) as SearchQueryRow[];
  if (queries.length === 0) {
    return Response.json({ error: 'aucune requête active pour adzuna' }, { status: 400 });
  }

  const summary = await runCollection({
    db,
    source: 'adzuna',
    mode,
    trigger,
    dryRun,
    queries,
    fetchAll: (query) => fetchAllAdzunaPages({ cfg, query, mode }),
    map: (raw, query) => mapAdzunaOffer(raw, provenanceOf(query)),
  });

  return Response.json(summary);
});
