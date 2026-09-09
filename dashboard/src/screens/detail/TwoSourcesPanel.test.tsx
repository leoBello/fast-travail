import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TwoSourcesPanel } from './TwoSourcesPanel';
import { jugementOffre } from '../../data/test-fixtures';

describe('TwoSourcesPanel — la pièce maîtresse (GUIDELINES §3.5)', () => {
  it("ne rend rien quand il n'y a qu'un seul jugement — rien à comparer", () => {
    const { container } = render(
      <TwoSourcesPanel offerId="a" judgements={[jugementOffre({ id: 'a' })]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it(
    'identifie le jugement RETENU par id === offerId, jamais par position — cas mesuré ALLEGIS ' +
      'GROUP : Adzuna (fit 75, confiance basse, tronqué) est masqué, Free-Work (fit 58, ' +
      'confiance haute, texte intégral) est retenu, le plus informé et non le mieux noté',
    () => {
      const adzuna = jugementOffre({
        id: 'adzuna-id',
        source: 'adzuna',
        final_score: 75,
        confidence: 'basse',
        truncated_input: true,
        compensation_kind: 'salaire',
        compensation_min: 450,
        compensation_max: 530,
      });
      const freeWork = jugementOffre({
        id: 'fw-id',
        source: 'free_work',
        final_score: 58,
        confidence: 'haute',
        truncated_input: false,
        compensation_kind: 'tjm',
        compensation_min: 450,
        compensation_max: null,
      });

      const { container } = render(
        <TwoSourcesPanel offerId="fw-id" judgements={[adzuna, freeWork]} />,
      );

      const carteRetenue = container.querySelector('[data-retenu="true"]');
      const carteMasquee = container.querySelector('[data-retenu="false"]');
      expect(carteRetenue?.getAttribute('data-offer-id')).toBe('fw-id');
      expect(carteMasquee?.getAttribute('data-offer-id')).toBe('adzuna-id');
      expect(screen.getByText('Retenu')).toBeDefined();
      expect(screen.getByText('Masqué')).toBeDefined();
    },
  );

  it('affiche la confiance de CHAQUE jugement, pas seulement du retenu', () => {
    const { container } = render(
      <TwoSourcesPanel
        offerId="a"
        judgements={[
          jugementOffre({ id: 'a', confidence: 'haute' }),
          jugementOffre({ id: 'b', confidence: 'basse' }),
        ]}
      />,
    );
    expect(container.querySelectorAll('[data-ton="succes"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-ton="alerte"]').length).toBeGreaterThan(0);
  });

  it(
    'rémunération à trois rendus PAR jugement (GUIDELINES §3.6) : TJM connu pour le retenu, ' +
      'montant BARRÉ dans un badge alerte discontinu pour le masqué — jamais « unité fausse », ' +
      'et jamais un nombre nu. Le libellé « unité incertaine » vit dans l’infobulle (le ' +
      'pourquoi, GUIDELINES §1), pas monté avant ouverture — même précédent que `OfferCard`',
    () => {
      const retenu = jugementOffre({
        id: 'retenu',
        compensation_kind: 'tjm',
        compensation_min: 450,
        compensation_max: null,
      });
      const masque = jugementOffre({
        id: 'masque',
        compensation_kind: 'salaire',
        compensation_min: 450,
        compensation_max: 530,
      });
      const { container } = render(
        <TwoSourcesPanel offerId="retenu" judgements={[retenu, masque]} />,
      );

      expect(screen.getByText('450 €/j')).toBeDefined();
      expect(screen.getByText('1 k€/an').className).toMatch(/montantBarre/);
      expect(container.querySelector('[data-ton="alerte"][data-discontinu="true"]')).not.toBeNull();
      expect(screen.queryByText(/unité fausse/)).toBeNull();
    },
  );

  it("rend l'absence « salaire non publié » quand un jugement n'a rien extrait", () => {
    const { container } = render(
      <TwoSourcesPanel
        offerId="a"
        judgements={[
          jugementOffre({ id: 'a' }),
          jugementOffre({
            id: 'b',
            compensation_kind: null,
            compensation_min: null,
            compensation_max: null,
          }),
        ]}
      />,
    );
    expect(container.querySelector('[data-nature="salaire-non-publie"]')).not.toBeNull();
  });

  it('signale le texte tronqué du jugement Adzuna, « texte intégral » pour les autres', () => {
    render(
      <TwoSourcesPanel
        offerId="a"
        judgements={[
          jugementOffre({ id: 'a', truncated_input: false }),
          jugementOffre({ id: 'b', truncated_input: true }),
        ]}
      />,
    );
    expect(screen.getByText('Texte intégral')).toBeDefined();
    expect(screen.getByText('Texte coupé à 500 car.')).toBeDefined();
  });

  it("affiche le compte d'annonces (group_size)", () => {
    render(
      <TwoSourcesPanel
        offerId="a"
        judgements={[jugementOffre({ id: 'a' }), jugementOffre({ id: 'b' })]}
      />,
    );
    expect(screen.getByText('2 annonces')).toBeDefined();
  });

  it(
    'un groupe de PLUS de deux jugements affiche le retenu et TOUS les masqués — ' +
      'jamais seulement le premier (le composant est générique, pas figé à deux)',
    () => {
      const { container } = render(
        <TwoSourcesPanel
          offerId="b"
          judgements={[
            jugementOffre({ id: 'a', source: 'adzuna' }),
            jugementOffre({ id: 'b', source: 'free_work' }),
            jugementOffre({ id: 'c', source: 'france_travail' }),
          ]}
        />,
      );

      expect(screen.getByText('3 annonces')).toBeDefined();
      expect(container.querySelectorAll('[data-retenu="true"]').length).toBe(1);
      const masquees = container.querySelectorAll('[data-retenu="false"]');
      expect(masquees.length).toBe(2);
      const idsMasques = [...masquees].map((el) => el.getAttribute('data-offer-id')).sort();
      expect(idsMasques).toEqual(['a', 'c']);
    },
  );

  it("signale quand les deux sources divergent sur la nature du montant, jamais quand elles s'accordent", () => {
    const { rerender, container } = render(
      <TwoSourcesPanel
        offerId="a"
        judgements={[
          jugementOffre({ id: 'a', compensation_kind: 'tjm', compensation_min: 450 }),
          jugementOffre({ id: 'b', compensation_kind: 'salaire', compensation_min: 45000 }),
        ]}
      />,
    );
    expect(container.textContent).toContain("ne s'accordent pas sur la nature du montant");

    rerender(
      <TwoSourcesPanel
        offerId="a"
        judgements={[
          jugementOffre({ id: 'a', compensation_kind: 'tjm', compensation_min: 450 }),
          jugementOffre({ id: 'b', compensation_kind: 'tjm', compensation_min: 500 }),
        ]}
      />,
    );
    expect(container.textContent).not.toContain("ne s'accordent pas sur la nature du montant");
  });
});
