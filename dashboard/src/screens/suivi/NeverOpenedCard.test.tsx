import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NeverOpenedCard } from './NeverOpenedCard';

describe('NeverOpenedCard', () => {
  it("pendant le chargement, n'affiche aucun compte et désactive le bouton", () => {
    render(<NeverOpenedCard neverOpened={null} chargement onParcourir={() => {}} />);
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.getByRole('button', { name: 'Les parcourir' })).toHaveProperty('disabled', true);
  });

  it('le zéro confirmé (rien laissé de côté) affiche 0 et désactive « les parcourir »', () => {
    render(<NeverOpenedCard neverOpened={0} chargement={false} onParcourir={() => {}} />);
    expect(screen.getByText('0')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Les parcourir' })).toHaveProperty('disabled', true);
  });

  it('affiche le compte réel et déclenche onParcourir au clic', async () => {
    const onParcourir = vi.fn();
    render(<NeverOpenedCard neverOpened={23} chargement={false} onParcourir={onParcourir} />);
    expect(screen.getByText('23')).toBeDefined();
    const bouton = screen.getByRole('button', { name: 'Les parcourir' });
    expect(bouton).toHaveProperty('disabled', false);
    await userEvent.click(bouton);
    expect(onParcourir).toHaveBeenCalledOnce();
  });
});
