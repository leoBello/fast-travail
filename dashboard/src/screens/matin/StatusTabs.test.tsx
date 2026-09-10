import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StatusTabs } from './StatusTabs';
import { comptePourOnglet, filtreStatutPourOnglet } from './statusTabsLogic';
import type { StatutCounts } from '../../data/types';

const COMPTES: StatutCounts = {
  aucune: 1258,
  a_traiter: 3,
  retenue: 0,
  postulee: 6,
  relancee: 1,
  entretien: 0,
  terminee: 0,
  ecartee: 7,
};

describe('filtreStatutPourOnglet', () => {
  it('« À traiter » porte DEUX valeurs : sans décision, et ouverte sans décision', () => {
    expect(filtreStatutPourOnglet('a_traiter')).toEqual(['aucune', 'a_traiter']);
  });

  it('« Toutes » ne restreint rien', () => {
    expect(filtreStatutPourOnglet('toutes')).toBeUndefined();
  });

  it('un onglet de statut porte sa seule valeur', () => {
    expect(filtreStatutPourOnglet('postulee')).toEqual(['postulee']);
  });
});

describe('comptePourOnglet', () => {
  it("« À traiter » additionne les deux valeurs qu'il porte", () => {
    expect(comptePourOnglet('a_traiter', COMPTES)).toBe(1261);
  });

  it('« Toutes » additionne les huit', () => {
    expect(comptePourOnglet('toutes', COMPTES)).toBe(1275);
  });
});

describe('StatusTabs', () => {
  it('rend les huit onglets, y compris ceux à zéro', () => {
    render(<StatusTabs actif="a_traiter" onChange={vi.fn()} comptes={COMPTES} />);
    expect(screen.getAllByRole('tab')).toHaveLength(8);
    expect(screen.getByRole('tab', { name: /Retenues/ }).textContent).toContain('0');
  });

  it("marque l'onglet actif par aria-selected, pas seulement par la couleur", () => {
    render(<StatusTabs actif="postulee" onChange={vi.fn()} comptes={COMPTES} />);
    expect(screen.getByRole('tab', { name: /Postulées/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('tab', { name: /Toutes/ }).getAttribute('aria-selected')).toBe('false');
  });

  it("n'affiche AUCUN zéro tant que les comptes ne sont pas arrivés", () => {
    render(<StatusTabs actif="a_traiter" onChange={vi.fn()} comptes={null} />);
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.getAllByRole('tab')).toHaveLength(8);
  });

  it("remonte l'onglet cliqué", async () => {
    const onChange = vi.fn();
    render(<StatusTabs actif="a_traiter" onChange={onChange} comptes={COMPTES} />);
    await userEvent.click(screen.getByRole('tab', { name: /Écartées/ }));
    expect(onChange).toHaveBeenCalledWith('ecartee');
  });
});
