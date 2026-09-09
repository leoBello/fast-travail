import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExtractionSection } from './ExtractionSection';
import { ligneOffre } from '../../data/test-fixtures';
import { t } from '../../i18n/i18n';

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
        salaireFloor={40000}
        cvSkills={[]}
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
          salaireFloor={40000}
          cvSkills={[]}
        />,
      );
      expect(screen.getByText('450 €/j')).toBeDefined();

      rerender(
        <ExtractionSection
          offer={ligneOffre({ compensation_kind: 'salaire', compensation_min: 12000 })}
          salaireFloor={40000}
          cvSkills={[]}
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
          salaireFloor={40000}
          cvSkills={[]}
        />,
      );
      expect(container.querySelector('[data-nature="salaire-non-publie"]')).not.toBeNull();
    },
  );

  it(
    'salaireFloor pas encore chargé (null) : ni « connu » ni « incertain » ne sont affirmés — ' +
      'un badge neutre, jamais l’absence « salaire non publié » (le montant EXISTE, seule sa ' +
      'certitude est inconnue) — correctif de revue, tâche 10',
    () => {
      const { container } = render(
        <ExtractionSection
          offer={ligneOffre({
            compensation_kind: 'salaire',
            compensation_min: 12000, // sous le vrai plancher (40000) — le cas signalé en revue
            compensation_max: null,
          })}
          salaireFloor={null}
          cvSkills={[]}
        />,
      );
      expect(screen.getByText('12 k€/an')).toBeDefined();
      expect(container.querySelector('[data-nature="salaire-non-publie"]')).toBeNull();
      expect(container.querySelector('[data-ton="alerte"]')).toBeNull();
      expect(container.querySelector('.montantBarre, [class*="montantBarre"]')).toBeNull();
      expect(container.querySelector('[data-ton="neutre"][data-discontinu="true"]')).not.toBeNull();
    },
  );

  it('distingue « texte coupé » (Adzuna tronqué) d’« aucune techno reconnue » (texte complet)', () => {
    // Portee sur `.stackBloc` : depuis le correctif I2, un texte tronque sans
    // rien detecte porte DESORMAIS trois absences « texte coupe » (IA/agents,
    // technos non desirees, ET stack) — ce test-ci ne porte que sur la
    // derniere, deja couverte par son propre test ailleurs dans ce fichier.
    const { rerender, container } = render(
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
        salaireFloor={40000}
        cvSkills={[]}
      />,
    );
    const stackBloc = container.querySelector('[class*="stackBloc"]');
    expect(stackBloc?.textContent).toContain('Non détectable — texte coupé');

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
        salaireFloor={40000}
        cvSkills={[]}
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
        salaireFloor={40000}
        cvSkills={[]}
      />,
    );
    expect(screen.getByText('Stack détectée — 2 technologies')).toBeDefined();
    expect(screen.getByText('React')).toBeDefined();
    expect(screen.getByText('TypeScript')).toBeDefined();
  });

  it('affiche « Aucune » quand aucune techno non désirée', () => {
    render(<ExtractionSection offer={ligneOffre()} salaireFloor={40000} cvSkills={[]} />);
    expect(screen.getByText('Aucune')).toBeDefined();
  });

  it('affiche « Non » (IA/agents) quand le texte reçu est complet', () => {
    render(
      <ExtractionSection
        offer={ligneOffre({ truncated_input: false })}
        salaireFloor={40000}
        cvSkills={[]}
      />,
    );
    expect(screen.getByText('Non')).toBeDefined();
  });

  // Constat I2 (revue finale de branche, phase 3) : « Aucune » et « Non »
  // affirmaient une absence FACTUELLE (rien trouvé) même quand le texte reçu
  // était tronqué à 500 caractères (Adzuna) — une absence *de lecture*
  // rendue comme une absence *de fait*. Vérifie que ces deux champs suivent
  // désormais la même garde que le bloc `stack`, juste en dessous.
  it(
    'ne dit PAS « Aucune » (technos non désirées) sur un texte tronqué sans techno non ' +
      'désirée détectée : rend l’absence « texte coupé », pas un fait',
    () => {
      const { container } = render(
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
          salaireFloor={40000}
          cvSkills={[]}
        />,
      );
      expect(screen.queryByText('Aucune')).toBeNull();
      expect(container.querySelectorAll('[data-nature="texte-coupe"]').length).toBeGreaterThan(0);
    },
  );

  it(
    'ne dit PAS « Non » (IA/agents) sur un texte tronqué sans mention IA détectée : rend ' +
      'l’absence « texte coupé », pas un fait',
    () => {
      const { container } = render(
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
          salaireFloor={40000}
          cvSkills={[]}
        />,
      );
      expect(screen.queryByText('Non')).toBeNull();
      expect(container.querySelectorAll('[data-nature="texte-coupe"]').length).toBeGreaterThan(0);
    },
  );

  it(
    'affiche bien « Aucune »/« Non » sur un texte tronqué quand une techno non désirée ou ' +
      'l’IA sont malgré tout détectées : un FAIT positif, texte tronqué ou pas',
    () => {
      render(
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
              agentic_ai: true,
              unwanted_tech: ['php'],
              domain: null,
              confidence: 'basse',
            },
          })}
          salaireFloor={40000}
          cvSkills={[]}
        />,
      );
      expect(screen.getByText('php')).toBeDefined();
      expect(screen.getByText(t('iaAgents.badge'))).toBeDefined();
    },
  );
});
