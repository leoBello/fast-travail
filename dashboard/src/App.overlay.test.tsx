import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

/**
 * Fichier SÉPARÉ de `App.test.tsx` : `vi.mock` est hissé au sommet du
 * fichier et s'applique à TOUS ses tests — le mélanger avec le test « pas de
 * VITE_*, message de configuration nommé » l'aurait fait échouer, puisque
 * `dashboardClientFromEnv` ne lèverait plus rien.
 *
 * Revue de tâche 8 : le rendu conditionnel précédent démontait `MatinScreen`
 * à l'ouverture d'une offre, jetant tout son état local (filtres, tri, page)
 * à CHAQUE aller-retour, pas seulement au `F5`. Ce test prouve le correctif —
 * la superposition — plutôt que de l'affirmer : le contenu de `MatinScreen`
 * reste dans le DOM pendant que le détail est ouvert PAR-DESSUS, et après
 * l'avoir refermé.
 *
 * La ligne d'offre est écrite en dur ICI plutôt qu'importée de
 * `test-fixtures.ts` : `vi.mock` est hissé au-dessus de tous les imports du
 * fichier (y compris `ligneOffre`), et y référencer un identifiant importé
 * lève une `ReferenceError` d'initialisation — mesuré en écrivant ce test.
 */
vi.mock('./data/client', async (importOriginal) => {
  const reel = await importOriginal<typeof import('./data/client')>();
  const offre = {
    id: 'x',
    source: 'adzuna',
    title: 'Offre liste',
    company_name: 'Acme',
    city: 'Marseille',
    department: '13',
    url: 'https://exemple.test/offre',
    published_at: '2026-09-08T08:00:00.000Z',
    fit_score: 80,
    verdict: 'Bon alignement.',
    engagement: null,
    work_mode: null,
    seniority: null,
    domain: null,
    confidence: 'haute',
    agentic_ai: false,
    duration_months: null,
    compensation_kind: null,
    compensation_min: null,
    compensation_max: null,
    unwanted_count: 0,
    truncated_input: false,
    age_days: 1,
    extraction: {
      stack: [],
      seniority: null,
      work_mode: null,
      engagement: null,
      duration_months: null,
      compensation_kind: null,
      compensation_min: null,
      compensation_max: null,
      agentic_ai: false,
      unwanted_tech: [],
      domain: null,
      confidence: 'haute',
    },
    bonus_engagement: 0,
    bonus_remote: 0,
    bonus_remuneration: 0,
    bonus_duree: 0,
    bonus_agentique: 0,
    malus_technos: 0,
    malus_fraicheur: 0,
    final_score: 80,
    display_key: 'acme|offreliste',
    group_size: 1,
    group_sources: ['adzuna'],
    candidature_statut: null,
    candidature_issue: null,
    candidature_ouverte_le: null,
    candidature_envoyee_le: null,
    candidature_relancee_le: null,
    candidature_entretien_le: null,
    candidature_heritee: null,
    found_by_labels: [],
    trusted_query: false,
  };
  return {
    ...reel,
    dashboardClientFromEnv: () => ({
      listBrief: vi.fn().mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 3 }),
      listOffers: vi.fn().mockResolvedValue({ rows: [offre], total: 1, page: 1, pageSize: 50 }),
      getStats: vi.fn().mockResolvedValue({
        funnel: { collected: 0, scored: 0, aboveThreshold: 0, retained: 0, applied: 0 },
        byStatus: {
          a_traiter: 0,
          retenue: 0,
          postulee: 0,
          relancee: 0,
          entretien: 0,
          terminee: 0,
          ecartee: 0,
        },
        streak: { days: 0, recentDays: [] },
        neverOpened: 0,
        responseRate: { responses: 0, sent: 0 },
        decidedToday: 0,
      }),
      getOfferDetail: vi
        .fn()
        .mockResolvedValue({ offer: offre, groupJudgements: [], application: null }),
      openOffer: vi.fn(),
      patchApplication: vi.fn(),
      getConfig: vi.fn().mockResolvedValue({
        scoringWeights: { salaire_floor: 40000 },
        activeProfile: null,
        cvSkills: [],
        staleProfileOfferCount: 0,
      }),
      importCandidateProfile: vi.fn(),
    }),
  };
});

describe('App — la superposition, pas le remplacement (revue de tâche 8)', () => {
  it(
    'ouvrir une offre superpose le détail SANS démonter MatinScreen — son contenu reste ' +
      'dans le DOM pendant l’ouverture, et après le retour',
    async () => {
      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => expect(screen.getAllByText('Offre liste').length).toBeGreaterThan(0));
      await user.click(screen.getAllByText('Offre liste')[0]!);

      await waitFor(() => expect(screen.getByRole('button', { name: 'Retour' })).toBeDefined());
      // Toujours là, SOUS l'overlay : la preuve que MatinScreen n'a pas été démonté.
      expect(screen.getAllByText('Offre liste').length).toBeGreaterThan(0);

      await user.click(screen.getByRole('button', { name: 'Retour' }));
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Retour' })).toBeNull());
      expect(screen.getAllByText('Offre liste').length).toBeGreaterThan(0);
    },
  );

  it(
    'ouvrir le détail DEPUIS le suivi le peint PAR-DESSUS le suivi, pas dessous — la ' +
      'contrainte que le commentaire de App.tsx décrit (montage de SuiviScreen avant ' +
      'DetailScreen dans le JSX), vérifiée par l’ordre réel du DOM plutôt qu’affirmée ' +
      'seulement en commentaire',
    async () => {
      const user = userEvent.setup();
      render(<App />);

      // Ouvre le suivi depuis le bouton d'en-tête de l'écran du matin.
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Mes candidatures' })).toBeDefined(),
      );
      await user.click(screen.getByRole('button', { name: 'Mes candidatures' }));

      const titreSuivi = await waitFor(() =>
        screen.getByRole('heading', { name: 'Mes candidatures' }),
      );

      // Ouvre le détail depuis une carte du pipeline (le mock rend la même
      // offre pour n'importe quel filtre `statut`, donc chaque colonne en
      // affiche un exemplaire) — pas depuis l'écran du matin, qui reste
      // monté dessous mais hors de propos pour CETTE contrainte.
      const cartesPipeline = await waitFor(() => {
        const boutons = screen.getAllByRole('button', { name: 'Offre liste' });
        expect(boutons.length).toBeGreaterThan(0);
        return boutons;
      });
      await user.click(cartesPipeline[0]!);

      const retourDetail = await waitFor(() => screen.getByRole('button', { name: 'Retour' }));

      // Le suivi n'a pas été démonté par l'ouverture du détail…
      expect(screen.getByRole('heading', { name: 'Mes candidatures' })).toBeDefined();
      // …et son titre précède le bouton "Retour" du détail dans le DOM :
      // à z-index égal (`--z-panel`), c'est l'ORDRE qui décide de ce qui
      // peint par-dessus quoi. Un réordonnancement du JSX inverserait ce
      // résultat sans qu'aucune autre suite ne le remarque.
      const position = titreSuivi.compareDocumentPosition(retourDetail);
      expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    },
  );
});
