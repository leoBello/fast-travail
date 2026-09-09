import { Score } from '../../ui/kit/Score';
import { scoreJetons } from '../../data/format';
import type { OfferDashboardRow } from '../../data/types';
import { t } from '../../i18n/i18n';
import styles from './RankSection.module.css';

interface Props {
  offer: OfferDashboardRow;
}

/**
 * « Pourquoi cette offre est à ce rang » (`Detail.dc.html`) : le couple de
 * scores (`Score`, kit) suivi de la phrase qui distingue le figé (`fit`,
 * payé) du réglable (les six bonus/malus, gratuits — GUIDELINES §3.4).
 *
 * Composé sur `Score` plutôt que réimplémenté : c'est déjà le rendu du kit
 * pour ce couple, `OfferCard` (tâche 7) l'utilise de la même façon.
 */
export function RankSection({ offer }: Props) {
  return (
    <section className={styles.section}>
      <span className={styles.titre}>{t('detail.pourquoiCeRang')}</span>
      <Score
        final={offer.final_score}
        fit={offer.fit_score}
        libelleFinal={t('matin.rang')}
        libelleFit={t('matin.corresp')}
        jetons={scoreJetons(offer)}
      />
      <p className={styles.explication}>{t('detail.rangExplication')}</p>
    </section>
  );
}
