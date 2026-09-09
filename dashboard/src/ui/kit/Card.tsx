import type { ReactNode } from 'react';
import styles from './Card.module.css';

/** Une carte de faits : un titre discret, des couples libellé/valeur. */
export function Card({
  titre,
  extra,
  children,
}: {
  titre?: string;
  /** Contenu aligné à droite du titre — un badge, le plus souvent. */
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.card}>
      {titre === undefined && extra === undefined ? null : (
        <header className={styles.entete}>
          {titre === undefined ? null : <h3 className={styles.titre}>{titre}</h3>}
          {extra === undefined ? null : <span className={styles.extra}>{extra}</span>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Un couple libellé / valeur. La valeur est à droite, alignée. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{children}</span>
    </div>
  );
}

/**
 * Une valeur absente, nommée.
 *
 * `data-absent` permet aux tests d'affirmer que l'absence a été rendue *comme
 * telle*, et non remplacée par une chaîne vide ou un tiret — les deux se
 * lisant comme un défaut d'affichage. Pour les sept natures d'absence propres
 * à ce projet (GUIDELINES §3.1), voir `Absence`, qui étend ce principe sans
 * le dupliquer.
 */
export function Absent({ children }: { children: ReactNode }) {
  return (
    <span className={styles.absent} data-absent="true">
      {children}
    </span>
  );
}
