import { BRIEF_THRESHOLD } from '../../data/types';
import { t } from '../../i18n/i18n';
import styles from './NeverOpenedCard.module.css';

interface Props {
  /** `stats.neverOpened` — `null` tant que `/stats` n'a jamais répondu. */
  neverOpened: number | null;
  chargement: boolean;
  /** Ouvre la bande « Ce matin » (`MatinScreen`), qui liste exactement ces
   * offres — même requête que `neverOpened` (`GET /brief`, voir
   * `dashboard-query.ts`). Ce composant ne construit aucune liste propre : il
   * renvoie vers celle qui existe déjà plutôt que d'en dupliquer une. */
  onParcourir: () => void;
}

/**
 * « Jamais ouvertes » (`Suivi.dc.html`) : le compteur anti-perte, offres
 * au-dessus du seuil sans ligne `offer_applications` — le critère fondateur
 * du dépôt, rendu visible.
 *
 * Jamais confondu chargement/zéro réel, même principe que les autres cartes
 * de cet écran (GUIDELINES §3.3).
 */
export function NeverOpenedCard({ neverOpened, chargement, onParcourir }: Props) {
  const pret = !chargement && neverOpened !== null;

  return (
    <div className={styles.carte} data-chargement={!pret}>
      <span className={styles.titre}>{t('suivi.antiPerteTitre')}</span>
      <div className={styles.grand}>
        <OeilIcone />
        {pret ? (
          <>
            <span className={styles.nombre}>{neverOpened}</span>
            <span className={styles.libelle}>{t('suivi.antiPerteSeuil', BRIEF_THRESHOLD)}</span>
          </>
        ) : (
          <span className={styles.attente}>{t('suivi.chargement')}</span>
        )}
      </div>
      <p className={styles.note}>{t('suivi.antiPerteNote')}</p>
      <button
        type="button"
        className={styles.bouton}
        onClick={onParcourir}
        disabled={!pret || neverOpened === 0}
      >
        {t('suivi.antiPerteParcourir')}
      </button>
    </div>
  );
}

function OeilIcone() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={styles.icone}
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
