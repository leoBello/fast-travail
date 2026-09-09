import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardClient } from '../../data/client';
import { ligneOffre } from '../../data/test-fixtures';
import type { ApplicationStatus, OffersListFilters, StatsResult } from '../../data/types';
import { SuiviScreen } from './SuiviScreen';

const OFFRES_PAR_STATUT: Partial<Record<ApplicationStatus, ReturnType<typeof ligneOffre>[]>> = {
  retenue: [ligneOffre({ id: 'r1', title: 'Offre retenue', candidature_statut: 'retenue' })],
  postulee: [ligneOffre({ id: 'p1', title: 'Offre postulée', candidature_statut: 'postulee' })],
  relancee: [],
  entretien: [],
};

function clientFactice(overrides: Partial<DashboardClient> = {}): DashboardClient {
  return {
    listBrief: vi.fn(),
    listOffers: vi.fn().mockImplementation((filters?: OffersListFilters) => {
      const statut = filters?.statut?.[0];
      const rows = statut === undefined ? [] : (OFFRES_PAR_STATUT[statut] ?? []);
      return Promise.resolve({ rows, total: rows.length, page: 1, pageSize: 3 });
    }),
    getStats: vi.fn().mockResolvedValue({
      funnel: { collected: 4146, scored: 1269, aboveThreshold: 61, retained: 12, applied: 5 },
      byStatus: {
        a_traiter: 0,
        retenue: 12,
        postulee: 5,
        relancee: 2,
        entretien: 1,
        terminee: 0,
        ecartee: 0,
      },
      streak: { days: 3, recentDays: [{ date: '2026-09-09', sent: true }] },
      neverOpened: 23,
      responseRate: { responses: 1, sent: 5 },
      decidedToday: 2,
    }),
    getOfferDetail: vi.fn(),
    openOffer: vi.fn(),
    patchApplication: vi.fn(),
    getConfig: vi.fn().mockResolvedValue({
      scoringWeights: { salaire_floor: 40000 },
      activeProfile: null,
      cvSkills: [],
      staleProfileOfferCount: 0,
    }),
    importCandidateProfile: vi.fn(),
    ...overrides,
  };
}

describe('SuiviScreen', () => {
  it('charge et affiche l’entonnoir, les colonnes du pipeline, la série et les cartes de droite', async () => {
    const client = clientFactice();
    render(<SuiviScreen client={client} onRetour={() => {}} onOuvrirOffre={() => {}} />);

    await waitFor(() => expect(screen.getByText('4146')).toBeDefined());
    expect(screen.getByText('12')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();

    await waitFor(() => expect(screen.getByText('Offre retenue')).toBeDefined());
    expect(screen.getByText('Offre postulée')).toBeDefined();

    expect(screen.getByText('3 jours de suite')).toBeDefined();
    expect(screen.getByText('23')).toBeDefined();
    expect(screen.getByText('1 / 5')).toBeDefined();
  });

  it('« Voir la veille » revient à l’écran du matin', async () => {
    const onRetour = vi.fn();
    const client = clientFactice();
    render(<SuiviScreen client={client} onRetour={onRetour} onOuvrirOffre={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: /Voir la veille/ }));
    expect(onRetour).toHaveBeenCalledOnce();
  });

  it('ouvre le détail au clic sur une carte du pipeline', async () => {
    const onOuvrirOffre = vi.fn();
    const client = clientFactice();
    render(<SuiviScreen client={client} onRetour={() => {}} onOuvrirOffre={onOuvrirOffre} />);

    await waitFor(() => expect(screen.getByText('Offre retenue')).toBeDefined());
    await userEvent.click(screen.getByRole('button', { name: 'Offre retenue' }));
    expect(onOuvrirOffre).toHaveBeenCalledWith('r1');
  });

  it('« Les parcourir » (anti-perte) revient aussi à l’écran du matin', async () => {
    const onRetour = vi.fn();
    const client = clientFactice();
    render(<SuiviScreen client={client} onRetour={onRetour} onOuvrirOffre={() => {}} />);

    await waitFor(() => expect(screen.getByText('23')).toBeDefined());
    await userEvent.click(screen.getByRole('button', { name: 'Les parcourir' }));
    expect(onRetour).toHaveBeenCalledOnce();
  });

  it("avant toute réponse réseau, n'affirme aucun chiffre (jour zéro / chargement jamais confondus)", () => {
    const client = clientFactice({ getStats: vi.fn(() => new Promise<StatsResult>(() => {})) });
    render(<SuiviScreen client={client} onRetour={() => {}} onOuvrirOffre={() => {}} />);

    expect(screen.queryByText('4146')).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
  });
});
