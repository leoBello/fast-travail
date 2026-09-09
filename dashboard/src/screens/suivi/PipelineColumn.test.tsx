import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ligneOffre } from '../../data/test-fixtures';
import { PipelineColumn } from './PipelineColumn';
import { RELANCE_DUE_DAYS } from './relance';
import type { OfferDashboardRow, PageResult } from '../../data/types';

function page(rows: OfferDashboardRow[], total: number): PageResult<OfferDashboardRow> {
  return { rows, total, page: 1, pageSize: 3 };
}

describe('PipelineColumn', () => {
  it("pendant le chargement, n'affirme aucun compte (pas de 0 avant la réponse du serveur)", () => {
    render(
      <PipelineColumn
        statut="retenue"
        state={{ statut: 'chargement' }}
        onReessayer={() => {}}
        onOuvrirOffre={() => {}}
      />,
    );
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.getByText('…')).toBeDefined();
  });

  it('affiche un état nommé, et permet de réessayer, sur une erreur réseau', async () => {
    const onReessayer = vi.fn();
    render(
      <PipelineColumn
        statut="retenue"
        state={{ statut: 'erreur', erreur: new Error('x') }}
        onReessayer={onReessayer}
        onOuvrirOffre={() => {}}
      />,
    );
    expect(screen.getByText('Le chargement a échoué')).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onReessayer).toHaveBeenCalledOnce();
  });

  it('le jour zéro confirmé (0 offre à ce statut) affiche un vide NOMMÉ, pas une zone blanche', () => {
    render(
      <PipelineColumn
        statut="entretien"
        state={{ statut: 'succes', donnees: page([], 0) }}
        onReessayer={() => {}}
        onOuvrirOffre={() => {}}
      />,
    );
    expect(screen.getByText('Rien pour le moment')).toBeDefined();
    expect(screen.getByText('0')).toBeDefined();
  });

  it('replie le surplus sous « + N autres » sans jamais recompter côté client', () => {
    const lignes = [
      ligneOffre({ id: '1', title: 'Une' }),
      ligneOffre({ id: '2', title: 'Deux' }),
      ligneOffre({ id: '3', title: 'Trois' }),
    ];
    render(
      <PipelineColumn
        statut="retenue"
        state={{ statut: 'succes', donnees: page(lignes, 12) }}
        onReessayer={() => {}}
        onOuvrirOffre={() => {}}
      />,
    );
    expect(screen.getByText('12')).toBeDefined();
    expect(screen.getByText('+ 9 autres')).toBeDefined();
  });

  it('ouvre le détail au clic sur le titre de la carte', async () => {
    const onOuvrirOffre = vi.fn();
    render(
      <PipelineColumn
        statut="retenue"
        state={{ statut: 'succes', donnees: page([ligneOffre({ id: 'abc' })], 1) }}
        onReessayer={() => {}}
        onOuvrirOffre={onOuvrirOffre}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Développeur React' }));
    expect(onOuvrirOffre).toHaveBeenCalledWith('abc');
  });

  it('signale la relance due au-delà du seuil, sur la colonne « postulée »', () => {
    const envoyeeIlYA = (jours: number) => new Date(Date.now() - jours * 86_400_000).toISOString();
    render(
      <PipelineColumn
        statut="postulee"
        state={{
          statut: 'succes',
          donnees: page([ligneOffre({ candidature_envoyee_le: envoyeeIlYA(RELANCE_DUE_DAYS) })], 1),
        }}
        onReessayer={() => {}}
        onOuvrirOffre={() => {}}
      />,
    );
    expect(screen.getByText('relance due')).toBeDefined();
  });

  it("n'affiche pas de relance due avant le seuil — un fait calculé, pas devancé", () => {
    const envoyeeIlYA = (jours: number) => new Date(Date.now() - jours * 86_400_000).toISOString();
    render(
      <PipelineColumn
        statut="postulee"
        state={{
          statut: 'succes',
          donnees: page(
            [ligneOffre({ candidature_envoyee_le: envoyeeIlYA(RELANCE_DUE_DAYS - 1) })],
            1,
          ),
        }}
        onReessayer={() => {}}
        onOuvrirOffre={() => {}}
      />,
    );
    expect(screen.queryByText('relance due')).toBeNull();
    expect(screen.getByText(`envoyée il y a ${RELANCE_DUE_DAYS - 1} j`)).toBeDefined();
  });

  it('affiche « relancée il y a N j » sur la colonne « relancée »', () => {
    const ilYA2Jours = new Date(Date.now() - 2 * 86_400_000).toISOString();
    render(
      <PipelineColumn
        statut="relancee"
        state={{
          statut: 'succes',
          donnees: page([ligneOffre({ candidature_relancee_le: ilYA2Jours })], 1),
        }}
        onReessayer={() => {}}
        onOuvrirOffre={() => {}}
      />,
    );
    expect(screen.getByText('relancée il y a 2 j')).toBeDefined();
  });

  it('affiche la date d’entretien sur la colonne « entretien »', () => {
    render(
      <PipelineColumn
        statut="entretien"
        state={{
          statut: 'succes',
          donnees: page([ligneOffre({ candidature_entretien_le: '2026-09-11T13:00:00.000Z' })], 1),
        }}
        onReessayer={() => {}}
        onOuvrirOffre={() => {}}
      />,
    );
    expect(screen.getByText('entretien le 11 septembre')).toBeDefined();
  });
});
