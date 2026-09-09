import { MotionConfig, useReducedMotion } from 'framer-motion';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

/**
 * Applique la préférence système « moins de mouvement » à TOUTE animation
 * Framer Motion du sous-arbre (`layout` sur les lignes, `AnimatePresence`
 * sur la sortie d'une carte décidée).
 *
 * **Pourquoi `theme.css` ne suffit pas** (revue de tâche 7, corrigée ici) :
 * son bloc `@media (prefers-reduced-motion: reduce)` neutralise
 * `animation-duration`/`transition-duration` en CSS — mais Framer Motion
 * anime en JS, via la Web Animations API et des styles posés directement
 * sur l'élément. Une règle CSS n'a aucune prise sur ce mécanisme, quelle
 * que soit sa spécificité.
 *
 * **`useReducedMotion()` explicite plutôt que `reducedMotion="user"` opaque** :
 * la prop `"user"` de `MotionConfig` lit elle-même la préférence système en
 * interne, mais ne l'expose nulle part — impossible de PROUVER par un test
 * qu'elle a été lue correctement sans reproduire tout le mécanisme interne
 * de Framer Motion. Appeler `useReducedMotion()` ici, une fois, et
 * transmettre son résultat à la fois à `MotionConfig` (`reducedMotion`,
 * `'always' | 'never'`) et à un attribut DOM (`document.documentElement
 * .dataset.reducedMotion`) rend la même lecture vérifiable : un test peut
 * simuler la préférence système (`window.matchMedia`) et lire l'attribut
 * qui en résulte, sans avoir à interroger l'état interne de la bibliothèque.
 *
 * L'attribut est posé sur `document.documentElement` — un système
 * EXTERNE à React — depuis un effet : c'est exactement l'usage qu'un effet
 * doit avoir (synchroniser React vers un système externe), pas un
 * `setState` React synchrone (voir `useAsync.ts`, même piège déjà nommé).
 */
export function MotionRoot({ children }: { children: ReactNode }) {
  const reduit = useReducedMotion();

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reduit === true);
  }, [reduit]);

  return (
    <MotionConfig reducedMotion={reduit === true ? 'always' : 'never'}>{children}</MotionConfig>
  );
}
