import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('nomme le vide et dit ce qu il signifie', () => {
    render(
      <EmptyState
        titre="Rien à décider ce matin"
        detail="Les six offres du jour sont traitées. C'est le résultat normal du travail fait."
      />,
    );
    expect(screen.getByText('Rien à décider ce matin')).toBeDefined();
    expect(screen.getByText(/résultat normal du travail fait/)).toBeDefined();
  });

  it('sans `action`, aucun geste ne s’affiche sous le détail', () => {
    render(<EmptyState titre="Vide" detail="Détail." />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('avec `action`, le geste fourni par l’appelant s’affiche sous le détail', () => {
    render(
      <EmptyState titre="Vide" detail="Détail." action={<button type="button">Un geste</button>} />,
    );
    expect(screen.getByRole('button', { name: 'Un geste' })).toBeDefined();
  });
});
