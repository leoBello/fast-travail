import { fr } from './fr';

type Dictionnaire = typeof fr;

/**
 * Toutes les clés `"groupe.champ"` du dictionnaire, dérivées de `fr`
 * lui-même — jamais tapées à la main à côté. C'est ce qui rend une clé
 * inexistante détectable à la compilation plutôt qu'à l'exécution : le
 * type se recalcule automatiquement à chaque ajout ou retrait dans
 * `fr.ts`, sans second fichier à tenir synchronisé.
 */
export type Cle = {
  [G in keyof Dictionnaire]: `${G & string}.${keyof Dictionnaire[G] & string}`;
}[keyof Dictionnaire];

/** La valeur (chaîne ou fonction) portée par une clé donnée. */
type ValeurDe<C extends Cle> = C extends `${infer G}.${infer K}`
  ? G extends keyof Dictionnaire
    ? K extends keyof Dictionnaire[G]
      ? Dictionnaire[G][K]
      : never
    : never
  : never;

/** Les arguments qu'appelle une clé : ceux de sa fonction, ou aucun pour une chaîne fixe. */
type ArgumentsDe<C extends Cle> = ValeurDe<C> extends (...args: infer A) => string ? A : [];

/**
 * Résout une clé `"groupe.champ"` dans `fr`, sans supposer sa forme :
 * seul le point de contact avec un objet non typé (les deux niveaux
 * d'index par une chaîne calculée à l'exécution) exige un ancrage de
 * type — un unique `as`, sur un type concret et non sur `any` ni sur
 * `unknown as X`, qui reste valable parce que la signature publique de
 * `t()` ci-dessous restreint déjà `cle` et `args` à ce que `fr` autorise
 * réellement.
 */
function resoudre(cle: string): string | ((...args: unknown[]) => string) {
  const point = cle.indexOf('.');
  const groupe = cle.slice(0, point);
  const champ = cle.slice(point + 1);
  const dictionnaire = fr as Record<
    string,
    Record<string, string | ((...args: unknown[]) => string)>
  >;
  return dictionnaire[groupe][champ];
}

/**
 * Le traducteur. `t('groupe.champ')` pour une chaîne fixe,
 * `t('groupe.champ', ...args)` pour une entrée paramétrée (ex.
 * `t('vides.rienADeciderDetail', 6)`) — le typage de `args` dépend de la
 * clé, `tsc` refuse un appel avec les mauvais arguments comme il refuse
 * une clé absente de `fr.ts`.
 *
 * Une seule langue existe aujourd'hui (`fr`, GUIDELINES §3.8) : ajouter un
 * sélecteur de langue plus tard ne change ni cette signature ni les
 * appels déjà écrits, seulement ce que `resoudre` regarde.
 */
export function t<C extends Cle>(cle: C, ...args: ArgumentsDe<C>): string {
  const valeur = resoudre(cle);
  return typeof valeur === 'function' ? valeur(...args) : valeur;
}
