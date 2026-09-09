import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExtractionSection } from './ExtractionSection';
import { ligneOffre } from '../../data/test-fixtures';

describe('ExtractionSection', () => {
  it('nomme chaque champ absent plutôt que de laisser une case vide (GUIDELINES §3.1)', () => {
    const { container } = render(
      <ExtractionSection
        offer={ligneOffre({
          engagement: null,
          work_mode: null,
          seniority: null,
          duration_months: null,
          domain: null,
        })}
      />,
    );
    expect(container.querySelectorAll('[data-nature="non-precisee"]').length).toBe(5);
  });

  it(
    'rémunération à trois rendus (GUIDELINES §3.6) : montant sûr affiché tel quel, montant ' +
      'incertain barré avec le badge « unité incertaine », absence nommée sinon',
    () => {
      const { rerender, container } = render(
        <ExtractionSection
          offer={ligneOffre({ compensation_kind: 'tjm', compensation_min: 450 })}
        />,
      );
      expect(screen.getByText('450 €/j')).toBeDefined();

      rerender(
        <ExtractionSection
          offer={ligneOffre({ compensation_kind: 'salaire', compensation_min: 12000 })}
        />,
      );
      expect(screen.getByText('12 k€/an').className).toMatch(/montantBarre/);
      // Le montant barré seul ne suffit pas (GUIDELINES §3.6 : « le montant
      // barré, AVEC le badge "unité incertaine" ») — la revue a signalé un
      // premier passage où ce test ne vérifiait que le trait, pas le badge,
      // et passait alors même que le badge manquait. `data-ton`/
      // `data-discontinu` sont les attributs que `Badge` pose réellement
      // (Badge.tsx) : les affirmer prouve la présence du badge lui-même, pas
      // seulement du style visuel qu'il porterait de toute façon.
      expect(container.querySelector('[data-ton="alerte"][data-discontinu="true"]')).not.toBeNull();

      rerender(
        <ExtractionSection
          offer={ligneOffre({
            compensation_kind: null,
            compensation_min: null,
            compensation_max: null,
          })}
        />,
      );
      expect(container.querySelector('[data-nature="salaire-non-publie"]')).not.toBeNull();
    },
  );

  it('distingue « texte coupé » (Adzuna tronqué) d’« aucune techno reconnue » (texte complet)', () => {
    const { rerender } = render(
      <ExtractionSection
        offer={ligneOffre({
          truncated_input: true,
          extraction: {
            stack: [],
            seniority: null,
            work_mode: null,
            engagement: null,
            duration_months: null,
            compensation_kind: null,
            compensation_min: null,
            compensation_max: null,
            agentic_ai: false,
            unwanted_tech: [],
            domain: null,
            confidence: 'basse',
          },
        })}
      />,
    );
    expect(screen.getByText('Non détectable — texte coupé')).toBeDefined();

    rerender(
      <ExtractionSection
        offer={ligneOffre({
          truncated_input: false,
          extraction: {
            stack: [],
            seniority: null,
            work_mode: null,
            engagement: null,
            duration_months: null,
            compensation_kind: null,
            compensation_min: null,
            compensation_max: null,
            agentic_ai: false,
            unwanted_tech: [],
            domain: null,
            confidence: 'haute',
          },
        })}
      />,
    );
    expect(screen.getByText('Aucune techno reconnue')).toBeDefined();
  });

  it('liste la stack détectée quand elle est non vide, avec le compte', () => {
    render(
      <ExtractionSection
        offer={ligneOffre({
          extraction: {
            stack: ['React', 'TypeScript'],
            seniority: null,
            work_mode: null,
            engagement: null,
            duration_months: null,
            compensation_kind: null,
            compensation_min: null,
            compensation_max: null,
            agentic_ai: false,
            unwanted_tech: [],
            domain: null,
            confidence: 'haute',
          },
        })}
      />,
    );
    expect(screen.getByText('Stack détectée — 2 technologies')).toBeDefined();
    expect(screen.getByText('React')).toBeDefined();
    expect(screen.getByText('TypeScript')).toBeDefined();
  });

  it('affiche « Aucune » quand aucune techno non désirée', () => {
    render(<ExtractionSection offer={ligneOffre()} />);
    expect(screen.getByText('Aucune')).toBeDefined();
  });
});
