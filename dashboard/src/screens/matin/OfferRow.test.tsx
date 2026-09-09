import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OfferRow } from './OfferRow';
import { ligneOffre } from '../../data/test-fixtures';

describe('OfferRow', () => {
  it('affiche rang et correspondance, toujours ensemble', () => {
    render(
      <OfferRow
        offer={ligneOffre({ final_score: 94, fit_score: 68 })}
        afficherStatut={false}
        dateColonne="publiee"
        salaireFloor={40000}
      />,
    );
    expect(screen.getByText('94')).toBeDefined();
    expect(screen.getByText('68')).toBeDefined();
  });

  it("nomme l'employeur et le lieu absents plutôt que de laisser une case vide", () => {
    const { container } = render(
      <OfferRow
        offer={ligneOffre({ company_name: null, city: null, department: null })}
        afficherStatut={false}
        dateColonne="publiee"
        salaireFloor={40000}
      />,
    );
    expect(container.querySelector('[data-nature="non-publiee"]')).not.toBeNull();
    expect(container.querySelector('[data-nature="non-precisee"]')).not.toBeNull();
  });

  it('affiche le badge "N sources" seulement quand le groupe compte plus d’un membre', () => {
    const { rerender } = render(
      <OfferRow
        offer={ligneOffre({ group_size: 1 })}
        afficherStatut={false}
        dateColonne="publiee"
        salaireFloor={40000}
      />,
    );
    expect(screen.queryByText(/sources/)).toBeNull();

    rerender(
      <OfferRow
        offer={ligneOffre({ group_size: 2 })}
        afficherStatut={false}
        dateColonne="publiee"
        salaireFloor={40000}
      />,
    );
    expect(screen.getByText('2 sources')).toBeDefined();
  });

  it('affiche les jours écoulés depuis la publication', () => {
    const hier = new Date(Date.now() - 86_400_000).toISOString();
    render(
      <OfferRow
        offer={ligneOffre({ published_at: hier })}
        afficherStatut={false}
        dateColonne="publiee"
        salaireFloor={40000}
      />,
    );
    expect(screen.getByText('1 j')).toBeDefined();
  });

  it(
    'une date de publication absente relève de "non publiée" (champ de source manquant), ' +
      'pas de "non précisée" (qui suppose un champ que le modèle aurait dû dégager — GUIDELINES §3.1)',
    () => {
      const { container } = render(
        <OfferRow
          offer={ligneOffre({ published_at: null })}
          afficherStatut={false}
          dateColonne="publiee"
          salaireFloor={40000}
        />,
      );
      const cellulePubliee = container.querySelector('[class*="publiee"]');
      expect(cellulePubliee).not.toBeNull();
      expect(cellulePubliee?.querySelector('[data-nature="non-publiee"]')).not.toBeNull();
    },
  );

  it('rend l’absence de titre via `Absence`, pas via un `Absent` nu — uniformité avec les autres cellules', () => {
    const { container } = render(
      <OfferRow
        offer={ligneOffre({ title: null })}
        afficherStatut={false}
        dateColonne="publiee"
        salaireFloor={40000}
      />,
    );
    expect(container.querySelector('[data-nature="non-publiee"]')).not.toBeNull();
  });

  it('afficherStatut : la 5e colonne rend la pastille de statut, pas le lieu', () => {
    render(
      <OfferRow
        offer={ligneOffre({ city: 'Marseille', candidature_statut: 'postulee' })}
        afficherStatut
        dateColonne="envoyee"
        salaireFloor={null}
      />,
    );
    expect(screen.getByText('Postulée')).toBeDefined();
    expect(screen.queryByText('Marseille')).toBeNull();
  });

  it('afficherStatut sans décision : une absence NOMMÉE, jamais une case vide', () => {
    render(
      <OfferRow
        offer={ligneOffre({ candidature_statut: null })}
        afficherStatut
        dateColonne="publiee"
        salaireFloor={null}
      />,
    );
    expect(screen.getByText('sans décision')).toBeDefined();
  });

  it('sans afficherStatut : le lieu reste en 5e colonne (comportement d’origine)', () => {
    render(
      <OfferRow
        offer={ligneOffre({ city: 'Marseille' })}
        afficherStatut={false}
        dateColonne="publiee"
        salaireFloor={null}
      />,
    );
    expect(screen.getByText('Marseille')).toBeDefined();
  });

  it('une date d’étape absente se NOMME « non datée », jamais une case vide', () => {
    render(
      <OfferRow
        offer={ligneOffre({ candidature_statut: 'relancee', candidature_relancee_le: null })}
        afficherStatut
        dateColonne="relancee"
        salaireFloor={null}
      />,
    );
    expect(screen.getByText('non datée')).toBeDefined();
  });
});
