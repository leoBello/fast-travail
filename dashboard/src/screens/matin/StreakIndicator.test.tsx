import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StreakIndicator } from './StreakIndicator';

describe('StreakIndicator', () => {
  it('état à zéro : "série non commencée", jamais "0 jour de suite"', () => {
    render(<StreakIndicator jours={0} />);
    expect(screen.getByText('série non commencée')).toBeDefined();
    expect(screen.queryByText(/0 jour/)).toBeNull();
  });

  it('accorde le singulier à un seul jour', () => {
    render(<StreakIndicator jours={1} />);
    expect(screen.getByText('1 jour de suite')).toBeDefined();
  });

  it('accorde le pluriel au-delà de un jour', () => {
    render(<StreakIndicator jours={3} />);
    expect(screen.getByText('3 jours de suite')).toBeDefined();
  });
});
