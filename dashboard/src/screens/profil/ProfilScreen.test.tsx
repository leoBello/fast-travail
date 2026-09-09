import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardClient } from '../../data/client';
import { DashboardApiError } from '../../data/client';
import { ProfilScreen } from './ProfilScreen';

function clientFactice(overrides: Partial<DashboardClient> = {}): DashboardClient {
  return {
    listOffers: vi.fn(),
    listBrief: vi.fn(),
    getStats: vi.fn(),
    getOfferDetail: vi.fn(),
    openOffer: vi.fn(),
    patchApplication: vi.fn(),
    getConfig: vi.fn().mockResolvedValue({
      scoringWeights: { salaire_floor: 40000 },
      activeProfile: {
        id: 1,
        label: 'CV Léo Bello — front-end senior',
        profileVersion: 'cv-2026-09-08',
        seniorityYears: 7,
        createdAt: '2026-09-08T00:00:00.000Z',
      },
      cvSkills: ['react', 'typescript'],
      staleProfileOfferCount: 0,
    }),
    importCandidateProfile: vi.fn(),
    getWorkModeCounts: vi
      .fn()
      .mockResolvedValue({ full_remote: 173, hybride: 150, sur_site: 88, non_precise: 861 }),
    ...overrides,
  };
}

describe('ProfilScreen — l’import du CV (tâche 10)', () => {
  it('affiche le profil actif et le compte d’offres à profil antérieur, chiffrés par le serveur', async () => {
    const client = clientFactice({
      getConfig: vi.fn().mockResolvedValue({
        scoringWeights: { salaire_floor: 40000 },
        activeProfile: {
          id: 1,
          label: 'CV Léo Bello',
          profileVersion: 'cv-2026-09-08',
          seniorityYears: 7,
          createdAt: '2026-09-08T00:00:00.000Z',
        },
        cvSkills: [],
        staleProfileOfferCount: 42,
      }),
    });
    render(<ProfilScreen client={client} onRetour={() => {}} />);

    await waitFor(() => expect(screen.getByText('CV Léo Bello')).toBeDefined());
    expect(screen.getByText('version cv-2026-09-08')).toBeDefined();
    expect(screen.getByText(/^42 offres jugées sous un profil antérieur —/)).toBeDefined();
  });

  it('aucun profil actif : le dit, jamais une case vide', async () => {
    const client = clientFactice({
      getConfig: vi.fn().mockResolvedValue({
        scoringWeights: {},
        activeProfile: null,
        cvSkills: [],
        staleProfileOfferCount: 0,
      }),
    });
    render(<ProfilScreen client={client} onRetour={() => {}} />);
    await waitFor(() => expect(screen.getByText('Aucun profil actif')).toBeDefined());
  });

  it(
    'l’import réussi affiche la confirmation SANS jamais prétendre qu’une offre a été ' +
      'rejugée (CLAUDE.md : décision tranchée) — et ne propose aucun bouton pour rejuger',
    async () => {
      const user = userEvent.setup();
      const client = clientFactice({
        importCandidateProfile: vi.fn().mockResolvedValue({
          profile: {
            id: 2,
            label: 'CV v2',
            profileVersion: 'cv-2026-09-09',
            seniorityYears: 7,
            createdAt: '2026-09-09T10:00:00.000Z',
          },
          staleProfileOfferCount: 1269,
        }),
      });
      render(<ProfilScreen client={client} onRetour={() => {}} />);

      await waitFor(() => expect(screen.getByLabelText('Nom du CV')).toBeDefined());
      await user.type(screen.getByLabelText('Nom du CV'), 'CV v2');
      await user.type(screen.getByLabelText('Texte du CV'), 'texte du CV');
      await user.type(screen.getByLabelText("Années d'expérience"), '7');
      await user.type(screen.getByLabelText('Version du profil'), 'cv-2026-09-09');
      await user.click(screen.getByRole('button', { name: 'Importer' }));

      await waitFor(() => expect(screen.getByText('CV importé')).toBeDefined());
      expect(client.importCandidateProfile).toHaveBeenCalledWith({
        label: 'CV v2',
        cvText: 'texte du CV',
        seniorityYears: 7,
        profileVersion: 'cv-2026-09-09',
      });
      // Aucun mot ne doit évoquer un jugement/score/rejugement dans la
      // confirmation — seulement le fait de l'import et le compte inchangé.
      expect(screen.getByText(/Aucune offre n'a été rejugée/)).toBeDefined();
      expect(screen.getByText(/^1269 offres jugées sous un profil antérieur —/)).toBeDefined();
      // Aucun bouton pour rejuger, nulle part sur l'écran : le rejugement
      // volontaire reste une commande (`npm run score:backfill --
      // --rejudge-stale-profile`), jamais un geste possible depuis la SPA.
      expect(screen.queryByRole('button', { name: /rejuger/i })).toBeNull();
    },
  );

  it('une erreur de validation serveur (400) affiche le message du serveur, sans planter', async () => {
    const user = userEvent.setup();
    const client = clientFactice({
      importCandidateProfile: vi
        .fn()
        .mockRejectedValue(new DashboardApiError(400, '"profileVersion" doit différer')),
    });
    render(<ProfilScreen client={client} onRetour={() => {}} />);

    await waitFor(() => expect(screen.getByLabelText('Nom du CV')).toBeDefined());
    await user.type(screen.getByLabelText('Nom du CV'), 'CV');
    await user.type(screen.getByLabelText('Texte du CV'), 'texte');
    await user.type(screen.getByLabelText("Années d'expérience"), '7');
    await user.type(screen.getByLabelText('Version du profil'), 'cv-2026-09-08');
    await user.click(screen.getByRole('button', { name: 'Importer' }));

    await waitFor(() => expect(screen.getByText('"profileVersion" doit différer')).toBeDefined());
  });

  it('le bouton "Retour" appelle onRetour', async () => {
    const user = userEvent.setup();
    const onRetour = vi.fn();
    render(<ProfilScreen client={clientFactice()} onRetour={onRetour} />);
    await user.click(screen.getByRole('button', { name: 'Retour' }));
    expect(onRetour).toHaveBeenCalledOnce();
  });
});
