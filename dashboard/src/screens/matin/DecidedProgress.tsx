import { t } from '../../i18n/i18n';
import styles from './DecidedProgress.module.css';

const SEGMENTS = 10;

interface Props {
  /** Décidées AUJOURD'HUI en jour civil de PARIS — vérité SERVEUR depuis la
   * tâche 10 (`GET /stats.decidedToday`, compté sur `status_changed_at`),
   * plus le `localStorage` par poste de la tâche 7. Sans signification tant
   * que `chargement` est vrai — voir plus bas. */
  decidees: number;
  /** La taille de la bande au chargement — le dénominateur réel. Sans
   * signification tant que `chargement` est vrai (voir plus bas). */
  total: number;
  /** Vrai tant que `decidees` OU `total` n'a jamais été confirmé par le
   * serveur (`/stats` pour `decidees` depuis la tâche 10, `/brief` pour
   * `total` — deux appels indépendants, voir `MorningBand`).
   *
   * Depuis la tâche 10, `decidees` est un fait SERVEUR comme `total` — plus
   * un fait local persistant dans `localStorage` disponible dès le montage
   * (l'ancien défaut de la tâche 7 ne peut plus se reproduire : les deux
   * chiffres arrivent désormais par le réseau, jamais l'un avant l'autre de
   * façon à fausser un ratio). La légende elle-même attend donc `chargement`
   * — jamais un « 0 décidée » qui pourrait être faux le temps d'une réponse. */
  chargement?: boolean;
  /** Resserre les segments (14px au lieu de 20px) pour la bande « Ce matin »
   * REPLIÉE (`VeilleRepliee.dc.html`) — même jauge, même logique, une
   * largeur plus étroite pour tenir sur la ligne unique du repli. */
  compact?: boolean;
}

/**
 * La barre de progression « décidées » de la bande « Ce matin »
 * (`Main.dc.html`, `Etats.dc.html` « jour zéro »).
 *
 * Les dix segments sont une jauge PROPORTIONNELLE (comme un indicateur de
 * charge à dix crans), pas une affirmation qu'il existe dix offres — le
 * chiffre réel (`decidees`/`total`) est celui du texte et de l'aria-label,
 * jamais celui des segments.
 *
 * **Trois états, jamais confondus** : `chargement` masque à la fois la
 * légende et la jauge — depuis la tâche 10, `decidees` est un fait serveur
 * comme `total`, donc les deux attendent la même confirmation avant de
 * s'afficher.
 */
export function DecidedProgress({ decidees, total, chargement = false, compact = false }: Props) {
  const rempli =
    !chargement && total > 0
      ? Math.min(SEGMENTS, Math.max(0, Math.round((decidees / total) * SEGMENTS)))
      : 0;
  const ariaLabel = chargement
    ? t('matin.chargement')
    : decidees === 0
      ? t('jourZero.ariaAucuneDecidee')
      : t('jourZero.ariaDecidees', decidees, total);

  return (
    <div className={styles.groupe} data-decidees={decidees} data-chargement={chargement}>
      <span className={styles.legende}>
        {chargement ? t('matin.compteEnAttente') : t('jourZero.decidees', decidees)}
      </span>
      <div className={styles.segments} role="img" aria-label={ariaLabel}>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={`${i < rempli ? styles.segmentRempli : styles.segmentVide}${
              compact ? ` ${styles.segmentCompact}` : ''
            }`}
            data-rempli={i < rempli}
          />
        ))}
      </div>
    </div>
  );
}
