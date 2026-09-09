import { useCallback } from 'react';
import type { DashboardClient } from '../../data/client';
import type { OfferDetail } from '../../data/types';
import type { AsyncState } from '../matin/useAsync';
import { useAsync } from '../matin/useAsync';

/**
 * Le détail d'une offre (`GET /offers/:id`). `null` est un résultat VALIDE
 * (l'offre n'existe pas / plus) — distinct de `erreur` (panne réseau) :
 * `DetailScreen` doit pouvoir dire « introuvable » sans confondre ça avec
 * « le chargement a échoué », même règle que `useAsync` applique déjà entre
 * `chargement` et `erreur` (aucun de ces trois états ne se substitue à un
 * autre).
 */
export function useOfferDetail(
  client: DashboardClient,
  offerId: string,
): [AsyncState<OfferDetail | null>, () => void] {
  const fn = useCallback(() => client.getOfferDetail(offerId), [client, offerId]);
  return useAsync(fn);
}
