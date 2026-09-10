import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { OfferList } from './OfferList';
import { ligneOffre } from '../../data/test-fixtures';
import type { StatutCounts } from '../../data/types';

const COMPTES: StatutCounts = {
  aucune: 1258,
  a_traiter: 0,
  retenue: 0,
  postulee: 6,
  relancee: 1,
  entretien: 0,
  terminee: 0,
  ecartee: 7,
};

function props(partiel: Partial<ComponentProps<typeof OfferList>> = {}) {
  return {
    offers: [ligneOffre({ id: 'x', title: 'Une offre' })],
    total: 1269,
    page: 1,
    pageSize: 50,
    onPageChange: vi.fn(),
    sort: 'final_score' as const,
    onSortChange: vi.fn(),
    onOuvrirOffre: vi.fn(),
    neverOpened: 23,
    statsChargement: false,
    filtresOuverts: false,
    onToggleFiltres: vi.fn(),
    panneauFiltres: <div data-testid="panneau-filtres" />,
    chargement: false,
    erreur: false,
    onReessayer: vi.fn(),
    salaireFloor: 40000,
    onglet: 'a_traiter' as const,
    onOngletChange: vi.fn(),
    comptesStatut: null,
    totalCorpus: 1272,
    filtresActifs: false,
    ...partiel,
  };
}

