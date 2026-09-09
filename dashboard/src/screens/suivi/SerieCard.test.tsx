import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SerieCard } from './SerieCard';

describe('SerieCard', () => {
  it("pendant le chargement, n'affirme aucun jour — pas de 0, pas de calendrier", () => {
    render(<SerieCard streak={null} chargement />);
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.queryByText('jour de suite')).toBeNull();
    expect(screen.getByText('Chargement…')).toBeDefined();
  });

  it('le jour zéro confirmé (série non commencée) affiche 0, pas une case blanche', () => {
    render(
      <SerieCard
        streak={{
          days: 0,
          recentDays: [
            { date: '2026-09-03', sent: false },
            { date: '2026-09-04', sent: false },
          ],
        }}
        chargement={false}
      />,
    );
    expect(screen.getByText('0')).toBeDefined();
    expect(screen.getByText('série non commencée')).toBeDefined();
  });

  it('affiche le compte de jours réel et le calendrier une fois chargé', () => {
    render(
      <SerieCard
        streak={{
          days: 3,
          recentDays: [
            { date: '2026-09-07', sent: true },
            { date: '2026-09-08', sent: true },
            { date: '2026-09-09', sent: false },
          ],
        }}
        chargement={false}
      />,
    );
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByText('3 jours de suite')).toBeDefined();
  });
});
