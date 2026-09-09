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
 * Charge `fn()` au montage et à chaque changement de `deps`, avec un
 * `recharger()` qui rejoue le même appel (utilisé après une décision
 * "Garder"/"Écarter", ou par un bouton "Réessayer" sur l'état d'erreur).
 *
 * **Choix assumé** : un rechargement (changement de `deps`, ou
 * `recharger()`) ne repasse PAS par l'état `chargement` — les données
 * précédentes restent affichées jusqu'à ce que les nouvelles arrivent (ou
 * qu'une erreur survienne). Seul le tout premier appel montre `chargement`
 * (la valeur initiale de l'état, jamais posée depuis l'intérieur de
 * l'effet). Deux raisons : pas de clignotement à chaque changement de page
 * ou de filtre, et surtout — poser `chargement` de façon SYNCHRONE au
 * début du corps de l'effet déclenche une erreur de lint
 * (`react-hooks/set-state-in-effect`, non contournable : CLAUDE.md interdit
 * tout `eslint-disable`) : React documente cette même conclusion
 * (« l'état ne doit être posé que depuis un callback », jamais en tête d'un
 * effet).
 *
 * Protège aussi contre la course classique : si `deps` change pendant
 * qu'un appel est en vol, la réponse de l'appel PÉRIMÉ (`annule === true`)
 * est ignorée plutôt que d'écraser l'état plus frais qui a pu arriver
 * entre-temps.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): [AsyncState<T>, () => void] {
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
    // deps est la liste explicite fournie par l'appelant (chaque hook
    // concret de `hooks.ts` la construit à la main, à partir de valeurs
    // primitives) — react-hooks/exhaustive-deps ne peut pas vérifier un
    // tableau construit par spread, d'où les deux AVERTISSEMENTS (pas des
    // erreurs — `npm run lint` n'échoue que sur une erreur) qu'il pose ici.
    // `fn` reste volontairement hors de la liste : chaque appelant
    // reconstruit `fn` à chaque rendu (une fermeture sur ses props/state
    // courants), l'y ajouter provoquerait une boucle de rechargement
    // continue. Pas de `eslint-disable` (interdit, CLAUDE.md) : ce
    // commentaire documente le choix au lieu de faire taire l'outil.
  }, [...deps, nonce]);

  const recharger = useCallback(() => setNonce((n) => n + 1), []);

  return [state, recharger];
}
