import type { ReactNode } from 'react';
import styles from './Card.module.css';

/**
 * Un vide nommé.
 *
 * `detail` n'est pas décoratif : il dit *pourquoi* c'est vide. « Rien à
 * décider ce matin » seul laisse croire à un défaut de chargement ; « les
 * six offres du jour sont traitées » dit que le vide est le résultat normal
 * du travail fait (GUIDELINES §3.3, maquette « Trois vides, trois causes »).
 *
 * `titre` et `detail` sont des props, jamais du texte en dur : l'i18n
 * (tâche 4) fournira la chaîne, ce composant ne fait que la disposer.
 *
 * `action` (tâche 10, `OngletsSuivi.dc.html`) : une fente optionnelle sous
 * le détail — un vide qui EST une étape du parcours (un onglet de statut à
 * zéro) peut porter un geste qui en sort, jamais l'inverse. Le kit
 * s'étend, il ne se double pas (GUIDELINES §1) : pas de second composant de
 * vide à côté de celui-ci pour ce seul besoin.
 */
export function EmptyState({
  titre,
  detail,
  action,
}: {
  titre: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.vide}>
      <p className={styles.videTitre}>{titre}</p>
      <p className={styles.videDetail}>{detail}</p>
      {action === undefined ? null : <div className={styles.videAction}>{action}</div>}
    </div>
  );
}
