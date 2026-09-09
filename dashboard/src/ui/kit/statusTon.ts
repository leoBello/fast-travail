import type { BadgeTon } from './Badge';
import type { SuiviStatus } from './StatusBadge';

/**
 * Le ton de chaque statut, PARTAGÉ : `StatusBadge` le rend en pastille, la
 * barre d'onglets de « Toute la veille » en point. Deux tables de couleurs
 * pour le même vocabulaire seraient un dialecte, et elles divergeraient au
 * premier changement.
 *
 * Dans un fichier séparé de `StatusBadge.tsx`, exprès : un objet exporté aux
 * côtés d'un composant casse le rafraîchissement à chaud de Vite
 * (`react-refresh/only-export-components` — `allowConstantExport` ne couvre
 * que les littéraux primitifs, pas un objet). `StatusBadge.tsx` réexporte
 * cette constante pour que `import { TON_STATUT } from '.../StatusBadge'`
 * reste le point d'entrée public.
 */
export const TON_STATUT: Record<SuiviStatus, BadgeTon> = {
  a_traiter: 'neutre',
  retenue: 'accent',
  postulee: 'info',
  relancee: 'alerte',
  entretien: 'succes',
  terminee: 'neutre',
  ecartee: 'danger',
};
