import type { StatsResult } from '../../data/types';
import { t } from '../../i18n/i18n';
import styles from './ResponseRateCard.module.css';

/**
 * Sous ce nombre d'envois, un pourcentage est un chiffre inventé — la règle
 * posée par task-9-brief.md (« Un pourcentage sur cinq envois est un chiffre
 * inventé »), pas une mesure du dépôt : isolée ici pour rester un seul
 * endroit à ajuster.
 */
export const TAUX_REPONSE_SEUIL_BRUT = 20;

interface Props {
  /** `null` tant que `/stats` n'a jamais répondu. */
  responseRate: StatsResult['responseRate'] | null;
  chargement: boolean;
}

/**
 * Le taux de réponse (`Suivi.dc.html`) : affiché **brut** (`1 / 5`) sous
 * {@link TAUX_REPONSE_SEUIL_BRUT} candidatures envoyées, en pourcentage
 * au-delà.
 */
export function ResponseRateCard({ responseRate, chargement }: Props) {
  const pret = !chargement && responseRate !== null;
  const brut = pret && responseRate.sent < TAUX_REPONSE_SEUIL_BRUT;
  const pourcentage =
    pret && !brut && responseRate.sent > 0
      ? Math.round((responseRate.responses / responseRate.sent) * 100)
      : null;

  return (
    <div className={styles.carte} data-chargement={!pret}>
      <div className={styles.ligne}>
        {pret ? (
          <span className={styles.nombre}>
            {pourcentage === null
              ? t('suivi.reponseBrut', responseRate.responses, responseRate.sent)
              : t('suivi.reponseTaux', pourcentage)}
          </span>
        ) : (
          <span className={styles.attente}>{t('suivi.chargement')}</span>
        )}
        <span className={styles.libelle}>{t('suivi.reponseTitre')}</span>
      </div>
      {brut ? (
        <p className={styles.note}>{t('suivi.reponseNoteBrut', TAUX_REPONSE_SEUIL_BRUT)}</p>
      ) : null}
    </div>
  );
}
