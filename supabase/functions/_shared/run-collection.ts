import type { DbClient } from './db.ts';
import { log } from './logger.ts';
import { finishRun, recordQueryResult, startRun } from './run-tracker.ts';
import { upsertOffers } from './upsert.ts';
import type {
  CollectionMode,
  NormalizedOffer,
  RunStatus,
  RunTrigger,
  SearchQueryRow,
  SourceKey,
} from './types.ts';

/** Nombre d'offres renvoyées en exemple dans une réponse dryRun. */
const PREVIEW_PER_QUERY = 3;

/** Ce que chaque source doit renvoyer, quelle que soit son API ou son HTML. */
export interface FetchResult {
  offers: unknown[];
  totalAvailable: number | null;
  truncated?: boolean;
  httpStatus: number;
}

export interface QueryReportLine {
  query_id: number | null;
  unit_label: string;
  http_status: number | null;
  total_available: number | null;
  fetched: number;
  new_offers: number;
  updated_offers: number;
  truncated: boolean;
  duration_ms: number;
  error: string | null;
}

export interface CollectionSummary {
  runId: string | null;
  mode: CollectionMode;
  dryRun: boolean;
  status: RunStatus;
  offersNew: number;
  offersUpdated: number;
  queries: QueryReportLine[];
  preview?: NormalizedOffer[];
}

export interface RunCollectionOptions {
  db: DbClient;
  source: SourceKey;
  mode: CollectionMode;
  trigger: RunTrigger;
  dryRun: boolean;
  queries: SearchQueryRow[];
  fetchAll: (query: SearchQueryRow) => Promise<FetchResult>;
  map: (raw: unknown, query: SearchQueryRow) => NormalizedOffer | null;
}

/**
 * Boucle de collecte commune à toutes les sources.
 *
 * Garanties :
 *  - une unité de collecte en échec n'interrompt jamais les suivantes ;
 *  - tout échec est écrit dans collection_query_results, jamais avalé ;
 *  - en dryRun, aucune écriture : ni run, ni offre, ni télémétrie.
 */
export async function runCollection(opts: RunCollectionOptions): Promise<CollectionSummary> {
  const { db, source, mode, trigger, dryRun, queries } = opts;

  const runId = dryRun ? null : await startRun(db, { source, trigger, mode });

  let offersNew = 0;
  let offersUpdated = 0;
  let failures = 0;
  const report: QueryReportLine[] = [];
  const preview: NormalizedOffer[] = [];

  for (const query of queries) {
    const startedAt = Date.now();
    try {
      const page = await opts.fetchAll(query);
      const mapped = page.offers
        .map((raw) => opts.map(raw, query))
        .filter((offer): offer is NormalizedOffer => offer !== null);

      let counts = { new: 0, updated: 0 };
      if (dryRun) preview.push(...mapped.slice(0, PREVIEW_PER_QUERY));
      else counts = await upsertOffers(db, mapped);

      offersNew += counts.new;
      offersUpdated += counts.updated;

      const line: QueryReportLine = {
        query_id: query.id,
        unit_label: query.label,
        http_status: page.httpStatus,
        total_available: page.totalAvailable,
        fetched: mapped.length,
        new_offers: counts.new,
        updated_offers: counts.updated,
        truncated: page.truncated === true,
        duration_ms: Date.now() - startedAt,
        error: null,
      };
      report.push(line);
      if (runId) await recordQueryResult(db, runId, line);

      if (line.truncated) {
        log('warn', 'unité de collecte tronquée par le plafond de la source', {
          source,
          label: query.label,
          total: page.totalAvailable,
        });
      }
    } catch (e) {
      failures += 1;
      const message = e instanceof Error ? e.message : String(e);
      const line: QueryReportLine = {
        query_id: query.id,
        unit_label: query.label,
        http_status: null,
        total_available: null,
        fetched: 0,
        new_offers: 0,
        updated_offers: 0,
        truncated: false,
        duration_ms: Date.now() - startedAt,
        error: message,
      };
      report.push(line);
      if (runId) await recordQueryResult(db, runId, line);
      log('error', 'unité de collecte en échec', { source, label: query.label, message });
    }
  }

  const status: RunStatus = failures === 0
    ? 'success'
    : failures === queries.length
    ? 'failed'
    : 'partial';

  if (runId) await finishRun(db, runId, { status, offersNew, offersUpdated });

  return {
    runId,
    mode,
    dryRun,
    status,
    offersNew,
    offersUpdated,
    queries: report,
    ...(dryRun ? { preview } : {}),
  };
}
