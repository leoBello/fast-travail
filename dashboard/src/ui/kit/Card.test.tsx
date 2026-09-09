import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Absent, Card, Field } from './Card';

describe('Card', () => {
  it('rend son titre et son contenu', () => {
    render(
      <Card titre="Rémunération">
        <Field label="TJM">450 €/j</Field>
      </Card>,
    );
    expect(screen.getByText('Rémunération')).toBeDefined();
    expect(screen.getByText('TJM')).toBeDefined();
    expect(screen.getByText('450 €/j')).toBeDefined();
  });

  it('ne rend aucun en-tête si ni titre ni extra ne sont fournis', () => {
    const { container } = render(
      <Card>
        <Field label="Ville">Marseille</Field>
      </Card>,
    );
    expect(container.querySelector('header')).toBeNull();
  });

  it('marque l absence comme un état, sans la faire disparaître', () => {
    // 568 offres sont sans montant (GUIDELINES §3.1) : l'absence est un
    // rendu fréquent, jamais une case vide.
    const { container } = render(<Absent>salaire non publié</Absent>);
    expect(screen.getByText('salaire non publié')).toBeDefined();
    expect(container.querySelector('[data-absent="true"]')).not.toBeNull();
  });
});
