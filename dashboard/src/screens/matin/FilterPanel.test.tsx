import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterPanel } from './FilterPanel';

const COMPTES = { full_remote: 175, hybride: 143, sur_site: 88, non_precise: 863 };

describe('FilterPanel', () => {
  it('aucune case n’est cochée au démarrage — la liste complète ne masque rien', () => {
    render(<FilterPanel valeurs={{}} onChange={() => {}} comptesModeTravail={COMPTES} />);
    for (const champ of screen.getAllByRole('checkbox')) {
      expect(champ).toHaveProperty('checked', false);
    }
  });

  it('les quatre dimensions sont des cases à cocher — plusieurs valeurs se composent en OU côté serveur (tâche 10)', () => {
    // Les radios de la tâche 7 n'étaient qu'un pis-aller devant une API
    // mono-valeur ; l'API compose désormais un OU sur plusieurs valeurs.
    render(<FilterPanel valeurs={{}} onChange={() => {}} comptesModeTravail={COMPTES} />);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getAllByRole('checkbox')).toHaveLength(
      4 /* work_mode */ + 4 /* engagement */ + 4 /* source */ + 1 /* agenticAi */,
    );
  });

  it('chaque groupe de cases relie son titre de section via un <fieldset>/<legend>', () => {
    const { container } = render(
      <FilterPanel valeurs={{}} onChange={() => {}} comptesModeTravail={COMPTES} />,
    );
    const fieldsets = container.querySelectorAll('fieldset');
    expect(fieldsets.length).toBeGreaterThanOrEqual(3);
    for (const fs of fieldsets) {
      if (fs.querySelector('input[type="checkbox"][name]')) {
        expect(fs.querySelector('legend')).not.toBeNull();
      }
    }
  });

  it('la ligne "non précisé" est visible, chiffrée (863) et cochable (GUIDELINES §3.2)', () => {
    render(<FilterPanel valeurs={{}} onChange={() => {}} comptesModeTravail={COMPTES} />);
    const ligne = screen.getByText('Non précisé').closest('label');
    expect(ligne).not.toBeNull();
    expect(ligne?.textContent).toContain('863');
    const champ = ligne?.querySelector('input[type="checkbox"]');
    expect(champ).not.toBeNull();
    expect(champ).toHaveProperty('disabled', false);
  });

  it('affiche un compte à blanc, jamais un zéro trompeur, tant que les comptes ne sont pas chargés', () => {
    render(<FilterPanel valeurs={{}} onChange={() => {}} comptesModeTravail={null} />);
    expect(screen.queryByText('863')).toBeNull();
    expect(screen.getAllByText('…').length).toBeGreaterThan(0);
  });

  it('cocher un mode de travail appelle onChange avec un tableau à une valeur', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilterPanel valeurs={{}} onChange={onChange} comptesModeTravail={COMPTES} />);

    await user.click(screen.getByText('Full remote').closest('label')!.querySelector('input')!);
    expect(onChange).toHaveBeenCalledWith({ workMode: ['full_remote'] });
  });

  it('cocher une seconde valeur AJOUTE à la sélection — c’est le OU qui rend "full remote ou non précisé" possible', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterPanel
        valeurs={{ workMode: ['full_remote'] }}
        onChange={onChange}
        comptesModeTravail={COMPTES}
      />,
    );
    await user.click(screen.getByText('Non précisé').closest('label')!.querySelector('input')!);
    expect(onChange).toHaveBeenCalledWith({ workMode: ['full_remote', 'non_precise'] });
  });

  it('décocher la seule valeur sélectionnée retombe sur `undefined`, jamais un tableau vide', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterPanel
        valeurs={{ workMode: ['full_remote'] }}
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
        valeurs={{ workMode: ['full_remote'], engagement: ['cdi'], agenticAi: true }}
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
