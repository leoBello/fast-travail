import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Funnel } from './Funnel';

const FUNNEL_NON_VIDE = {
  collected: 4146,
  scored: 1269,
  aboveThreshold: 61,
  retained: 12,
  applied: 5,
};

describe('Funnel', () => {
  it(
    "pendant le chargement, n'affirme AUCUN chiffre — surtout pas 0 (le piège nommé par " +
      'task-9-brief.md)',
    () => {
      render(<Funnel funnel={null} chargement erreur={false} onReessayer={() => {}} />);
      expect(screen.queryByText('0')).toBeNull();
      expect(screen.queryByText('4146')).toBeNull();
      const segments = screen.getByRole('img');
      expect(segments.dataset.chargement).toBe('true');
    },
  );

  it('affiche les cinq nombres réels quand les données sont chargées', () => {
    render(
      <Funnel funnel={FUNNEL_NON_VIDE} chargement={false} erreur={false} onReessayer={() => {}} />,
    );
    expect(screen.getByText('4146')).toBeDefined();
    expect(screen.getByText('1269')).toBeDefined();
    expect(screen.getByText('61')).toBeDefined();
    expect(screen.getByText('12')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();
  });

  it(
    'le jour zéro (rien retenu, rien postulé) affiche 0 sur les deux dernières étapes SANS ' +
      "faire disparaître l'entonnoir — un fait confirmé, pas un vide (GUIDELINES §3.3)",
    () => {
      render(
        <Funnel
          funnel={{ collected: 4146, scored: 1269, aboveThreshold: 61, retained: 0, applied: 0 }}
          chargement={false}
          erreur={false}
          onReessayer={() => {}}
        />,
      );
      const zeros = screen.getAllByText('0');
      expect(zeros).toHaveLength(2);
    },
  );

  it("l'échec de chargement affiche un état nommé et permet de réessayer", async () => {
    const onReessayer = vi.fn();
    render(<Funnel funnel={null} chargement={false} erreur onReessayer={onReessayer} />);
    expect(screen.getByText('Le chargement a échoué')).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onReessayer).toHaveBeenCalledOnce();
  });
});
