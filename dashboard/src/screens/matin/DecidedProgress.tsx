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
  /** La taille de la bande au chargement — le dénominateur réel. Sans
   * signification tant que `chargement` est vrai (voir plus bas). */
  total: number;
  /** Vrai tant que `/brief` (donc `total`) n'a jamais répondu.
   *
   * **Le défaut qu'un premier correctif a rouvert** (revue de tâche 7,
   * deuxième passe) : `decidees` est persisté (`localStorage`,
   * `decidedStorage.ts`) et peut donc valoir un nombre positif DÈS LE
   * MONTAGE — avant même que `/brief` ait répondu, `total` vaut encore 0
   * (sa valeur initiale). Sans ce garde, `decidees=2, total=0` calculait
   * `rempli = round(2/0 … )` en pratique ramené à 0 par la garde `total >
   * 0` existante, PUIS remonté à 2/(0+2)=2/2=10 segments par
   * `MorningBand`, qui passe `total + decidees` comme dénominateur — soit
   * une jauge affichant "tout est décidé" avant d'avoir rien demandé au
   * serveur. Avec `chargement`, la jauge reste à blanc quel que soit
   * `decidees` tant que `total` n'est pas confirmé. */
  chargement?: boolean;
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
 * `decidees` seul (la légende, « N décidées ») reste affiché même pendant
 * `chargement` : c'est un fait LOCAL (lu depuis `localStorage`), vrai
 * indépendamment de ce que `/brief` répond. Seule la PROPORTION (les
 * segments, l'aria-label « X sur Y ») dépend de `total`, un fait SERVEUR —
 * elle seule doit attendre.
 */
export function DecidedProgress({ decidees, total, chargement = false }: Props) {
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
