import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OfferRow } from './OfferRow';
import { ligneOffre } from '../../data/test-fixtures';

describe('OfferRow', () => {
  it('affiche rang et correspondance, toujours ensemble', () => {
    render(<OfferRow offer={ligneOffre({ final_score: 94, fit_score: 68 })} />);
    expect(screen.getByText('94')).toBeDefined();
    expect(screen.getByText('68')).toBeDefined();
  });

  it("nomme l'employeur et le lieu absents plutôt que de laisser une case vide", () => {
    const { container } = render(
      <OfferRow offer={ligneOffre({ company_name: null, city: null, department: null })} />,
    );
    expect(container.querySelector('[data-nature="non-publiee"]')).not.toBeNull();
    expect(container.querySelector('[data-nature="non-precisee"]')).not.toBeNull();
  });

  it('affiche le badge "N sources" seulement quand le groupe compte plus d’un membre', () => {
    const { rerender } = render(<OfferRow offer={ligneOffre({ group_size: 1 })} />);
    expect(screen.queryByText(/sources/)).toBeNull();

    rerender(<OfferRow offer={ligneOffre({ group_size: 2 })} />);
    expect(screen.getByText('2 sources')).toBeDefined();
  });

  it('affiche les jours écoulés depuis la publication', () => {
    const hier = new Date(Date.now() - 86_400_000).toISOString();
    render(<OfferRow offer={ligneOffre({ published_at: hier })} />);
    expect(screen.getByText('1 j')).toBeDefined();
  });
});
