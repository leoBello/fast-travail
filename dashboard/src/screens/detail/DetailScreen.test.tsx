import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardClient } from '../../data/client';
import type { OfferDetail } from '../../data/types';
import { etatCandidature, ligneOffre } from '../../data/test-fixtures';
import { DetailScreen } from './DetailScreen';

const OFFRE = ligneOffre({
  id: 'off-1',
  title: 'Développeur React / Node / NestJS',
  company_name: 'ALLEGIS GROUP',
  final_score: 86.5,
  fit_score: 58,
});

function clientFactice(overrides: Partial<DashboardClient> = {}): DashboardClient {
  return {
    listBrief: vi.fn(),
    listOffers: vi.fn(),
    getStats: vi.fn(),
    getOfferDetail: vi
      .fn()
      .mockResolvedValue({ offer: OFFRE, groupJudgements: [], application: null }),
    openOffer: vi
      .fn()
      .mockResolvedValue({ offer_id: 'off-1', status: 'a_traiter', created_at: '' }),
    patchApplication: vi.fn().mockResolvedValue(etatCandidature({ status: 'retenue' })),
    getConfig: vi.fn().mockResolvedValue({
      scoringWeights: { salaire_floor: 40000 },
      activeProfile: null,
      cvSkills: [],
      staleProfileOfferCount: 0,
    }),
    importCandidateProfile: vi.fn(),
    getWorkModeCounts: vi
      .fn()
      .mockResolvedValue({ full_remote: 173, hybride: 150, sur_site: 88, non_precise: 861 }),
    getStatutCounts: vi.fn().mockResolvedValue({
      aucune: 1258,
      a_traiter: 0,
      retenue: 0,
      postulee: 6,
      relancee: 1,
      entretien: 0,
      terminee: 0,
      ecartee: 7,
    }),
    ...overrides,
  };
}

