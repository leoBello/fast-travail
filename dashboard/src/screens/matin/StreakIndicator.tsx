import { t } from '../../i18n/i18n';
import styles from './StreakIndicator.module.css';

interface Props {
  /** `stats.streak.days` (`api-dashboard` `/stats`) — jours de suite avec au
   * moins une candidature ENVOYÉE, jamais lue. Ignoré tant que `chargement`
   * est vrai. */
  jours: number;
  /** Vrai tant que `/stats` n'a jamais répondu. Sans cette distinction,
   * `jours` vaudrait 0 par défaut AVANT que le réseau n'ait répondu, et
   * afficherait « série non commencée » alors qu'une série réelle pourrait
   * exister — exactement le défaut nommé par la revue de tâche 7 (un fait
   * FAUX affiché comme s'il était confirmé). */
  chargement?: boolean;
}

/**
 * L'indicateur de série (`Main.dc.html` / `Etats.dc.html`, jour zéro).
 *
 * Trois états, jamais confondus : `chargement` (rien d'affirmé),
 * `jours === 0` (« série non commencée » — un fait confirmé, pas une
 * absence de données), `jours > 0` (le compte). GUIDELINES §3.3 : un
 * compteur de motivation doit se nommer à zéro, pas se vider — et ne
 * jamais affirmer un zéro qu'on ne connaît pas encore.
 */
export function StreakIndicator({ jours, chargement = false }: Props) {
  const actif = !chargement && jours > 0;
  return (
    <span
      className={styles.groupe}
      data-jours={chargement ? undefined : jours}
      data-chargement={chargement}
    >
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
      {chargement
        ? t('matin.chargement')
        : actif
          ? t('jourZero.serieJours', jours)
          : t('jourZero.serieNonCommencee')}
    </span>
  );
}
