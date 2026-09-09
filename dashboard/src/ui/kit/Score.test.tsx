import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Score } from './Score';

describe('Score', () => {
  it('affiche toujours les deux nombres ensemble', () => {
    // GUIDELINES §3.4 : aucune prop ne permet de rendre l'un sans l'autre.
    // Le test ne fait qu'observer ce que le typage impose déjà — `fit` et
    // `final` sont tous deux requis.
    render(<Score final={79} fit={42} libelleFinal="rang" libelleFit="corresp." jetons={[]} />);
    expect(screen.getByText('79')).toBeDefined();
    expect(screen.getByText('42')).toBeDefined();
    expect(screen.getByText('rang')).toBeDefined();
    expect(screen.getByText('corresp.')).toBeDefined();
  });

  it('signe les jetons positifs avec un plus', () => {
    render(
      <Score
        final={79}
        fit={42}
        libelleFinal="rang"
        libelleFit="corresp."
        jetons={[{ cle: 'remote', libelle: 'remote', valeur: 15 }]}
      />,
    );
    expect(screen.getByText('+15 remote')).toBeDefined();
  });

  it('signe les jetons négatifs avec un moins typographique', () => {
    render(
      <Score
        final={79}
        fit={42}
        libelleFinal="rang"
        libelleFit="corresp."
        jetons={[{ cle: 'technos', libelle: 'technos', valeur: -15 }]}
      />,
    );
    // U+2212, pas un trait d'union U+002D : la maquette (Composants.dc.html)
    // rend « −15 technos », signe moins typographique.
    expect(screen.getByText('−15 technos')).toBeDefined();
  });

  it('affiche 0 sans signe pour un jeton neutre', () => {
    render(
      <Score
        final={79}
        fit={42}
        libelleFinal="rang"
        libelleFit="corresp."
        jetons={[{ cle: 'fraicheur', libelle: 'fraîcheur', valeur: 0 }]}
      />,
    );
    expect(screen.getByText('0 fraîcheur')).toBeDefined();
  });

  it('ne rend aucune rangée de jetons quand la décomposition est vide', () => {
    const { container } = render(
      <Score final={79} fit={42} libelleFinal="rang" libelleFit="corresp." jetons={[]} />,
    );
    expect(container.querySelector('[data-signe]')).toBeNull();
  });
});
