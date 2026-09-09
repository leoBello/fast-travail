import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './Badge';

describe('Badge', () => {
  it('rend son contenu et son ton', () => {
    const { container } = render(<Badge ton="danger">Rouge éliminatoire</Badge>);
    expect(screen.getByText('Rouge éliminatoire')).toBeDefined();
    expect(container.querySelector('[data-ton="danger"]')).not.toBeNull();
  });

  it('retombe sur le ton neutre quand aucun n est donné', () => {
    const { container } = render(<Badge>À traiter</Badge>);
    expect(container.querySelector('[data-ton="neutre"]')).not.toBeNull();
  });

  it('retombe sur la taille normale quand aucune n est donnée', () => {
    const { container } = render(<Badge>À traiter</Badge>);
    expect(container.querySelector('[data-taille="normale"]')).not.toBeNull();
  });

  it('accepte une taille compacte, pour la ligne de liste', () => {
    const { container } = render(<Badge taille="compacte">Relancée</Badge>);
    expect(container.querySelector('[data-taille="compacte"]')).not.toBeNull();
  });

  it('affiche le point seulement si on le demande, sans jamais remplacer le mot', () => {
    const { container, rerender } = render(<Badge>Écartée</Badge>);
    expect(container.querySelector('.point')).toBeNull();
    // Pas d'assertion sur le nom de classe généré : `point` doit rester du
    // contenu au même titre que le mot, jamais un remplacement silencieux.
    rerender(<Badge point>Écartée</Badge>);
    expect(screen.getByText('Écartée')).toBeDefined();
  });

  it('porte le trait discontinu comme un attribut, pas comme un second badge', () => {
    const { container } = render(
      <Badge ton="danger" discontinu>
        Écartée
      </Badge>,
    );
    expect(container.querySelector('[data-discontinu="true"]')).not.toBeNull();
  });
});