describe('OfferList', () => {
  it('affiche "rien de masqué" avec le total réel, sur l’onglet Toutes', () => {
    render(<OfferList {...props({ onglet: 'toutes', total: 1269, totalCorpus: 1269 })} />);
    expect(screen.getByText('1269 offres jugées, rien de masqué')).toBeDefined();
  });

  it('état à zéro du compteur anti-perte : un message rassurant, pas un badge vide', () => {
    render(<OfferList {...props({ neverOpened: 0 })} />);
    expect(screen.getByText('Rien laissé de côté au-dessus de 50')).toBeDefined();
    expect(screen.queryByText(/jamais ouverte/)).toBeNull();
  });

  it('affiche le compte anti-perte quand il est non nul', () => {
    render(<OfferList {...props({ neverOpened: 23 })} />);
    expect(screen.getByText('23 jamais ouvertes au-dessus de 50')).toBeDefined();
  });

  it('le basculeur de tri alterne entre rang et correspondance', async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    const { rerender } = render(<OfferList {...props({ sort: 'final_score', onSortChange })} />);
    expect(screen.getByText('Tri : rang')).toBeDefined();

    await user.click(screen.getByText('Tri : rang'));
    expect(onSortChange).toHaveBeenCalledWith('fit_score');

    rerender(<OfferList {...props({ sort: 'fit_score', onSortChange })} />);
    expect(screen.getByText('Tri : correspondance')).toBeDefined();
  });

  it('le panneau de filtres ne se monte que lorsque filtresOuverts est vrai', () => {
    const { rerender } = render(<OfferList {...props({ filtresOuverts: false })} />);
    expect(screen.queryByTestId('panneau-filtres')).toBeNull();

    rerender(<OfferList {...props({ filtresOuverts: true })} />);
    expect(screen.getByTestId('panneau-filtres')).toBeDefined();
  });

  it('état vide sur l’onglet « Toutes » (aucun résultat filtré) : un vide nommé, jamais une liste blanche', () => {
    render(<OfferList {...props({ onglet: 'toutes', offers: [], total: 0 })} />);
    expect(screen.getByText('Aucune offre ne correspond')).toBeDefined();
  });

  it('rend la barre d’onglets', () => {
    render(<OfferList {...props({ comptesStatut: COMPTES })} />);
    expect(screen.getAllByRole('tab')).toHaveLength(8);
  });

  it('« rien de masqué » ne se dit QUE sur l’onglet Toutes', () => {
    render(<OfferList {...props({ onglet: 'toutes', total: 1272, totalCorpus: 1272 })} />);
    expect(screen.getByText(/rien de masqué/)).toBeDefined();
  });

  it('sur un onglet qui filtre, la phrase dit ce que l’onglet montre ET le total', () => {
    render(<OfferList {...props({ onglet: 'postulee', total: 6, totalCorpus: 1272 })} />);
    expect(screen.queryByText(/rien de masqué/)).toBeNull();
    expect(screen.getByText(/6 dans cet onglet, sur 1272 jugées/)).toBeDefined();
  });

  it('la colonne Lieu cède la place à Statut hors de l’onglet « À traiter »', () => {
    render(<OfferList {...props({ onglet: 'toutes' })} />);
    expect(screen.getByText('Statut')).toBeDefined();
    expect(screen.queryByText('Lieu')).toBeNull();
  });

  it('un onglet vide affiche un titre SPÉCIFIQUE à son statut, jamais une formule passe-partout', () => {
    const { rerender } = render(
      <OfferList {...props({ onglet: 'retenue', offers: [], total: 0 })} />,
    );
    expect(screen.getByText('Aucune offre retenue pour l’instant')).toBeDefined();

    rerender(<OfferList {...props({ onglet: 'postulee', offers: [], total: 0 })} />);
    expect(screen.getByText('Aucune offre postulée pour l’instant')).toBeDefined();
  });

  it('le bouton du vide porte le compte réel de « à traiter » et bascule l’onglet à son clic', async () => {
    const user = userEvent.setup();
    const onOngletChange = vi.fn();
    render(
      <OfferList
        {...props({
          onglet: 'retenue',
          offers: [],
          total: 0,
          comptesStatut: COMPTES,
          onOngletChange,
        })}
      />,
    );
    const bouton = screen.getByRole('button', { name: 'Voir les 1258 à traiter' });
    await user.click(bouton);
    expect(onOngletChange).toHaveBeenCalledWith('a_traiter');
  });

  it('comptes non reçus : le vide de l’onglet n’affiche aucun bouton, et aucun chiffre ne fuit', () => {
    render(
      <OfferList {...props({ onglet: 'retenue', offers: [], total: 0, comptesStatut: null })} />,
    );
    expect(screen.getByText('Aucune offre retenue pour l’instant')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Voir/ })).toBeNull();
    expect(screen.queryByText(/Voir les/)).toBeNull();
  });

  it(
    'état de CHARGEMENT (revue de tâche 7) : n’affirme PAS "0 offre jugée, rien de masqué" ni ' +
      '"Aucune offre ne correspond" tant que le serveur n’a pas répondu',
    () => {
      render(<OfferList {...props({ offers: [], total: 0, chargement: true })} />);
      expect(screen.queryByText(/offres? jugée/)).toBeNull();
      expect(screen.queryByText('Aucune offre ne correspond')).toBeNull();
      expect(screen.getAllByText('Chargement…').length).toBeGreaterThan(0);
    },
  );

  it('le compteur anti-perte reste à blanc (jamais "0") tant que /stats n’a pas répondu', () => {
    // `getByText('…')` seul est devenu ambigu depuis la numérotation de
    // pages (tâche 10) : l'ellipse `Pagination` porte le même caractère.
    // `data-ton="neutre"` isole le badge « compte en attente » sans dépendre
    // du nom de classe généré par les CSS Modules (voir Badge.tsx).
    const { container } = render(
      <OfferList {...props({ statsChargement: true, neverOpened: 0 })} />,
    );
    expect(screen.queryByText('Rien laissé de côté au-dessus de 50')).toBeNull();
    expect(screen.queryByText(/jamais ouverte/)).toBeNull();
    const badge = container.querySelector('[data-ton="neutre"][data-discontinu="true"]');
    expect(badge?.textContent).toBe('…');
  });

  it('ne coche/n’active aucun filtre implicite : le bouton Filtres reste neutre au départ', () => {
    render(<OfferList {...props({ filtresOuverts: false })} />);
    const bouton = screen.getByRole('button', { name: 'Filtres' });
    expect(bouton.getAttribute('aria-expanded')).toBe('false');
  });
});
