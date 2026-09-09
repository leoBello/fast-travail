import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OfferCard } from './OfferCard';
import { ligneOffre } from '../../data/test-fixtures';

describe('OfferCard', () => {
  it('affiche toujours le couple rang/correspondance ensemble (GUIDELINES §3.4)', () => {
    render(
      <OfferCard
        offer={ligneOffre({ final_score: 100, fit_score: 90 })}
        onGarder={() => {}}
        onEcarter={() => {}}
        enTraitement={false}
        salaireFloor={40000}
      />,
    );
    expect(screen.getByText('100')).toBeDefined();
    expect(screen.getByText('90')).toBeDefined();
  });

  it('nomme un employeur absent au lieu de laisser une case vide', () => {
    const { container } = render(
      <OfferCard
        offer={ligneOffre({ company_name: null })}
        onGarder={() => {}}
        onEcarter={() => {}}
        enTraitement={false}
        salaireFloor={40000}
      />,
    );
    expect(container.querySelector('[data-nature="non-publiee"]')).not.toBeNull();
  });

  it("rend l'absence 'salaire non publié' quand rien n'a été extrait", () => {
    const { container } = render(
      <OfferCard
        offer={ligneOffre({
          compensation_kind: null,
          compensation_min: null,
          compensation_max: null,
        })}
        onGarder={() => {}}
        onEcarter={() => {}}
        enTraitement={false}
        salaireFloor={40000}
      />,
    );
    expect(container.querySelector('[data-nature="salaire-non-publie"]')).not.toBeNull();
  });

  it('barre le montant et le marque en alerte discontinue pour un salaire sous le plancher (GUIDELINES §3.6)', () => {
    const { container } = render(
      <OfferCard
        offer={ligneOffre({
          compensation_kind: 'salaire',
          compensation_min: 12000,
          compensation_max: null,
        })}
        onGarder={() => {}}
        onEcarter={() => {}}
        enTraitement={false}
        salaireFloor={40000}
      />,
    );
    // Le libellé "unité incertaine" vit dans l'infobulle (le pourquoi,
    // GUIDELINES §1) — pas montée avant ouverture. Ce qui doit être visible
    // sans geste : le montant barré, dans un badge alerte discontinu.
    expect(screen.getByText('12 k€/an').className).toMatch(/montantBarre/);
    expect(container.querySelector('[data-ton="alerte"][data-discontinu="true"]')).not.toBeNull();
  });

  it(
    "salaireFloor pas encore chargé (null) : le montant s'affiche en ton neutre — JAMAIS en " +
      'succès (fausse certitude) ni en alerte (accusation sans preuve), même sous ce qui EST ' +
      'le vrai plancher (correctif de revue, tâche 10)',
    () => {
      const { container } = render(
        <OfferCard
          offer={ligneOffre({
            // confiance 'moyenne' : évite que le badge de confiance (ton
            // 'succes' pour 'haute', la valeur par défaut de `ligneOffre`)
            // ne fausse l'assertion « aucun ton succès sur cette carte ».
            confidence: 'moyenne',
            compensation_kind: 'salaire',
            compensation_min: 12000, // sous le vrai plancher (40000) — le cas signalé en revue
            compensation_max: null,
          })}
          onGarder={() => {}}
          onEcarter={() => {}}
          enTraitement={false}
          salaireFloor={null}
        />,
      );
      expect(screen.getByText('12 k€/an')).toBeDefined();
      expect(container.querySelector('[data-ton="succes"]')).toBeNull();
      expect(container.querySelector('[data-ton="alerte"]')).toBeNull();
      expect(container.querySelector('[data-ton="neutre"][data-discontinu="true"]')).not.toBeNull();
    },
  );

  it('marque la confiance basse en ambre et porte une infobulle expliquant le pourquoi', () => {
    const { container } = render(
      <OfferCard
        offer={ligneOffre({ confidence: 'basse' })}
        onGarder={() => {}}
        onEcarter={() => {}}
        enTraitement={false}
        salaireFloor={40000}
      />,
    );
    expect(container.querySelector('[data-ton="alerte"]')).not.toBeNull();
  });

  it('appelle onGarder / onEcarter au clic, jamais l’un pour l’autre', async () => {
    const user = userEvent.setup();
    const onGarder = vi.fn();
    const onEcarter = vi.fn();
    render(
      <OfferCard
        offer={ligneOffre()}
        onGarder={onGarder}
        onEcarter={onEcarter}
        enTraitement={false}
        salaireFloor={40000}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Garder' }));
    expect(onGarder).toHaveBeenCalledTimes(1);
    expect(onEcarter).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Écarter' }));
    expect(onEcarter).toHaveBeenCalledTimes(1);
    expect(onGarder).toHaveBeenCalledTimes(1);
  });

  it('désactive les deux boutons de décision pendant le traitement — jamais un double envoi', () => {
    render(
      <OfferCard
        offer={ligneOffre()}
        onGarder={() => {}}
        onEcarter={() => {}}
        enTraitement={true}
        salaireFloor={40000}
      />,
    );
    expect(screen.getByRole('button', { name: 'Garder' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Écarter' })).toHaveProperty('disabled', true);
  });

  it("le lien vers l'annonce d'origine quitte l'application (nouvel onglet, rel sécurisé)", () => {
    render(
      <OfferCard
        offer={ligneOffre({ url: 'https://exemple.test/offre-42' })}
        onGarder={() => {}}
        onEcarter={() => {}}
        enTraitement={false}
        salaireFloor={40000}
      />,
    );
    const lien = screen.getByRole('link', { name: "Ouvrir l'annonce d'origine" });
    expect(lien.getAttribute('href')).toBe('https://exemple.test/offre-42');
    expect(lien.getAttribute('target')).toBe('_blank');
    expect(lien.getAttribute('rel')).toContain('noopener');
  });

  it('rend un bouton désactivé plutôt qu’un lien mort quand aucune URL n’est connue', () => {
    render(
      <OfferCard
        offer={ligneOffre({ url: null })}
        onGarder={() => {}}
        onEcarter={() => {}}
        enTraitement={false}
        salaireFloor={40000}
      />,
    );
    expect(screen.queryByRole('link', { name: "Ouvrir l'annonce d'origine" })).toBeNull();
    expect(screen.getByRole('button', { name: "Ouvrir l'annonce d'origine" })).toHaveProperty(
      'disabled',
      true,
    );
  });
});
