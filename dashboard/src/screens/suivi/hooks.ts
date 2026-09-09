import { useCallback } from 'react';
import type { DashboardClient } from '../../data/client';
import type { ApplicationStatus, OfferDashboardRow, PageResult } from '../../data/types';
import type { AsyncState } from '../matin/useAsync';
import { useAsync } from '../matin/useAsync';

/**
 * Les quatre colonnes du pipeline (`Suivi.dc.html`) — `a_traiter` (le repos
 * avant décision) n'en est pas une : elle n'a pas encore de position sur le
 * fil (même exclusion que `SuiviSection.PIPELINE`, `detail/SuiviSection.tsx`).
 * `terminee` et `ecartee` non plus : la maquette approuvée ne dessine que ces
 * quatre colonnes — une candidature terminée ou écartée est sortie du
 * pipeline actif, pas une étape qu'on y suit.
 */
export const COLONNES_PIPELINE = ['retenue', 'postulee', 'relancee', 'entretien'] as const;
export type ColonnePipeline = (typeof COLONNES_PIPELINE)[number];

/** Nombre de cartes montrées par colonne avant de replier le reste sous
 * « + N autres » (`Suivi.dc.html` : trois cartes pleines, le compte réel
 * de la colonne vient de `PageResult.total`, jamais recompté côté client). */
export const CARTES_PAR_COLONNE = 3;

/** Une colonne du pipeline : ses offres au statut donné, triées par rang —
 * même tri que « Toute la veille » (tâche 7), pour rester cohérent avec le
 * reste du tableau de bord. */
export function usePipelineColonne(
  client: DashboardClient,
  statut: ApplicationStatus,
): [AsyncState<PageResult<OfferDashboardRow>>, () => void] {
  const fn = useCallback(
    () => client.listOffers({ statut, sort: 'final_score', page: 1, pageSize: CARTES_PAR_COLONNE }),
    [client, statut],
  );
  return useAsync(fn);
}
