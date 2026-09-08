import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { runBackfill } from '../run-backfill.ts';
import type { ScoringSummary } from '../run-scoring.ts';
import type { LogLevel } from '../logger.ts';

/** Un lot plein et sain, dont chaque scenario ne modifie que ce qui l'interesse. */
function lot(over: Partial<ScoringSummary> = {}): ScoringSummary {
  return {
    candidates: 50,
    scored: 50,
    failed: 0,
    failedPermanent: 0,
    failedRetryable: 0,
    inputTokens: 1000,
    outputTokens: 100,
    cacheReadTokens: 5000,
    writeFailures: 0,
    ...over,
  };
}

/** La file vide : c'est ce lot qui met fin a la boucle. */
const fileVide: ScoringSummary = {
  candidates: 0,
  scored: 0,
  failed: 0,
  failedPermanent: 0,
  failedRetryable: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  writeFailures: 0,
};

interface LigneJournal {
  level: LogLevel;
  message: string;
  data?: unknown;
}

/**
 * Faux `runScoring` : rend les resumes fournis dans l'ordre, et compte ses
 * appels. Au-dela de la liste, il rend la file vide — un test qui appellerait
 * plus que prevu s'arreterait donc proprement au lieu de boucler sans fin.
 */
function faux(resumes: ScoringSummary[]): {
  runScoring: () => Promise<ScoringSummary>;
  appels: () => number;
} {
  let n = 0;
  return {
    runScoring: () => {
      const resume = resumes[n] ?? fileVide;
      n += 1;
      return Promise.resolve(resume);
    },
    appels: () => n,
  };
}

function journal(): { log: (l: LogLevel, m: string, d?: unknown) => void; lignes: LigneJournal[] } {
  const lignes: LigneJournal[] = [];
  return {
    log: (level, message, data) => {
      lignes.push({ level, message, data });
    },
    lignes,
  };
}

Deno.test('arret des la PREMIERE perte d ecriture, avant tout second lot', async () => {
  const f = faux([lot({ writeFailures: 1 })]);
  const j = journal();

  const err = await assertRejects(
    () => runBackfill({ runScoring: f.runScoring, log: j.log, maxBatches: 60 }),
    Error,
  );
  assertStringIncludes(err.message, 'lot 1');
  assertStringIncludes(err.message, 'SUPABASE_SERVICE_ROLE_KEY');

  // Le point du fusible : la boucle ne repaie pas un second lot.
  assertEquals(f.appels(), 1);
});

Deno.test('arret sur une perte PARTIELLE au troisieme lot (seuil strict)', async () => {
  const f = faux([lot(), lot(), lot({ writeFailures: 2 })]);
  const j = journal();

  const err = await assertRejects(
    () => runBackfill({ runScoring: f.runScoring, log: j.log, maxBatches: 60 }),
    Error,
  );
  assertStringIncludes(err.message, 'lot 3');
  assertEquals(f.appels(), 3);

  // Les deux lots sains sont bien cumules avant l'arret : le journal d'erreur
  // dit ou en est l'amorcage, pas seulement qu'il s'arrete.
  const erreur = j.lignes.find((l) => l.level === 'error');
  assertEquals((erreur?.data as { totals: { scored: number } }).totals.scored, 150);
});

Deno.test('arret quand TOUT un lot echoue au jugement, sans perte d ecriture', async () => {
  // Le mode d'echec de la clef morte : writeFailures reste a 0, donc la garde
  // d'ecriture ne voit rien, et chaque offre sort de la file marquee en erreur.
  // Une clef morte rend un 401 : echec PERMANENT, donc une ligne d'erreur par
  // offre, et le lot entier sort de la file.
  const f = faux([
    lot({ scored: 0, failed: 50, failedPermanent: 50, outputTokens: 0, cacheReadTokens: 0 }),
  ]);
  const j = journal();

  const err = await assertRejects(
    () => runBackfill({ runScoring: f.runScoring, log: j.log, maxBatches: 60 }),
    Error,
  );
  assertStringIncludes(err.message, 'lot 1');
  assertStringIncludes(err.message, 'ANTHROPIC_API_KEY');
  assertStringIncludes(err.message, '50 permanent(s), 0 rejouable(s)');
  assertEquals(f.appels(), 1);
});

Deno.test('un lot entierement REJOUABLE arrete aussi l amorcage, sans condamner d offre', async () => {
  // API en panne : rien n'est ecrit, aucune offre ne sort de la file — mais la
  // boucle n'avance pas non plus, et elle DEPENSE. Le fusible doit se
  // declencher sur `failed`, pas sur `failedPermanent` seul.
  const f = faux([
    lot({ scored: 0, failed: 50, failedRetryable: 50, outputTokens: 0, cacheReadTokens: 0 }),
  ]);
  const j = journal();

  const err = await assertRejects(
    () => runBackfill({ runScoring: f.runScoring, log: j.log, maxBatches: 60 }),
    Error,
  );
  assertStringIncludes(err.message, '0 permanent(s), 50 rejouable(s)');
  assertStringIncludes(err.message, 'restent candidates');
  assertEquals(f.appels(), 1);
});

Deno.test('des echecs de jugement ISOLES n arretent pas l amorcage', async () => {
  // 3 offres sur 50 : c'est le bruit normal, deja gere par la ligne d'erreur
  // ecrite en base. Un seuil trop laxiste rendrait le script inutilisable.
  const f = faux([lot({ scored: 47, failed: 3 }), lot({ scored: 49, failed: 1 })]);
  const j = journal();

  const totals = await runBackfill({ runScoring: f.runScoring, log: j.log, maxBatches: 60 });

  assertEquals(totals.batches, 2);
  assertEquals(totals.failed, 4);
  assertEquals(f.appels(), 3);
  assertEquals(j.lignes.filter((l) => l.level === 'error').length, 0);
});

Deno.test('arret sur la borne de lots, sans epuiser la file, au NOMBRE EXACT', async () => {
  // Une file qui ne se vide jamais : sans borne, la boucle depenserait sans fin.
  let appels = 0;
  const runScoring = (): Promise<ScoringSummary> => {
    appels += 1;
    return Promise.resolve(lot());
  };
  const j = journal();

  const err = await assertRejects(
    () => runBackfill({ runScoring, log: j.log, maxBatches: 5 }),
    Error,
  );
  assertStringIncludes(err.message, '5 lots');
  assertEquals(appels, 5);
});

Deno.test('chemin nominal : la boucle va au bout et ne s arrete sur rien', async () => {
  const f = faux([lot(), lot(), lot({ candidates: 10, scored: 10 })]);
  const j = journal();

  const totals = await runBackfill({ runScoring: f.runScoring, log: j.log, maxBatches: 60 });

  assertEquals(totals.batches, 3);
  assertEquals(totals.scored, 110);
  assertEquals(totals.failed, 0);
  assertEquals(totals.writeFailures, 0);
  assertEquals(totals.inputTokens, 3000);
  assertEquals(totals.cacheReadTokens, 15000);
  // 3 lots pleins + le tour qui constate la file vide.
  assertEquals(f.appels(), 4);
  assertEquals(j.lignes.filter((l) => l.level === 'error').length, 0);
  assertEquals(j.lignes.at(-1)?.message, 'amorcage termine');
});
