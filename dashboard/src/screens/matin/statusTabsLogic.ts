import { APPLICATION_STATUSES, STATUT_UNDECIDED } from '../../data/types';
import type { StatutCounts, StatutFilter } from '../../data/types';
import type { SuiviStatus } from '../../ui/kit/StatusBadge';

/**
 * La logique pure de la barre d'onglets (`StatusTabs.tsx`) — dans un fichier
 * séparé, sans JSX, exprès : un composant `.tsx` qui exporterait aussi ces
 * fonctions casserait le rafraîchissement à chaud de Vite
 * (`react-refresh/only-export-components`, vérifié : `allowConstantExport`
 * couvre une réexportation de constante ou de type, jamais de fonction).
 * `StatusTabs.tsx` importe ce module, il ne le réexporte pas.
 */

/** Les sept étapes du suivi, plus « Toutes ». Pas de huitième étape
 * inventée : `ecartee` est une sortie, `toutes` n'est pas un statut mais
 * l'absence de restriction (GUIDELINES §1). */
export type OngletId = SuiviStatus | 'toutes';

export const ONGLET_PAR_DEFAUT: OngletId = 'a_traiter';

/** Les sept onglets de statut, dans l'ordre de la maquette (`Main.dc.html`) —
 * sans « Toutes », qui suit après le séparateur visuel de `StatusTabs`. */
export const STATUT_ONGLETS: readonly SuiviStatus[] = [
  'a_traiter',
  'retenue',
  'postulee',
  'relancee',
  'entretien',
  'terminee',
  'ecartee',
];

/**
 * Le filtre `statut` que porte un onglet — `undefined` ne restreint rien.
 *
 * « À traiter » porte **deux** valeurs, et c'est le point à ne pas rater :
 * une offre jamais ouverte n'a aucune ligne `offer_applications` (donc
 * `candidature_statut` nul, `STATUT_UNDECIDED`), tandis qu'une offre dont le
 * détail a été ouvert sans décision porte `a_traiter` (posé par `openOffer`).
 * Les deux sont à traiter. Le serveur les compose en OU (`listOffers`).
 */
export function filtreStatutPourOnglet(id: OngletId): StatutFilter[] | undefined {
  if (id === 'toutes') return undefined;
  if (id === 'a_traiter') return [STATUT_UNDECIDED, 'a_traiter'];
  return [id];
}

/** Le compte affiché sur un onglet, dérivé des huit nombres de
 * `GET /statut-counts`. « À traiter » additionne les deux valeurs qu'il
 * porte ; « Toutes » additionne les huit. */
export function comptePourOnglet(id: OngletId, comptes: StatutCounts): number {
  if (id === 'toutes') {
    return [...APPLICATION_STATUSES, STATUT_UNDECIDED].reduce(
      (somme, clef) => somme + comptes[clef],
      0,
    );
  }
  if (id === 'a_traiter') return comptes[STATUT_UNDECIDED] + comptes.a_traiter;
  return comptes[id];
}
