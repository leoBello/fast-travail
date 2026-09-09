import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { MorningBand } from './MorningBand';
import { ligneOffre } from '../../data/test-fixtures';

const OFFRES = [
  ligneOffre({ id: 'a', title: 'Offre A', final_score: 100 }),
  ligneOffre({ id: 'b', title: 'Offre B', final_score: 95 }),
  ligneOffre({ id: 'c', title: 'Offre C', final_score: 90 }),
];

function props(partiel: Partial<ComponentProps<typeof MorningBand>> = {}) {
  return {
    offers: OFFRES,
    total: 6,
    page: 1,
    onPageChange: vi.fn(),
    decidees: 0,
    streakDays: 0,
    streakChargement: false,
    onDecision: vi.fn(),
    offresEnTraitement: new Set<string>(),
    chargement: false,
    erreur: false,
    onReessayer: vi.fn(),
    ...partiel,
  };
}

describe('MorningBand', () => {
  it('état à zéro CONFIRMÉ (chargement terminé, total === 0) : un vide nommé, jamais une zone blanche', () => {
    render(<MorningBand {...props({ offers: [], total: 0, chargement: false })} />);
    expect(screen.getByText('Rien à décider ce matin')).toBeDefined();
    expect(screen.queryByRole('article')).toBeNull();
  });

  it(
    'état de CHARGEMENT (revue de tâche 7) : n’affirme PAS "0 offre au-dessus de 50", n’affiche ' +
      'pas "Rien à décider" tant que le serveur n’a pas répondu — trois états, jamais confondus',
    () => {
      render(<MorningBand {...props({ offers: [], total: 0, chargement: true })} />);
      // Le défaut exact relevé en revue : `total === 0 && !chargement` était
      // FAUX pendant le chargement (chargement === true), donc le composant
      // tombait dans la branche "chargée" et affichait un total à 0 comme un
      // fait. Aucun de ces deux messages ne doit apparaître ici.
      expect(screen.queryByText('Rien à décider ce matin')).toBeNull();
      expect(screen.queryByText(/0 offre.*sans décision/)).toBeNull();
      expect(screen.queryByText('1–3 sur 6')).toBeNull();
      expect(screen.queryByText('0–0 sur 0')).toBeNull();
      expect(screen.getAllByText('Chargement…').length).toBeGreaterThan(0);
    },
  );

  it('le chargement de la bande et celui de la série sont deux appels indépendants — une série déjà connue s’affiche même si /brief charge encore', () => {
    render(
      <MorningBand
        {...props({
          chargement: true,
          offers: [],
          total: 0,
          streakDays: 5,
          streakChargement: false,
        })}
      />,
    );
    expect(screen.getByText('5 jours de suite')).toBeDefined();
  });

  it("n'affiche jamais plus de trois cartes — la direction A tranchée par la maquette", () => {
    render(<MorningBand {...props()} />);
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('affiche la pagination "1–3 sur 6"', () => {
    render(<MorningBand {...props()} />);
    expect(screen.getByText('1–3 sur 6')).toBeDefined();
  });

  it('appelle onDecision("garder"/"ecarter") avec l’offre exacte cliquée', async () => {
    const user = userEvent.setup();
    const onDecision = vi.fn();
    render(<MorningBand {...props({ onDecision })} />);

    const carteB = screen.getByText('Offre B').closest('article')!;
    await user.click(within(carteB).getByRole('button', { name: 'Garder' }));

    expect(onDecision).toHaveBeenCalledTimes(1);
    expect(onDecision.mock.calls[0][0]).toMatchObject({ id: 'b' });
    expect(onDecision.mock.calls[0][1]).toBe('garder');
  });

  it('désactive les boutons uniquement pour l’offre en traitement, pas les deux autres', () => {
    render(<MorningBand {...props({ offresEnTraitement: new Set(['b']) })} />);
    const carteA = screen.getByText('Offre A').closest('article')!;
    const carteB = screen.getByText('Offre B').closest('article')!;
    expect(within(carteA).getByRole('button', { name: 'Garder' })).toHaveProperty(
      'disabled',
      false,
    );
    expect(within(carteB).getByRole('button', { name: 'Garder' })).toHaveProperty('disabled', true);
  });

  it('état d’erreur : un message nommé, avec un moyen de réessayer', async () => {
    const user = userEvent.setup();
    const onReessayer = vi.fn();
    render(<MorningBand {...props({ erreur: true, onReessayer })} />);
    expect(screen.getByText('Le chargement a échoué')).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onReessayer).toHaveBeenCalledTimes(1);
  });

  it('n’affirme pas "série non commencée" tant que /stats n’a pas répondu (streakChargement)', () => {
    render(<MorningBand {...props({ streakChargement: true, streakDays: 0 })} />);
    expect(screen.queryByText('série non commencée')).toBeNull();
  });

  it('la barre "décidées" démarre à zéro sans confondre avec un état non-zéro', () => {
    const { container } = render(<MorningBand {...props({ decidees: 0 })} />);
    expect(container.querySelectorAll('[data-rempli="true"]')).toHaveLength(0);
  });
});
