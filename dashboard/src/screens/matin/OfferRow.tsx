import { motion } from 'framer-motion';
import { Absent } from '../../ui/kit/Card';
import { Badge } from '../../ui/kit/Badge';
import { Absence } from '../../ui/kit/Absence';
import {
  badgesDeFaits,
  formatCompensation,
  formatEmployeur,
  formatLieu,
  formatPublication,
} from '../../data/format';
import type { OfferDashboardRow } from '../../data/types';
import { t } from '../../i18n/i18n';
import styles from './OfferRow.module.css';

interface Props {
  offer: OfferDashboardRow;
}

/**
 * Une ligne de « Toute la veille » (`Main.dc.html`).
 *
 * Lecture seule : la ligne n'ouvre rien (tâche 8, détail d'une offre, hors
 * périmètre) — pas de point d'accroche construit ici au-delà de ce que la
 * maquette dessine déjà (le grain n'a pas de bouton).
 */
export function OfferRow({ offer }: Props) {
  const employeur = formatEmployeur(offer);
  const lieu = formatLieu(offer);
  const publication = formatPublication(offer.published_at);
  const compensation = formatCompensation(offer);

  return (
    <motion.div layout className={styles.row} data-offer-id={offer.id}>
      <span className={styles.rang}>{offer.final_score}</span>
      <span className={styles.corr}>{offer.fit_score}</span>
      <div className={styles.intitule}>
        <span className={styles.trunc}>
          {offer.title === null || offer.title.trim() === '' ? (
            <Absent>{t('absences.non-publiee')}</Absent>
          ) : (
            offer.title
          )}
        </span>
        {badgesDeFaits(offer).map((badge) => (
          <span key={badge.cle} className={styles.badgeSlot}>
            <Badge ton={badge.ton} taille="compacte" point>
              {badge.label}
            </Badge>
          </span>
        ))}
        {compensation.kind === 'connu' ? (
          <span className={styles.badgeSlot}>
            <Badge ton="succes" taille="compacte" point>
              {compensation.texte}
            </Badge>
          </span>
        ) : null}
        {offer.group_size > 1 ? (
          <span className={styles.badgeSlot}>
            <Badge ton="neutre" taille="compacte" discontinu>
              {t('matin.sources', offer.group_size)}
            </Badge>
          </span>
        ) : null}
      </div>
      <span className={styles.trunc}>
        {employeur.connu ? (
          employeur.texte
        ) : (
          <Absence nature="non-publiee">{t('absences.non-publiee')}</Absence>
        )}
      </span>
      <span className={styles.trunc}>
        {lieu.connu ? (
          lieu.texte
        ) : (
          <Absence nature="non-precisee">{t('absences.non-precisee')}</Absence>
        )}
      </span>
      <span className={styles.publiee}>
        {publication.connu ? publication.texte : <Absent>{t('absences.non-precisee')}</Absent>}
      </span>
    </motion.div>
  );
}
