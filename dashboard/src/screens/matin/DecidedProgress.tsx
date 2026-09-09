import { t } from '../../i18n/i18n';
import styles from './DecidedProgress.module.css';

const SEGMENTS = 10;

interface Props {
  /** Décidées AUJOURD'HUI (Garder/Écarter cliqués dans la bande « Ce matin »),
   * en jour civil de PARIS — persisté dans `localStorage`
   * (`decidedStorage.ts`), pas remis à zéro à chaque rechargement de page.
   * Ce n'est PAS un chiffre serveur : `first_seen_at` ne porte que deux
   * jours d'historique (GUIDELINES §3.3), rien de comparable n'existe côté
   * API pour une candidature « décidée aujourd'hui ». Le compte reste donc
   * strictement ce que CE navigateur a observé — jamais partagé entre
   * appareils, jamais lu depuis l'API, jamais un chiffre inventé. */
  decidees: number;
  /** La taille de la bande au chargement — le dénominateur réel. */
  total: number;
}

/**
 * La barre de progression « décidées » de la bande « Ce matin »
 * (`Main.dc.html`, `Etats.dc.html` « jour zéro »).
 *
 * Les dix segments sont une jauge PROPORTIONNELLE (comme un indicateur de
 * charge à dix crans), pas une affirmation qu'il existe dix offres — le
 * chiffre réel (`decidees`/`total`) est celui du texte et de l'aria-label,
 * jamais celui des segments.
 */
export function DecidedProgress({ decidees, total }: Props) {
  const rempli =
    total > 0 ? Math.min(SEGMENTS, Math.max(0, Math.round((decidees / total) * SEGMENTS))) : 0;
  const ariaLabel =
    decidees === 0 ? t('jourZero.ariaAucuneDecidee') : t('jourZero.ariaDecidees', decidees, total);

  return (
    <div className={styles.groupe} data-decidees={decidees}>
      <span className={styles.legende}>{t('jourZero.decidees', decidees)}</span>
      <div className={styles.segments} role="img" aria-label={ariaLabel}>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={i < rempli ? styles.segmentRempli : styles.segmentVide}
            data-rempli={i < rempli}
          />
        ))}
      </div>
    </div>
  );
}
