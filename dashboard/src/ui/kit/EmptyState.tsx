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
 */
export function EmptyState({ titre, detail }: { titre: string; detail: string }) {
  return (
    <div className={styles.vide}>
      <p className={styles.videTitre}>{titre}</p>
      <p className={styles.videDetail}>{detail}</p>
    </div>
  );
}
