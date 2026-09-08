// Point d'entrée du scraper Collective.work. SEUL fichier de
// _scrapers/collective/ qui lise l'environnement.
//
// Le déroulé est celui de _shared/main-runner.ts, partagé avec Free-Work : ce
// fichier ne dit que ce qui distingue Collective.
//
// Usage :
//   npm run scrape:collective -- --mode delta
//   npm run scrape:collective -- --mode backfill
//   npm run scrape:collective -- --mode delta --dry-run

import { runScraperMain, type ScraperDefinition } from '../_shared/main-runner.ts';
import { fetchCollectiveOffers } from './client.ts';
import { mapCollectiveOffer } from './mapper.ts';

const COLLECTIVE: ScraperDefinition = {
  source: 'collective',
  pathsUsed: ['/jobs/fr'],
  /**
   * La page de listing porte déjà les missions ENTIÈRES : il n'y a aucune
   * requête à économiser, et chaque passe rafraîchit last_seen_at et seen_count
   * comme le font les deux API. C'est la différence de fond avec Free-Work.
   */
  needsKnownExternalIds: false,
  fetchAll: (ctx, query) =>
    fetchCollectiveOffers({
      fetcher: ctx.fetcher,
      baseUrl: ctx.settings.baseUrl,
      maxPages: ctx.settings.maxPagesPerRun,
      windowDays: ctx.windowDays,
    }, query),
  map: mapCollectiveOffer,
};

Deno.exit(await runScraperMain(COLLECTIVE, { args: Deno.args, env: (name) => Deno.env.get(name) }));
