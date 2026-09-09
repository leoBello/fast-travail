import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { OfferList } from './OfferList';
import { ligneOffre } from '../../data/test-fixtures';

function props(partiel: Partial<ComponentProps<typeof OfferList>> = {}) {
  return {
    offers: [ligneOffre({ id: 'x', title: 'Une offre' })],
    total: 1269,
    page: 1,
    pageSize: 50,
    onPageChange: vi.fn(),
    sort: 'final_score' as const,
    onSortChange: vi.fn(),
    neverOpened: 23,
    filtresOuverts: false,
    onToggleFiltres: vi.fn(),
    panneauFiltres: <div data-testid="panneau-filtres" />,
    chargement: false,
    erreur: false,
    onReessayer: vi.fn(),
    ...partiel,
  };
}

describe('OfferList', () => {
  it('affiche "rien de masqué" avec le total réel', () => {
    render(<OfferList {...props({ total: 1269 })} />);
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

  it('état vide (aucun résultat filtré) : un vide nommé, jamais une liste blanche', () => {
    render(<OfferList {...props({ offers: [], total: 0 })} />);
    expect(screen.getByText('Aucune offre ne correspond')).toBeDefined();
  });

  it('ne coche/n’active aucun filtre implicite : le bouton Filtres reste neutre au départ', () => {
    render(<OfferList {...props({ filtresOuverts: false })} />);
    const bouton = screen.getByRole('button', { name: 'Filtres' });
    expect(bouton.getAttribute('aria-expanded')).toBe('false');
  });
});
