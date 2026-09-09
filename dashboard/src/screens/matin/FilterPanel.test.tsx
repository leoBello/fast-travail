import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterPanel } from './FilterPanel';

const COMPTES = { full_remote: 175, hybride: 143, sur_site: 88, non_precise: 863 };

describe('FilterPanel', () => {
  it('aucune case ni aucun bouton radio n’est coché au démarrage — la liste complète ne masque rien', () => {
    render(<FilterPanel valeurs={{}} onChange={() => {}} comptesModeTravail={COMPTES} />);
    for (const champ of [...screen.getAllByRole('radio'), ...screen.getAllByRole('checkbox')]) {
      expect(champ).toHaveProperty('checked', false);
    }
  });

  it('les trois dimensions exclusives sont des boutons radio, pas des cases à cocher indépendantes', () => {
    // Une case à cocher signifie "sélection indépendante" — cocher un mode
    // de travail en décochait un autre silencieusement (revue de tâche 7).
    // L'API n'acceptant qu'UNE valeur par dimension, le widget doit le dire.
    render(<FilterPanel valeurs={{}} onChange={() => {}} comptesModeTravail={COMPTES} />);
    expect(screen.getAllByRole('radio')).toHaveLength(
      4 /* work_mode */ + 4 /* engagement */ + 4 /* source */,
    );
    // Seul agenticAi reste une case à cocher : un booléen indépendant.
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });

  it('chaque groupe de radios relie son titre de section via un <fieldset>/<legend>', () => {
    const { container } = render(
      <FilterPanel valeurs={{}} onChange={() => {}} comptesModeTravail={COMPTES} />,
    );
    const fieldsets = container.querySelectorAll('fieldset');
    expect(fieldsets.length).toBeGreaterThanOrEqual(3);
    for (const fs of fieldsets) {
      if (fs.querySelector('input[type="radio"]')) {
        expect(fs.querySelector('legend')).not.toBeNull();
      }
    }
  });

  it('la ligne "non précisé" est visible, chiffrée (863) et cochable (GUIDELINES §3.2)', () => {
    render(<FilterPanel valeurs={{}} onChange={() => {}} comptesModeTravail={COMPTES} />);
    const ligne = screen.getByText('Non précisé').closest('label');
    expect(ligne).not.toBeNull();
    expect(ligne?.textContent).toContain('863');
    const champ = ligne?.querySelector('input[type="radio"]');
    expect(champ).not.toBeNull();
    expect(champ).toHaveProperty('disabled', false);
  });

  it('affiche un compte à blanc, jamais un zéro trompeur, tant que les comptes ne sont pas chargés', () => {
    render(<FilterPanel valeurs={{}} onChange={() => {}} comptesModeTravail={null} />);
    expect(screen.queryByText('863')).toBeNull();
    expect(screen.getAllByText('…').length).toBeGreaterThan(0);
  });

  it('sélectionner un mode de travail appelle onChange avec exactement cette valeur', async () => {
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

  it('décoche en cliquant une seconde fois sur la même valeur — le comportement natif du radio ne le permettrait pas seul', async () => {
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
