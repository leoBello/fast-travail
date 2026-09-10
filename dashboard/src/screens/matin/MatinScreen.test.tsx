import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardClient } from '../../data/client';
import type { OffersListFilters } from '../../data/types';
import { ligneOffre } from '../../data/test-fixtures';
import { MatinScreen } from './MatinScreen';

beforeEach(() => {
  localStorage.clear();
});

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
      decidedToday: 2,
    }),
    getOfferDetail: vi.fn(),
    openOffer: vi.fn().mockResolvedValue({ offer_id: 'a', status: 'a_traiter' }),
    patchApplication: vi.fn().mockResolvedValue({ offer_id: 'a', status: 'retenue' }),
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
    getRobotStatus: vi.fn().mockResolvedValue({
      collecte: { etat: 'pas_encore', derniere: null },
      jugement: { etat: 'pas_encore' },
    }),
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

    // Onglet par défaut « À traiter » (tâche 10) : la ligne de compte suit
    // désormais `compteOnglet`, pas `offresJugeesRienMasque` — cette
    // dernière ne se dit QUE sur l'onglet « Toutes » (GUIDELINES §3.3).
    // `totalCorpus` vient de `getStatutCounts` (`clientFactice` ci-dessus :
    // 1258+0+0+6+1+0+0+7 = 1272), `total` de `listOffers` (mock non
    // filtrant : 1269).
    await waitFor(() =>
      expect(screen.getByText('1269 dans cet onglet, sur 1272 jugées')).toBeDefined(),
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

  it('n’affiche aucun bouton "Mon CV" quand onImporterCv n’est pas fourni', () => {
    const client = clientFactice();
    render(<MatinScreen client={client} onOuvrirOffre={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Mon CV' })).toBeNull();
  });

  it('le bouton d’en-tête "Mon CV" (libellé de la maquette, P25 point c) appelle onImporterCv au clic', async () => {
    const user = userEvent.setup();
    const client = clientFactice();
    const onImporterCv = vi.fn();
    render(<MatinScreen client={client} onOuvrirOffre={() => {}} onImporterCv={onImporterCv} />);

    const bouton = screen.getByRole('button', { name: 'Mon CV' });
    await user.click(bouton);
    expect(onImporterCv).toHaveBeenCalledOnce();
  });

  it('« Mon CV » et « Mes candidatures » portent chacun une icône SVG (P25 points b et e)', () => {
    const client = clientFactice();
    render(
      <MatinScreen
        client={client}
        onOuvrirOffre={() => {}}
        onImporterCv={() => {}}
        onVoirSuivi={() => {}}
      />,
    );

    const boutonCv = screen.getByRole('button', { name: 'Mon CV' });
    const boutonSuivi = screen.getByRole('button', { name: 'Mes candidatures' });
    expect(boutonCv.querySelector('svg')).not.toBeNull();
    expect(boutonSuivi.querySelector('svg')).not.toBeNull();
  });

  it(
    'affiche un bouton de réglages désactivé dans la barre d’application (P25 point a) — ' +
      'dessiné, pas encore branché : GUIDELINES §5.2',
    () => {
      const client = clientFactice();
      render(<MatinScreen client={client} onOuvrirOffre={() => {}} />);

      const bouton = screen.getByRole('button', { name: 'Réglages des préférences' });
      expect(bouton.getAttribute('disabled')).not.toBeNull();
      expect(bouton.querySelector('svg')).not.toBeNull();
    },
  );

  it(
    'affiche "decidedToday" (vérité serveur de /stats, tâche 10) dans la bande — plus le ' +
      'localStorage de la tâche 7',
    async () => {
      const client = clientFactice();
      render(<MatinScreen client={client} onOuvrirOffre={() => {}} />);
      await waitFor(() => expect(screen.getByText('2 décidées')).toBeDefined());
    },
  );

  it('le repli de "Ce matin" survit à un remontage de l’écran (lireRepli/ecrireRepli réellement branchés)', async () => {
    const user = userEvent.setup();
    const client = clientFactice();
    const { unmount } = render(<MatinScreen client={client} onOuvrirOffre={() => {}} />);

    await waitFor(() => expect(screen.getByText('Offre A')).toBeDefined());
    await user.click(screen.getByRole('button', { name: 'Replier' }));
    expect(screen.queryByText('Offre A')).toBeNull();

    unmount();
    render(<MatinScreen client={client} onOuvrirOffre={() => {}} />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Déplier/ })).not.toBeNull());
    expect(screen.queryByText('Offre A')).toBeNull();
  });

  it('changer d’onglet remet la liste en page 1 et envoie le bon statut', async () => {
    const appels: OffersListFilters[] = [];
    const client = {
      ...clientFactice(),
      listOffers: (filtres: OffersListFilters = {}) => {
        appels.push(filtres);
        return Promise.resolve({ rows: [], total: 0, page: 1, pageSize: 8 });
      },
    };

    render(<MatinScreen client={client} onOuvrirOffre={vi.fn()} />);
    await userEvent.click(await screen.findByRole('tab', { name: /Postulée/ }));

    const dernier = appels.at(-1);
    expect(dernier?.page).toBe(1);
    expect(dernier?.statut).toEqual(['postulee']);
  });

  it('l’onglet par défaut demande les deux valeurs « à traiter »', async () => {
    // Le piège que ce test ferme : `in` ne matche jamais `null`. Si l'onglet
    // par défaut n'envoyait que `a_traiter`, l'écran s'ouvrirait sur une liste
    // VIDE alors que 1 258 offres attendent — et rien ne le signalerait.
    const appels: OffersListFilters[] = [];
    const client = {
      ...clientFactice(),
      listOffers: (filtres: OffersListFilters = {}) => {
        appels.push(filtres);
        return Promise.resolve({ rows: [], total: 0, page: 1, pageSize: 8 });
      },
    };
    render(<MatinScreen client={client} onOuvrirOffre={vi.fn()} />);
    await screen.findAllByRole('tab');
    expect(appels[0]?.statut).toEqual(['aucune', 'a_traiter']);
  });
});
