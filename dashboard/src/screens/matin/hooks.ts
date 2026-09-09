import { useCallback } from 'react';
import type { DashboardClient } from '../../data/client';
import type {
  ConfigResult,
  Engagement,
  OfferDashboardRow,
  PageResult,
  SortField,
  Source,
  StatsResult,
  WorkModeCounts,
  WorkModeFilter,
} from '../../data/types';
import type { AsyncState } from './useAsync';
import { useAsync } from './useAsync';

const BRIEF_PAGE_SIZE = 3;

/** La bande « Ce matin » : les trois cartes de la page courante. */
export function useBrief(
  client: DashboardClient,
  page: number,
): [AsyncState<PageResult<OfferDashboardRow>>, () => void] {
  const fn = useCallback(
    () => client.listBrief({ page, pageSize: BRIEF_PAGE_SIZE }),
    [client, page],
  );
  return useAsync(fn);
}

export interface OffersListParams {
  sort: SortField;
  page: number;
  pageSize: number;
  workMode?: WorkModeFilter[];
  engagement?: Engagement[];
  source?: Source[];
  agenticAi?: boolean;
}

/** « Toute la veille » : rien de masqué par défaut — chaque filtre absent
 * (`undefined`) ne restreint rien, comme côté serveur (dashboard-query.ts). */
export function useOffersList(
  client: DashboardClient,
  params: OffersListParams,
): [AsyncState<PageResult<OfferDashboardRow>>, () => void] {
  const { sort, page, pageSize, workMode, engagement, source, agenticAi } = params;
  const fn = useCallback(
    () => client.listOffers({ sort, page, pageSize, workMode, engagement, source, agenticAi }),
    [client, sort, page, pageSize, workMode, engagement, source, agenticAi],
  );
  return useAsync(fn);
}

export function useStats(client: DashboardClient): [AsyncState<StatsResult>, () => void] {
  const fn = useCallback(() => client.getStats(), [client]);
  return useAsync(fn);
}

/** Les quatre valeurs de `work_mode` (les trois connues, plus « non précisé »),
 * chacune chiffrée — jamais un filtre qui masquerait silencieusement les
 * 68 % d'offres sans mode de travail connu (GUIDELINES §3.2).
 *
 * **UN appel, pas quatre.** La version précédente lançait quatre
 * `listOffers({ workMode: [v], pageSize: 1 })` en parallèle pour n'en lire
 * que le `total`. Le coût d'une lecture d'`offers_dashboard` ne dépendant pas
 * de `pageSize` (ni le `distinct on` ni les fonctions de fenêtrage ne
 * laissent descendre un filtre), c'étaient quatre balayages du corpus pour
 * quatre nombres — la moitié des requêtes du chargement. Le comptage se fait
 * désormais en base, par un `group by` : `GET /work-mode-counts`, migration
 * `20260910050000`. */
export function useWorkModeCounts(
  client: DashboardClient,
): [AsyncState<WorkModeCounts>, () => void] {
  const fn = useCallback(() => client.getWorkModeCounts(), [client]);
  return useAsync(fn);
}

/**
 * `GET /config` (tâche 10) : poids réglables, profil actif, compétences.
 * Appelé indépendamment par chaque écran qui en a besoin (`MatinScreen`,
 * `DetailScreen`, `ProfilScreen`) — même principe que `useStats`, déjà
 * dupliqué entre `MatinScreen` et `SuiviScreen` : chaque écran reste la
 * SEULE couche de LUI-MÊME qui appelle le réseau, sans dépendance croisée
 * sur l'état d'un autre écran superposé.
 */
export function useConfig(client: DashboardClient): [AsyncState<ConfigResult>, () => void] {
  const fn = useCallback(() => client.getConfig(), [client]);
  return useAsync(fn);
}
