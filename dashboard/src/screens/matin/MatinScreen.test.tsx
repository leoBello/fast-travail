import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardClient } from '../../data/client';
import { ligneOffre } from '../../data/test-fixtures';
import { MatinScreen } from './MatinScreen';

const OFFRES_MATIN = [
  ligneOffre({ id: 'a', title: 'Offre A', final_score: 100 }),
  ligneOffre({ id: 'b', title: 'Offre B', final_score: 95 }),
  ligneOffre({ id: 'c', title: 'Offre C', final_score: 90 }),
];

function clientFactice(overrides: Partial<DashboardClient> = {}): DashboardClient {
  return {
    listBrief: vi.fn().mockResolvedValue({ rows: OFFRES_MATIN, total: 6, page: 1, pageSize: 3 }),
    listOffers: vi.fn().mockResolvedValue({
      rows: [ligneOffre({ id: 'x', title: 'Offre liste' })],
      total: 1269,
      page: 1,
      pageSize: 50,
    }),
    getStats: vi.fn().mockResolvedValue({
      funnel: { collected: 4146, scored: 1269, aboveThreshold: 61, retained: 0, applied: 0 },
      byStatus: {
        a_traiter: 0,
        retenue: 0,
        postulee: 0,
        relancee: 0,
        entretien: 0,
        terminee: 0,
        ecartee: 0,
      },
      streak: { days: 3, recentDays: [] },
      neverOpened: 23,
      responseRate: { responses: 0, sent: 0 },
    }),
    getOfferDetail: vi.fn(),
    openOffer: vi.fn().mockResolvedValue({ offer_id: 'a', status: 'a_traiter' }),
    patchApplication: vi.fn().mockResolvedValue({ offer_id: 'a', status: 'retenue' }),
    ...overrides,
  };
}

describe('MatinScreen', () => {
  it('charge et affiche la bande "Ce matin" et "Toute la veille" avec les données du client', async () => {
    const client = clientFactice();
    render(<MatinScreen client={client} onOuvrirOffre={() => {}} />);

    await waitFor(() => expect(screen.getByText('Offre A')).toBeDefined());
    expect(screen.getByText('Offre B')).toBeDefined();
    expect(screen.getByText('Offre C')).toBeDefined();
    expect(screen.getByText('1–3 sur 6')).toBeDefined();

    await waitFor(() =>
      expect(screen.getByText('1269 offres jugées, rien de masqué')).toBeDefined(),
    );
    expect(screen.getByText('23 jamais ouvertes au-dessus de 50')).toBeDefined();
    expect(screen.getByText('3 jours de suite')).toBeDefined();
  });

  it('"Garder" appelle openOffer puis patchApplication({ status: "retenue" }), et retire la carte', async () => {
    const user = userEvent.setup();
    const client = clientFactice();
    render(<MatinScreen client={client} onOuvrirOffre={() => {}} />);

    await waitFor(() => expect(screen.getByText('Offre A')).toBeDefined());
    const carteA = screen.getByText('Offre A').closest('article')!;
    await user.click(within(carteA).getByRole('button', { name: 'Garder' }));

    await waitFor(() => expect(client.openOffer).toHaveBeenCalledWith('a'));
    expect(client.patchApplication).toHaveBeenCalledWith('a', { status: 'retenue' });
    await waitFor(() => expect(screen.queryByText('Offre A')).toBeNull());
  });

  it('"Écarter" envoie le statut "ecartee"', async () => {
    const user = userEvent.setup();
    const client = clientFactice();
    render(<MatinScreen client={client} onOuvrirOffre={() => {}} />);

    await waitFor(() => expect(screen.getByText('Offre B')).toBeDefined());
    const carteB = screen.getByText('Offre B').closest('article')!;
    await user.click(within(carteB).getByRole('button', { name: 'Écarter' }));

    await waitFor(() =>
      expect(client.patchApplication).toHaveBeenCalledWith('b', { status: 'ecartee' }),
    );
  });

  it('une décision qui échoue laisse la carte en place et affiche un message', async () => {
    const user = userEvent.setup();
    const client = clientFactice({ openOffer: vi.fn().mockRejectedValue(new Error('panne')) });
    render(<MatinScreen client={client} onOuvrirOffre={() => {}} />);

    await waitFor(() => expect(screen.getByText('Offre C')).toBeDefined());
    const carteC = screen.getByText('Offre C').closest('article')!;
    await user.click(within(carteC).getByRole('button', { name: 'Garder' }));

    await waitFor(() =>
      expect(
        screen.getByText("La décision n'a pas pu être enregistrée. L'offre reste dans la bande."),
      ).toBeDefined(),
    );
    expect(screen.getByText('Offre C')).toBeDefined();
  });

  it("n'affiche aucun bouton vers le suivi quand onVoirSuivi n'est pas fourni", () => {
    const client = clientFactice();
    render(<MatinScreen client={client} onOuvrirOffre={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Mes candidatures' })).toBeNull();
  });

  it('le bouton d’en-tête "Mes candidatures" appelle onVoirSuivi au clic, quand il est fourni', async () => {
    const user = userEvent.setup();
    const client = clientFactice();
    const onVoirSuivi = vi.fn();
    render(<MatinScreen client={client} onOuvrirOffre={() => {}} onVoirSuivi={onVoirSuivi} />);

    const bouton = screen.getByRole('button', { name: 'Mes candidatures' });
    await user.click(bouton);
    expect(onVoirSuivi).toHaveBeenCalledOnce();
  });
});
