// Point d'entrée du scraper Free-Work. SEUL fichier de _scrapers/free-work/ qui
// lise l'environnement : la frontière runtime du dépôt s'applique ici comme
// pour les index.ts des Edge Functions.
//
// Tout le déroulé — réglages de politesse, robots.txt, chargement des requêtes,
// collecte, marquage du run — vit dans _shared/main-runner.ts et est partagé
// avec Collective. Ce fichier ne dit que ce qui distingue Free-Work.
//
// Usage :
//   npm run scrape:free-work -- --mode delta
//   npm run scrape:free-work -- --mode backfill --query fw:skill:react
//   npm run scrape:free-work -- --mode delta --dry-run

import { runScraperMain, type ScraperDefinition } from '../_shared/main-runner.ts';
import { fetchFreeWorkOffers } from './client.ts';
import { mapFreeWorkOffer } from './mapper.ts';

const FREE_WORK: ScraperDefinition = {
  source: 'free_work',
  /** Les deux surfaces réellement visitées : un listing et une page d'offre. */
  pathsUsed: ['/fr/tech-it/jobs/react', '/fr/tech-it/job-mission/x/y'],
  /** Chaque offre coûte une page de détail : on ne repaie pas ce qu'on connaît. */
  needsKnownExternalIds: true,
  fetchAll: (ctx, query) =>
    fetchFreeWorkOffers({
      fetcher: ctx.fetcher,
      baseUrl: ctx.settings.baseUrl,
      maxListingPages: ctx.settings.maxPagesPerRun,
      windowDays: ctx.windowDays,
      knownExternalIds: ctx.knownExternalIds,
      refetchKnown: ctx.mode === 'backfill',
    }, query),
  map: mapFreeWorkOffer,
};

Deno.exit(await runScraperMain(FREE_WORK, { args: Deno.args, env: (name) => Deno.env.get(name) }));
