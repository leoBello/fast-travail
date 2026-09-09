import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DecidedProgress } from './DecidedProgress';

describe('DecidedProgress', () => {
  it('état à zéro : tous les segments vides, un aria-label dédié — jamais "0 sur N"', () => {
    const { container } = render(<DecidedProgress decidees={0} total={6} />);
    expect(screen.getByText('0 décidées')).toBeDefined();
    expect(screen.getByRole('img', { name: 'aucune offre décidée' })).toBeDefined();
    expect(container.querySelectorAll('[data-rempli="true"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-rempli="false"]')).toHaveLength(10);
  });

  it('accorde le singulier à une seule décision', () => {
    render(<DecidedProgress decidees={1} total={6} />);
    expect(screen.getByText('1 décidée')).toBeDefined();
  });

  it('remplit les segments proportionnellement à decidees/total', () => {
    const { container } = render(<DecidedProgress decidees={4} total={10} />);
    expect(screen.getByText('4 décidées')).toBeDefined();
    expect(screen.getByRole('img', { name: '4 offres décidées sur 10' })).toBeDefined();
    expect(container.querySelectorAll('[data-rempli="true"]')).toHaveLength(4);
  });

  it('ne dépasse jamais dix segments remplis, même si decidees > total (défensif)', () => {
    const { container } = render(<DecidedProgress decidees={12} total={10} />);
    expect(container.querySelectorAll('[data-rempli="true"]')).toHaveLength(10);
  });

  it('ne divise jamais par zéro quand total vaut 0 (la bande est vide)', () => {
    const { container } = render(<DecidedProgress decidees={0} total={0} />);
    expect(container.querySelectorAll('[data-rempli="true"]')).toHaveLength(0);
  });

  it(
    'PENDANT le chargement, avec decidees > 0 (compteur persisté, revue de tâche 7, ' +
      'deuxième passe) : la jauge reste à blanc — ne prétend PAS "tout est décidé" avant ' +
      "que le serveur n'ait confirmé le total",
    () => {
      // Le scénario exact démontré en revue, à la valeur EXACTE que
      // `MorningBand` calcule et transmet : `decidees=2` (lu depuis
      // `localStorage` au montage, avant toute réponse réseau), et
      // `total` reçu ICI vaut `total + decidees` où le `total` brut (le
      // brief) est encore 0 (valeur initiale, avant que `/brief` ne
      // réponde) — donc `total=2`, PAS `total=0`. Passer `total={0}` ici
      // rendrait ce test aveugle : `total > 0` serait déjà faux tout seul,
      // sans le garde `chargement`, et la mutation qui a rouvert ce défaut
      // (retrait du garde) passerait à tort — vérifié par mutation
      // ci-dessous, voir le rapport de tâche. Sans `chargement`, ce
      // scénario calculait `round(2/2*10) = 10 segments sur 10` —
      // "toutes les offres du jour sont décidées" affirmé à tort.
      const { container } = render(<DecidedProgress decidees={2} total={2} chargement />);
      expect(container.querySelectorAll('[data-rempli="true"]')).toHaveLength(0);
      expect(container.querySelectorAll('[data-rempli="false"]')).toHaveLength(10);
    },
  );

  it(
    'la légende masque le nombre pendant le chargement (tâche 10) — "decidees" est ' +
      'désormais un fait SERVEUR (`/stats.decidedToday`) comme `total`, jamais affiché avant confirmation',
    () => {
      render(<DecidedProgress decidees={2} total={2} chargement />);
      expect(screen.queryByText('2 décidées')).toBeNull();
      expect(screen.getByText('…')).toBeDefined();
    },
  );

  it('l’aria-label pendant le chargement ne prétend aucune proportion ("X sur Y")', () => {
    render(<DecidedProgress decidees={2} total={2} chargement />);
    expect(screen.queryByRole('img', { name: /sur/ })).toBeNull();
  });
});
