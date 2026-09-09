import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SuiviSection } from './SuiviSection';
import { etatCandidature } from '../../data/test-fixtures';

function props(partiel: Partial<Parameters<typeof SuiviSection>[0]> = {}) {
  return {
    application: null,
    enTraitement: false,
    erreur: false,
    onAvancer: vi.fn(),
    onEcarter: vi.fn(),
    onDefinirIssue: vi.fn(),
    ...partiel,
  };
}

describe('SuiviSection', () => {
  it('groupe jamais ouvert : propose de retenir ou d’écarter, aucune date affichée', () => {
    render(<SuiviSection {...props({ application: null })} />);
    expect(screen.getByRole('button', { name: 'Retenir cette offre' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Écarter cette offre' })).toBeDefined();
    expect(screen.queryByText(/^le /)).toBeNull();
  });

  it('clique sur "Retenir cette offre" appelle onAvancer("retenue"), sans date d’envoi', async () => {
    const user = userEvent.setup();
    const onAvancer = vi.fn();
    render(<SuiviSection {...props({ onAvancer })} />);
    await user.click(screen.getByRole('button', { name: 'Retenir cette offre' }));
    expect(onAvancer).toHaveBeenCalledWith('retenue', undefined);
  });

  it('statut "retenue" : l’action suivante est "Marquer comme postulée", avec une date d’envoi', async () => {
    const user = userEvent.setup();
    const onAvancer = vi.fn();
    render(
      <SuiviSection
        {...props({ application: etatCandidature({ status: 'retenue' }), onAvancer })}
      />,
    );
    const bouton = screen.getByRole('button', { name: 'Marquer comme postulée' });
    await user.click(bouton);
    expect(onAvancer).toHaveBeenCalledTimes(1);
    expect(onAvancer.mock.calls[0][0]).toBe('postulee');
    expect(typeof onAvancer.mock.calls[0][1]).toBe('string');
  });

  it('marque le nœud "Retenue" comme fait (coché) et les suivants comme à venir', () => {
    const { container } = render(
      <SuiviSection {...props({ application: etatCandidature({ status: 'retenue' }) })} />,
    );
    const faits = container.querySelectorAll('[data-fait="true"]');
    const aVenir = container.querySelectorAll('[data-fait="false"]');
    // Un nœud = une pastille + un libellé, donc deux éléments par étape.
    expect(faits.length).toBe(2);
    expect(aVenir.length).toBe(8);
  });

  it('affiche "depuis le" avec le statut courant et sa date', () => {
    render(
      <SuiviSection
        {...props({
          application: etatCandidature({
            status: 'retenue',
            status_changed_at: '2026-09-07T08:00:00.000Z',
          }),
        })}
      />,
    );
    expect(screen.getByText(/Retenue le 7 septembre/)).toBeDefined();
  });

  it('statut "entretien" : l’action suivante est "Marquer comme terminée"', () => {
    render(<SuiviSection {...props({ application: etatCandidature({ status: 'entretien' }) })} />);
    expect(screen.getByRole('button', { name: 'Marquer comme terminée' })).toBeDefined();
  });

  it(
    'statut "terminee" sans issue : propose les quatre issues plutôt qu’une action ' +
      'd’avancement (GUIDELINES §1, « un second axe, jamais une étape de plus »)',
    async () => {
      const user = userEvent.setup();
      const onDefinirIssue = vi.fn();
      render(
        <SuiviSection
          {...props({ application: etatCandidature({ status: 'terminee' }), onDefinirIssue })}
        />,
      );
      expect(screen.queryByRole('button', { name: /Marquer comme/ })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Refus' }));
      expect(onDefinirIssue).toHaveBeenCalledWith('refus');
    },
  );

  it('statut "terminee" avec issue déjà enregistrée : affiche l’issue, plus aucun bouton', () => {
    render(
      <SuiviSection
        {...props({
          application: etatCandidature({ status: 'terminee', outcome: 'offre_recue' }),
        })}
      />,
    );
    expect(screen.getByText('Offre reçue')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Refus' })).toBeNull();
  });

  it(
    'statut "ecartee" : aucune position sur le fil (c’est une sortie, GUIDELINES §3.7), ' +
      'aucune action, seulement le badge et une note',
    () => {
      const { container } = render(
        <SuiviSection {...props({ application: etatCandidature({ status: 'ecartee' }) })} />,
      );
      expect(screen.getByText('Écartée')).toBeDefined();
      expect(container.querySelector('[data-discontinu="true"]')).not.toBeNull();
      expect(container.querySelectorAll('[data-fait]').length).toBe(0);
      expect(screen.queryByRole('button')).toBeNull();
    },
  );

  it('signale un état hérité d’une autre annonce du groupe (`heritee`)', () => {
    render(<SuiviSection {...props({ application: etatCandidature({ heritee: true }) })} />);
    expect(screen.getByText(/vient d'une autre annonce du même groupe/)).toBeDefined();
  });

  it('ne signale rien quand l’état n’est pas hérité', () => {
    render(<SuiviSection {...props({ application: etatCandidature({ heritee: false }) })} />);
    expect(screen.queryByText(/vient d'une autre annonce/)).toBeNull();
  });

  it('désactive les actions pendant le traitement', () => {
    render(<SuiviSection {...props({ enTraitement: true })} />);
    expect(screen.getByRole('button', { name: 'Retenir cette offre' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('button', { name: 'Écarter cette offre' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('affiche un message d’erreur nommé quand une action a échoué', () => {
    render(<SuiviSection {...props({ erreur: true })} />);
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it("n'affiche aucun message d'erreur quand rien n'a échoué", () => {
    render(<SuiviSection {...props({ erreur: false })} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
