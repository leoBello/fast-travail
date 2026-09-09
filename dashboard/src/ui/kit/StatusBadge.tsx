import type { ReactNode } from 'react';
import { Badge } from './Badge';
import type { BadgeTaille } from './Badge';
import { TON_STATUT } from './statusTon';

/**
 * Les six étapes du suivi d'une candidature, et sa sortie.
 *
 * Valeurs alignées sur la contrainte `offer_applications_status_connu`
 * (migration `20260910000000_offer_applications.sql`) : `'a_traiter' |
 * 'retenue' | 'postulee' | 'relancee' | 'entretien' | 'terminee' |
 * 'ecartee'`. `'ecartee'` n'est pas une septième étape : c'est une sortie
 * possible à tout moment, y compris avant d'avoir postulé (GUIDELINES §1,
 * maquette « Les six étapes du suivi, et la sortie »).
 */
export type SuiviStatus =
  'a_traiter' | 'retenue' | 'postulee' | 'relancee' | 'entretien' | 'terminee' | 'ecartee';

// Réexporté depuis `statusTon.ts` (voir ce fichier pour le pourquoi de la
// séparation) : `import { TON_STATUT } from '.../StatusBadge'` reste le
// point d'entrée public, comme si la constante vivait ici.
export { TON_STATUT } from './statusTon';

interface Props {
  status: SuiviStatus;
  /**
   * Le libellé affiché — fourni par l'appelant, jamais contenu ici : l'i18n
   * (tâche 4) le fournira, ce composant ne fait que choisir le ton.
   */
  label: ReactNode;
  /** Transmise telle quelle à `Badge` ; `undefined` y retombe sur `normale`. */
  taille?: BadgeTaille;
}

/**
 * Le statut de suivi d'une candidature.
 *
 * `'ecartee'` porte le trait discontinu et n'a pas de point : dans la
 * maquette, c'est la seule pastille sans pastille — la forme dit « sortie »
 * avant même la couleur.
 */
export function StatusBadge({ status, label, taille }: Props) {
  return (
    <Badge
      ton={TON_STATUT[status]}
      taille={taille}
      point={status !== 'ecartee'}
      discontinu={status === 'ecartee'}
    >
      {label}
    </Badge>
  );
}
