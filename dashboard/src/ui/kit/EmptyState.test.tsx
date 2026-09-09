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
});
