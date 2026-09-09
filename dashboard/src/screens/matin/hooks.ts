import { useCallback } from 'react';
import type { DashboardClient } from '../../data/client';
import { countByWorkMode } from '../../data/client';
import { WORK_MODE_UNSPECIFIED, WORK_MODES } from '../../data/types';
import type {
  Engagement,
  OfferDashboardRow,
  PageResult,
  SortField,
  Source,
  StatsResult,
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
  return useAsync(fn, [client, page]);
}

export interface OffersListParams {
  sort: SortField;
  page: number;
  pageSize: number;
  workMode?: WorkModeFilter;
  engagement?: Engagement;
  source?: Source;
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
  return useAsync(fn, [client, sort, page, pageSize, workMode, engagement, source, agenticAi]);
}

export function useStats(client: DashboardClient): [AsyncState<StatsResult>, () => void] {
  const fn = useCallback(() => client.getStats(), [client]);
  return useAsync(fn, [client]);
}

/** Les quatre valeurs de `work_mode` (les trois connues, plus « non précisé »),
 * chacune chiffrée — jamais un filtre qui masquerait silencieusement les
 * 68 % d'offres sans mode de travail connu (GUIDELINES §3.2). */
export type WorkModeCounts = Record<WorkModeFilter, number>;

export function useWorkModeCounts(
  client: DashboardClient,
): [AsyncState<WorkModeCounts>, () => void] {
  const fn = useCallback(async () => {
    const valeurs: WorkModeFilter[] = [...WORK_MODES, WORK_MODE_UNSPECIFIED];
    const comptes = await Promise.all(valeurs.map((v) => countByWorkMode(client, v)));
    return Object.fromEntries(valeurs.map((v, i) => [v, comptes[i]])) as WorkModeCounts;
  }, [client]);
  return useAsync(fn, [client]);
}
