import type { DbClient } from './db.ts';
import type { CollectionMode, RunStatus, RunTrigger, SourceKey } from './types.ts';

export async function startRun(
  db: DbClient,
  args: { source: SourceKey; trigger: RunTrigger; mode: CollectionMode },
): Promise<string> {
  const { data, error } = await db
    .from('collection_runs')
    .insert({ source: args.source, trigger: args.trigger, mode: args.mode })
    .select('id')
    .single();

  if (error) throw new Error(`ouverture du run : ${error.message}`);
  return (data as { id: string }).id;
}

export async function finishRun(
  db: DbClient,
  runId: string,
  args: {
    status: RunStatus;
    offersNew: number;
    offersUpdated: number;
    error?: string | null;
  },
): Promise<void> {
  const { error } = await db
    .from('collection_runs')
    .update({
      status: args.status,
      offers_new: args.offersNew,
      offers_updated: args.offersUpdated,
      error: args.error ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId);

  if (error) throw new Error(`clôture du run : ${error.message}`);
}

export interface QueryResultRow {
  query_id?: number | null;
  unit_label: string;
  http_status?: number | null;
  total_available?: number | null;
  fetched?: number | null;
  new_offers?: number | null;
  updated_offers?: number | null;
  truncated?: boolean | null;
  duration_ms?: number | null;
  error?: string | null;
}

/**
 * Écrit une ligne de télémétrie. N'échoue jamais bruyamment : perdre une ligne
 * de télémétrie ne doit pas faire échouer une collecte réussie.
 */
export async function recordQueryResult(
  db: DbClient,
  runId: string,
  row: QueryResultRow,
): Promise<void> {
  const { error } = await db
    .from('collection_query_results')
    .insert({ run_id: runId, ...row });

  if (error) console.error(`télémétrie non enregistrée : ${error.message}`);
}
