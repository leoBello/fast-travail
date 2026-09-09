import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Sans ce démontage, deux tests qui rendent le même composant laissent deux
 * copies dans le document : les requêtes `getByText`/`getByRole` deviennent
 * ambiguës et échouent sur un « found multiple elements » qui n'a rien à voir
 * avec la règle testée. `@testing-library/react` l'enregistre normalement
 * lui-même, mais seulement s'il détecte un `afterEach` global — or
 * `test.globals` vaut `false` dans `vite.config.ts`, donc rien ne le fait
 * sans cette ligne.
 */
afterEach(cleanup);

/*
 * jsdom n'a pas de « top layer » : rien n'y est jamais modal ni en plein
 * écran. Floating UI (Base UI, sous `kit/Tooltip.tsx`) le demande quand même —
 * `isTopLayer()` interroge `:modal` sur chaque ancêtre, à chaque passe de
 * calcul de position d'un élément flottant.
 *
 * nwsapi, le moteur de sélecteurs de jsdom, répond à `:modal` et à
 * `:fullscreen` en rappelant `element.matches()` pour déléguer à une
 * implémentation native. Dans jsdom il n'y en a pas : c'est lui-même qu'il
 * rappelle, jusqu'au débordement de pile, qu'il rattrape en silence pour
 * renvoyer `false`. Un seul `matches(':modal')` coûte donc des centaines de
 * milliers d'appels imbriqués ; l'ouverture d'une infobulle en déclenche
 * assez pour affamer la boucle d'événements au point que les délais de
 * `userEvent` se déclenchent trop tard et que le test expire — mesuré sur
 * `Tooltip.test.tsx` en écrivant cette tâche (deux tests sur cinq passaient
 * de quelques secondes à un timeout de 5 s).
 *
 * On répond donc nous-mêmes, et `false` est la réponse exacte pour jsdom.
 * À retirer le jour où nwsapi cessera de se rappeler lui-même.
 */
const PSEUDO_CLASSES_SANS_EQUIVALENT_JSDOM = new Set([':modal', ':fullscreen']);

// Ce fichier sert aussi les tests qui déclarent l'environnement `node` (voir
// `ui/theme.test.ts`, `ui/guidelines.test.ts`) : là où il n'y a pas de DOM, il
// n'y a rien à corriger.
if (typeof Element !== 'undefined') {
  const matchesNatif = Element.prototype.matches;
  Element.prototype.matches = function (this: Element, selecteurs: string): boolean {
    if (PSEUDO_CLASSES_SANS_EQUIVALENT_JSDOM.has(selecteurs)) {
      return false;
    }
    return matchesNatif.call(this, selecteurs);
  };
}
