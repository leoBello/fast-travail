import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterPanel } from './FilterPanel';

const COMPTES = { full_remote: 175, hybride: 143, sur_site: 88, non_precise: 863 };

describe('FilterPanel', () => {
  it('aucune case n’est cochée au démarrage — la liste complète ne masque rien', () => {
    render(<FilterPanel valeurs={{}} onChange={() => {}} comptesModeTravail={COMPTES} />);
    for (const case_ of screen.getAllByRole('checkbox')) {
      expect(case_).toHaveProperty('checked', false);
    }
  });

  it('la ligne "non précisé" est visible, chiffrée (863) et cochable (GUIDELINES §3.2)', () => {
    render(<FilterPanel valeurs={{}} onChange={() => {}} comptesModeTravail={COMPTES} />);
    const ligne = screen.getByText('Non précisé').closest('label');
    expect(ligne).not.toBeNull();
    expect(ligne?.textContent).toContain('863');
    const case_ = ligne?.querySelector('input[type="checkbox"]');
    expect(case_).not.toBeNull();
    expect(case_).toHaveProperty('disabled', false);
  });

  it('affiche un compte à blanc, jamais un zéro trompeur, tant que les comptes ne sont pas chargés', () => {
    render(<FilterPanel valeurs={{}} onChange={() => {}} comptesModeTravail={null} />);
    expect(screen.queryByText('863')).toBeNull();
    expect(screen.getAllByText('…').length).toBeGreaterThan(0);
  });

  it('ne coche jamais deux modes de travail à la fois — un clic remplace la sélection précédente', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <FilterPanel valeurs={{}} onChange={onChange} comptesModeTravail={COMPTES} />,
    );

    await user.click(screen.getByText('Full remote').closest('label')!.querySelector('input')!);
    expect(onChange).toHaveBeenCalledWith({ workMode: 'full_remote' });

    rerender(
      <FilterPanel
        valeurs={{ workMode: 'full_remote' }}
        onChange={onChange}
        comptesModeTravail={COMPTES}
      />,
    );
    await user.click(screen.getByText('Non précisé').closest('label')!.querySelector('input')!);
    expect(onChange).toHaveBeenLastCalledWith({ workMode: 'non_precise' });
  });

  it('décoche en cliquant une seconde fois sur la même valeur', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterPanel
        valeurs={{ workMode: 'full_remote' }}
        onChange={onChange}
        comptesModeTravail={COMPTES}
      />,
    );
    await user.click(screen.getByText('Full remote').closest('label')!.querySelector('input')!);
    expect(onChange).toHaveBeenCalledWith({ workMode: undefined });
  });

  it('"Réinitialiser" efface tous les filtres à la fois', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterPanel
        valeurs={{ workMode: 'full_remote', engagement: 'cdi', agenticAi: true }}
        onChange={onChange}
        comptesModeTravail={COMPTES}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(onChange).toHaveBeenCalledWith({});
  });

  it('ne propose aucun filtre par domaine (960 valeurs distinctes, texte libre)', () => {
    render(<FilterPanel valeurs={{}} onChange={() => {}} comptesModeTravail={COMPTES} />);
    expect(screen.queryByText(/domaine/i)).toBeNull();
  });
});
