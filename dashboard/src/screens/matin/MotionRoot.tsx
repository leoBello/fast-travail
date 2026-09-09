import { MotionConfig, useReducedMotion, useReducedMotionConfig } from 'framer-motion';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

/**
 * Lit la valeur EFFECTIVE de « moins de mouvement » telle qu'un descendant
 * de `<MotionConfig>` la percevrait réellement, et la reflète dans un
 * attribut DOM diagnostiquable.
 *
 * **Pourquoi un enfant de `<MotionConfig>`, pas une variable partagée en
 * amont** (revue de tâche 7, troisième passe — le défaut précédent) : poser
 * l'attribut depuis une expression calculée À CÔTÉ de la prop
 * `reducedMotion` (même à partir de la même variable source) ne prouve
 * jamais que `<MotionConfig>` a REÇU cette valeur — un mutant qui casserait
 * uniquement la ligne qui pose la prop (ex. `reducedMotion="never"` en dur)
 * laisserait l'attribut, calculé ailleurs, correct par coïncidence.
 * `useReducedMotionConfig()` (exportée par `framer-motion`) lit, elle,
 * `useContext(MotionConfigContext)` — le contexte que `<MotionConfig>`
 * fournit RÉELLEMENT à ses descendants — et le combine avec la préférence
 * système brute. Un composant qui l'appelle EN TANT QU'ENFANT de
 * `<MotionConfig>` observe donc structurellement ce que le reste de
 * l'arbre observe, prop comprise : casser la prop casse cette lecture.
 */
function DiagnosticReducedMotion() {
  const effectif = useReducedMotionConfig();

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(effectif);
  }, [effectif]);

  return null;
}

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
 * **`useReducedMotion()` explicite plutôt que `reducedMotion="user"`
 * opaque** : la prop `"user"` de `MotionConfig` lit elle-même la
 * préférence système en interne, mais ne l'expose nulle part.
 * `DiagnosticReducedMotion` (ci-dessus), monté comme enfant de
 * `<MotionConfig>`, rend cette lecture vérifiable de bout en bout — un
 * test peut simuler la préférence système (`window.matchMedia`) et lire
 * l'attribut qui en résulte, avec une prise réelle sur ce que
 * `<MotionConfig>` a effectivement reçu.
 */
export function MotionRoot({ children }: { children: ReactNode }) {
  const reduit = useReducedMotion();

  return (
    <MotionConfig reducedMotion={reduit === true ? 'always' : 'never'}>
      <DiagnosticReducedMotion />
      {children}
    </MotionConfig>
  );
}
