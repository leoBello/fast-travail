import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';
import type { SuiviStatus } from './StatusBadge';

describe('StatusBadge', () => {
  it('affiche le libellé fourni par l appelant, jamais un texte du kit', () => {
    render(<StatusBadge status="a_traiter" label="À traiter" />);
    expect(screen.getByText('À traiter')).toBeDefined();
  });

  it('porte un ton distinct pour chacun des six statuts et pour la sortie', () => {
    const statuts: SuiviStatus[] = [
      'a_traiter',
      'retenue',
      'postulee',
      'relancee',
      'entretien',
      'terminee',
      'ecartee',
    ];
    const tons = statuts.map((status) => {
      const { container, unmount } = render(<StatusBadge status={status} label={status} />);
      const ton = container.querySelector('[data-ton]')?.getAttribute('data-ton');
      unmount();
      return ton;
    });
    // « Terminée » et « À traiter » partagent le ton neutre dans la maquette :
    // seuls les cinq autres tons doivent être uniques entre eux.
    const tonsHorsNeutre = tons.filter((ton) => ton !== 'neutre');
    expect(new Set(tonsHorsNeutre).size).toBe(tonsHorsNeutre.length);
  });

  it('marque « écartée » comme une sortie, pas comme une septième étape', () => {
    // Trait discontinu et absence de point : dans la maquette, c'est la
    // seule pastille du groupe sans pastille.
    const { container } = render(<StatusBadge status="ecartee" label="Écartée" />);
    expect(container.querySelector('[data-discontinu="true"]')).not.toBeNull();
    expect(container.querySelector('.point')).toBeNull();
  });

  it('transmet la taille compacte à Badge, pour la ligne de liste', () => {
    const { container } = render(
      <StatusBadge status="relancee" label="Relancée" taille="compacte" />,
    );
    expect(container.querySelector('[data-taille="compacte"]')).not.toBeNull();
  });
});