describe('DetailScreen', () => {
  it(
    'ÉTAT DE CHARGEMENT (avant toute réponse du serveur) : aucun titre, aucun chiffre, ' +
      'aucune affirmation — seulement le message de chargement (leçon de la tâche 7)',
    () => {
      const client = clientFactice({
        getOfferDetail: vi.fn(() => new Promise<OfferDetail | null>(() => {})),
      });
      render(<DetailScreen client={client} offerId="off-1" onRetour={() => {}} />);

      expect(screen.getByText('Chargement…')).toBeDefined();
      expect(screen.queryByText(OFFRE.title!)).toBeNull();
      expect(screen.queryByText('86.5')).toBeNull();
      expect(screen.queryByText('58')).toBeNull();
      expect(screen.queryByText('ALLEGIS GROUP')).toBeNull();
    },
  );

  it('charge et affiche le détail une fois la réponse arrivée', async () => {
    const client = clientFactice();
    render(<DetailScreen client={client} offerId="off-1" onRetour={() => {}} />);

    await waitFor(() => expect(screen.getByText(OFFRE.title!)).toBeDefined());
    expect(screen.getByText('ALLEGIS GROUP')).toBeDefined();
    expect(screen.getByText('86.5')).toBeDefined();
    expect(screen.getByText('58')).toBeDefined();
  });

  it('ÉTAT INTROUVABLE (404, `donnees === null`) : un message nommé, jamais confondu avec une panne', async () => {
    const client = clientFactice({ getOfferDetail: vi.fn().mockResolvedValue(null) });
    render(<DetailScreen client={client} offerId="off-1" onRetour={() => {}} />);

    await waitFor(() => expect(screen.getByText('Offre introuvable')).toBeDefined());
    expect(screen.queryByText('Le chargement a échoué')).toBeNull();
  });

  it('ÉTAT D’ERREUR (panne réseau) : un message nommé, avec un moyen de réessayer', async () => {
    const client = clientFactice({
      getOfferDetail: vi.fn().mockRejectedValue(new Error('panne')),
    });
    render(<DetailScreen client={client} offerId="off-1" onRetour={() => {}} />);

    await waitFor(() => expect(screen.getByText('Le chargement a échoué')).toBeDefined());
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeDefined();
  });

  it('le bouton "Retour" appelle onRetour', async () => {
    const user = userEvent.setup();
    const onRetour = vi.fn();
    const client = clientFactice();
    render(<DetailScreen client={client} offerId="off-1" onRetour={onRetour} />);

    await waitFor(() => expect(screen.getByText(OFFRE.title!)).toBeDefined());
    await user.click(screen.getByRole('button', { name: 'Retour' }));
    expect(onRetour).toHaveBeenCalledTimes(1);
  });

  it("n'affiche « Vue sur deux sources » que si group_size > 1", async () => {
    const client = clientFactice({
      getOfferDetail: vi.fn().mockResolvedValue({
        offer: ligneOffre({ id: 'off-1', group_size: 1 }),
        groupJudgements: [],
        application: null,
      }),
    });
    render(<DetailScreen client={client} offerId="off-1" onRetour={() => {}} />);
    await waitFor(() => expect(screen.getByText('Développeur React')).toBeDefined());
    expect(screen.queryByText('Vue sur deux sources')).toBeNull();
  });

  it(
    'les badges confiance et texte-coupé sont visibles au niveau du détail même sur un ' +
      'groupe de taille 1 — constat I2, revue finale : TwoSourcesPanel (seul porteur avant ' +
      'correctif) ne monte pas quand group_size === 1',
    async () => {
      const client = clientFactice({
        getOfferDetail: vi.fn().mockResolvedValue({
          offer: ligneOffre({
            id: 'off-1',
            group_size: 1,
            truncated_input: true,
            confidence: 'basse',
          }),
          groupJudgements: [],
          application: null,
        }),
      });
      render(<DetailScreen client={client} offerId="off-1" onRetour={() => {}} />);

      await waitFor(() => expect(screen.getByText('Développeur React')).toBeDefined());
      expect(screen.queryByText('Vue sur deux sources')).toBeNull();
      expect(screen.getByText('Confiance basse')).toBeDefined();
      expect(screen.getByText('Texte coupé à 500 car.')).toBeDefined();
    },
  );

  it('le badge texte-coupé est absent quand le texte reçu est complet', async () => {
    const client = clientFactice({
      getOfferDetail: vi.fn().mockResolvedValue({
        offer: ligneOffre({ id: 'off-1', truncated_input: false, confidence: 'haute' }),
        groupJudgements: [],
        application: null,
      }),
    });
    render(<DetailScreen client={client} offerId="off-1" onRetour={() => {}} />);

    await waitFor(() => expect(screen.getByText('Développeur React')).toBeDefined());
    expect(screen.getByText('Confiance haute')).toBeDefined();
    expect(screen.queryByText('Texte coupé à 500 car.')).toBeNull();
  });

  it('"Retenir cette offre" ouvre puis retient — recharge ensuite le détail', async () => {
    const user = userEvent.setup();
    const client = clientFactice();
    render(<DetailScreen client={client} offerId="off-1" onRetour={() => {}} />);

    await waitFor(() => expect(screen.getByText(OFFRE.title!)).toBeDefined());
    await user.click(screen.getByRole('button', { name: 'Retenir cette offre' }));

    await waitFor(() => expect(client.openOffer).toHaveBeenCalledWith('off-1'));
    expect(client.patchApplication).toHaveBeenCalledWith('off-1', { status: 'retenue' });
    await waitFor(() => expect(client.getOfferDetail).toHaveBeenCalledTimes(2));
  });

  it('une action déjà ouverte (application connue) ne rappelle pas openOffer', async () => {
    const user = userEvent.setup();
    const client = clientFactice({
      getOfferDetail: vi.fn().mockResolvedValue({
        offer: OFFRE,
        groupJudgements: [],
        application: etatCandidature({ status: 'retenue' }),
      }),
    });
    render(<DetailScreen client={client} offerId="off-1" onRetour={() => {}} />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Marquer comme postulée' })).toBeDefined(),
    );
    await user.click(screen.getByRole('button', { name: 'Marquer comme postulée' }));

    await waitFor(() =>
      expect(client.patchApplication).toHaveBeenCalledWith(
        'off-1',
        expect.objectContaining({ status: 'postulee' }),
      ),
    );
    expect(client.openOffer).not.toHaveBeenCalled();
  });

  it(
    '« Trouvée par » (tâche 10) : affiche les étiquettes de requête et le badge de confiance, ' +
      'omet la section quand il n’y a ni étiquette ni requête de confiance',
    async () => {
      const client = clientFactice({
        getOfferDetail: vi.fn().mockResolvedValue({
          offer: ligneOffre({
            id: 'off-1',
            found_by_labels: ['adzuna:local:react-ts', 'free-work:react'],
            trusted_query: true,
          }),
          groupJudgements: [],
          application: null,
        }),
      });
      render(<DetailScreen client={client} offerId="off-1" onRetour={() => {}} />);

      await waitFor(() => expect(screen.getByText('Trouvée par')).toBeDefined());
      expect(screen.getByText('adzuna:local:react-ts')).toBeDefined();
      expect(screen.getByText('free-work:react')).toBeDefined();
      expect(screen.getByText('requête de confiance')).toBeDefined();
    },
  );

  it('« Trouvée par » est absente quand l’offre n’a ni étiquette ni requête de confiance', async () => {
    const client = clientFactice(); // OFFRE par défaut : found_by_labels: [], trusted_query: false
    render(<DetailScreen client={client} offerId="off-1" onRetour={() => {}} />);
    await waitFor(() => expect(screen.getByText(OFFRE.title!)).toBeDefined());
    expect(screen.queryByText('Trouvée par')).toBeNull();
  });

  it(
    'colore en vert les technologies de la stack présentes dans profile_skills (tâche 10), ' +
      'jamais les autres',
    async () => {
      const client = clientFactice({
        getConfig: vi.fn().mockResolvedValue({
          scoringWeights: { salaire_floor: 40000 },
          activeProfile: null,
          cvSkills: ['react', 'typescript'],
          staleProfileOfferCount: 0,
        }),
        getOfferDetail: vi.fn().mockResolvedValue({
          offer: ligneOffre({
            id: 'off-1',
            extraction: {
              stack: ['React', 'NestJS'],
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
          }),
          groupJudgements: [],
          application: null,
        }),
      });
      render(<DetailScreen client={client} offerId="off-1" onRetour={() => {}} />);

      const reactBadge = await waitFor(() => screen.getByText('React'));
      const nestBadge = screen.getByText('NestJS');
      await waitFor(() =>
        expect(screen.getByText(/technologie.*présente.*dans votre CV/)).toBeDefined(),
      );
      expect(reactBadge.className).toMatch(/techCv/);
      expect(nestBadge.className).not.toMatch(/techCv/);
    },
  );

  it('une action qui échoue laisse un message d’erreur nommé, sans faire planter l’écran', async () => {
    const user = userEvent.setup();
    const client = clientFactice({
      patchApplication: vi.fn().mockRejectedValue(new Error('panne')),
    });
    render(<DetailScreen client={client} offerId="off-1" onRetour={() => {}} />);

    await waitFor(() => expect(screen.getByText(OFFRE.title!)).toBeDefined());
    await user.click(screen.getByRole('button', { name: 'Retenir cette offre' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
  });
});
