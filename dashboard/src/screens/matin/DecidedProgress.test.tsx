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
});
