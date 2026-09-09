import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RankSection } from './RankSection';
import { ligneOffre } from '../../data/test-fixtures';

describe('RankSection', () => {
  it('affiche toujours le couple rang/correspondance ensemble (GUIDELINES §3.4)', () => {
    render(<RankSection offer={ligneOffre({ final_score: 86.5, fit_score: 58 })} />);
    expect(screen.getByText('86.5')).toBeDefined();
    expect(screen.getByText('58')).toBeDefined();
  });

  it('rend un jeton par bonus/malus non nul, signé', () => {
    render(
      <RankSection
        offer={ligneOffre({
          work_mode: 'full_remote',
          bonus_remote: 15,
          engagement: 'freelance',
          bonus_engagement: 12,
        })}
      />,
    );
    expect(screen.getByText('+15 Full remote')).toBeDefined();
    expect(screen.getByText('+12 Freelance')).toBeDefined();
  });

  it('ne rend aucun jeton quand tous les bonus/malus sont à zéro', () => {
    const { container } = render(<RankSection offer={ligneOffre()} />);
    expect(container.querySelector('[data-signe]')).toBeNull();
  });
});
