import { t } from '../../i18n/i18n';
import styles from './StreakIndicator.module.css';

interface Props {
  /** `stats.streak.days` (`api-dashboard` `/stats`) — jours de suite avec au
   * moins une candidature ENVOYÉE, jamais lue. */
  jours: number;
}

/**
 * L'indicateur de série (`Main.dc.html` / `Etats.dc.html`, jour zéro).
 *
 * `jours === 0` a son propre libellé (« série non commencée »), jamais
 * « 0 jour de suite » : GUIDELINES §3.3, un compteur de motivation doit se
 * nommer à zéro, pas se vider.
 */
export function StreakIndicator({ jours }: Props) {
  const actif = jours > 0;
  return (
    <span className={styles.groupe} data-jours={jours}>
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={actif ? styles.iconeActive : styles.iconeInactive}
      >
        <path d="M12 2c1.5 4 5 5.5 5 9.5a5 5 0 0 1-10 0C7 8.5 9 7 9.5 5.5 10.5 7 11 8 12 8c0-2-1-4 0-6z" />
      </svg>
      {actif ? t('jourZero.serieJours', jours) : t('jourZero.serieNonCommencee')}
    </span>
  );
}
