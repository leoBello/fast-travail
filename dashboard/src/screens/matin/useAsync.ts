import { useCallback, useEffect, useState } from 'react';

/**
 * L'état d'un appel réseau, jamais confondu avec un autre : `erreur` ne
 * porte jamais un tableau vide qui se lirait comme "aucun résultat"
 * (GUIDELINES §3.1, même principe qu'une absence — un vide doit se nommer,
 * jamais se confondre avec un autre vide).
 */
export type AsyncState<T> =
  | { statut: 'chargement' }
  | { statut: 'erreur'; erreur: unknown }
  | { statut: 'succes'; donnees: T };

/**
 * Charge `fn()` au montage et à chaque fois que `fn` change d'identité, avec
 * un `recharger()` qui rejoue le même appel (utilisé après une décision
 * "Garder"/"Écarter", ou par un bouton "Réessayer" sur l'état d'erreur).
 *
 * **`fn` est la SEULE dépendance de l'effet** — pas de second paramètre
 * `deps` construit par l'appelant. Chaque hook concret de `hooks.ts`
 * mémoïse déjà `fn` avec `useCallback` sur ses propres dépendances
 * primitives (`client`, `page`, `sort`…) : son identité ne change QUE quand
 * l'une d'elles change réellement. Ce choix élimine les deux avertissements
 * `react-hooks/exhaustive-deps` de la version précédente (dépendance
 * manquante, tableau construit par spread) à la source plutôt que de les
 * documenter — `dashboard/package.json` fait tourner `eslint --max-warnings
 * 0` : un avertissement contournable est un défaut à corriger, pas une note
 * à garder.
 *
 * **Choix assumé** : un rechargement (`fn` qui change, ou `recharger()`) ne
 * repasse PAS par l'état `chargement` — les données précédentes restent
 * affichées jusqu'à ce que les nouvelles arrivent (ou qu'une erreur
 * survienne). Seul le tout premier appel montre `chargement` (la valeur
 * initiale de l'état, jamais posée depuis l'intérieur de l'effet). Deux
 * raisons : pas de clignotement à chaque changement de page ou de filtre,
 * et surtout — poser `chargement` de façon SYNCHRONE au début du corps de
 * l'effet déclenche une erreur de lint (`react-hooks/set-state-in-effect`,
 * non contournable : CLAUDE.md interdit tout `eslint-disable`) : React
 * documente cette même conclusion (« l'état ne doit être posé que depuis un
 * callback », jamais en tête d'un effet).
 *
 * Protège aussi contre la course classique : si `fn` change pendant qu'un
 * appel est en vol, la réponse de l'appel PÉRIMÉ (`annule === true`) est
 * ignorée plutôt que d'écraser l'état plus frais qui a pu arriver
 * entre-temps.
 */
export function useAsync<T>(fn: () => Promise<T>): [AsyncState<T>, () => void] {
  const [state, setState] = useState<AsyncState<T>>({ statut: 'chargement' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let annule = false;

    fn().then(
      (donnees) => {
        if (!annule) setState({ statut: 'succes', donnees });
      },
      (erreur: unknown) => {
        if (!annule) setState({ statut: 'erreur', erreur });
      },
    );

    return () => {
      annule = true;
    };
    // `fn` ET `nonce` sont tous deux dans le tableau ci-dessous : la règle
    // `react-hooks/exhaustive-deps` n'a donc rien à signaler ici. `nonce`
    // force un rechargement (`recharger()`) sans dépendre d'une nouvelle
    // identité de `fn` — utile pour rejouer EXACTEMENT le même appel (ex.
    // bouton "Réessayer") sans que l'appelant ait à reconstruire ses filtres.
  }, [fn, nonce]);

  const recharger = useCallback(() => setNonce((n) => n + 1), []);

  return [state, recharger];
}
