// Lancement commun aux deux scrapers.
//
// `CLAUDE.md` tranche déjà ce débat pour la boucle de collecte : « ne jamais
// dupliquer la boucle ». Le lancement obéit à la même règle — sans ce fichier,
// les deux main.ts seraient identiques à quatre valeurs près.
//
// Runtime-neutre : Deno.args et Deno.env arrivent en paramètre. C'est la
// condition pour que ce fichier reste testable, et les chemins qui comptent —
// source désactivée, robots.txt qui refuse, répétition à blanc — ne sont
// vérifiables nulle part ailleurs.

import { createDbClient, type DbClient } from '../../_shared/db.ts';
import { log } from '../../_shared/logger.ts';
import { type FetchResult, runCollection } from '../../_shared/run-collection.ts';
import {
  type CollectionMode,
  type NormalizedOffer,
  type RunTrigger,
  type SearchQueryRow,
  type SourceKey,
  WINDOW_DAYS,
} from '../../_shared/types.ts';
import { type PageFetcher, PoliteFetcher } from './http.ts';
import { parseRobots } from './robots.ts';
import {
  loadKnownExternalIds,
  loadSourceSettings,
  markSourceRun,
  recordRobotsCheck,
  type SourceSettings,
} from './sources.ts';

/** Ce que le lanceur a décidé, et dont la source a besoin pour collecter. */
export interface ScraperRunContext {
  fetcher: PageFetcher;
  settings: SourceSettings;
  mode: CollectionMode;
  windowDays: number;
  /** Vide si la source n'a pas demandé le préchargement. */
  knownExternalIds: ReadonlySet<string>;
}

/** Tout ce qui distingue un scraper d'un autre. Le reste est commun. */
export interface ScraperDefinition {
  source: SourceKey;
  /** Chemins réellement visités : ce sont EUX qu'on soumet à robots.txt. */
  pathsUsed: string[];
  /**
   * Vrai si la source paie une requête par offre — on précharge alors les
   * external_id connus pour ne pas repayer un détail déjà collecté. Faux quand
   * la page de listing porte déjà les offres entières : il n'y a rien à
   * économiser, et chaque passe rafraîchit last_seen_at.
   */
  needsKnownExternalIds: boolean;
  fetchAll(ctx: ScraperRunContext, query: SearchQueryRow): Promise<FetchResult>;
  map(raw: unknown): NormalizedOffer | null;
}

/** L'hôte d'exécution : c'est par là, et uniquement par là, qu'arrive Deno. */
export interface ScraperEnvironment {
  args: string[];
  env(name: string): string | undefined;
}

/** Points d'injection réservés aux tests ; la production prend les valeurs par défaut. */
export interface ScraperDependencies {
  createDb?: (url: string, serviceRoleKey: string) => DbClient;
  createFetcher?: (settings: SourceSettings) => PageFetcher;
}

function flag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function option(args: string[], name: string): string | null {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}

function requireEnv(host: ScraperEnvironment, name: string): string {
  const value = host.env(name);
  if (!value) throw new Error(`variable d'environnement manquante : ${name}`);
  return value;
}

export async function runScraperMain(
  scraper: ScraperDefinition,
  host: ScraperEnvironment,
  deps: ScraperDependencies = {},
): Promise<number> {
  const mode: CollectionMode = option(host.args, 'mode') === 'backfill' ? 'backfill' : 'delta';
  const trigger: RunTrigger = option(host.args, 'trigger') === 'cron' ? 'cron' : 'manual';
  const dryRun = flag(host.args, 'dry-run');
  const onlyLabel = option(host.args, 'query');

  const url = requireEnv(host, 'SUPABASE_URL');
  const serviceRoleKey = requireEnv(host, 'SUPABASE_SERVICE_ROLE_KEY');
  const db = deps.createDb
    ? deps.createDb(url, serviceRoleKey)
    : createDbClient({ url, serviceRoleKey });

  const settings = await loadSourceSettings(db, scraper.source);
  if (!settings.enabled) {
    log('warn', 'source désactivée en base, rien à faire', { source: scraper.source });
    return 0;
  }

  const fetcher = deps.createFetcher
    ? deps.createFetcher(settings)
    : new PoliteFetcher({ userAgent: settings.userAgent, minDelayMs: settings.minDelayMs });

  // robots.txt à CHAQUE exécution : une autorisation constatée en septembre ne
  // vaut rien en décembre. Le verdict est écrit même à blanc — c'est un fait sur
  // le monde extérieur, et une répétition à blanc sert justement à l'apprendre.
  const robots = await fetcher.get(`${settings.baseUrl}/robots.txt`);
  const rules = parseRobots(robots.body, settings.userAgent);
  const allowed = scraper.pathsUsed.every((path) => rules.allows(path));
  await recordRobotsCheck(db, scraper.source, allowed);
  if (!allowed) {
    log('error', 'robots.txt refuse désormais la collecte : arrêt', { source: scraper.source });
    if (!dryRun) await markSourceRun(db, scraper.source, 'failed');
    return 1;
  }

  let builder = db
    .from('search_queries')
    .select('*')
    .eq('source', scraper.source)
    .eq('enabled', true);
  if (onlyLabel) builder = builder.eq('label', onlyLabel);

  const { data, error } = await builder.order('priority', { ascending: true });
  if (error) throw new Error(`lecture des requêtes : ${error.message}`);
  const queries = (data ?? []) as SearchQueryRow[];
  if (queries.length === 0) throw new Error(`aucune requête active pour ${scraper.source}`);

  const knownExternalIds = scraper.needsKnownExternalIds && mode === 'delta'
    ? await loadKnownExternalIds(db, scraper.source)
    : new Set<string>();

  const ctx: ScraperRunContext = {
    fetcher,
    settings,
    mode,
    windowDays: WINDOW_DAYS[mode],
    knownExternalIds,
  };

  const summary = await runCollection({
    db,
    source: scraper.source,
    mode,
    trigger,
    dryRun,
    queries,
    fetchAll: (query) => scraper.fetchAll(ctx, query),
    map: (raw) => scraper.map(raw),
  });

  if (!dryRun) await markSourceRun(db, scraper.source, summary.status);
  console.log(JSON.stringify(summary, null, 2));

  return summary.status === 'failed' ? 1 : 0;
}
