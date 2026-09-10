import { motion } from 'framer-motion';
import { Badge } from '../../ui/kit/Badge';
import { Absence } from '../../ui/kit/Absence';
import { StatusBadge } from '../../ui/kit/StatusBadge';
import {
  badgesDeFaits,
  formatCompensation,
  formatDateCandidature,
  formatEmployeur,
  formatLieu,
} from '../../data/format';
import type { DateColonne } from '../../data/format';
import type { OfferDashboardRow } from '../../data/types';
import { t } from '../../i18n/i18n';
import styles from './OfferRow.module.css';

interface Props {
  offer: OfferDashboardRow;
  /** Ouvre le détail de l'offre (tâche 8, `Detail.dc.html`). Optionnel : les
   * tests qui rendent `OfferRow` isolément n'ont pas à le fournir, et la
   * ligne reste alors simplement lisible, sans geste possible — même
   * principe d'extension sans rupture que `Card.extra`. */
  onOuvrir?: (id: string) => void;
  /** La 5e colonne rend le STATUT au lieu du LIEU — vrai sur tout onglet
   * autre que « À traiter » (`VeilleRepliee.dc.html`). Sans elle, un onglet
   * mélangerait quatorze décisions à mille lignes sans le dire. */
  afficherStatut: boolean;
  /** Ce que la 6e colonne montre. Voir `DateColonne` : seules trois étapes
   * ont une date en base. */
  dateColonne: DateColonne;
  /** Le plancher `scoring_weights.salaire_floor` (tâche 10, `GET /config`) —
   * `null` tant qu'il n'a pas été lu, voir `data/format.ts`. */
  salaireFloor: number | null;
}

/**
 * Une ligne de « Toute la veille » (`Main.dc.html`).
 *
 * Cliquable dès que `onOuvrir` est fourni (tâche 8) : `.row` est déjà un
 * conteneur `grid` sans enfant interactif, donc `role="button"` + `tabIndex`
 * + la gestion clavier ci-dessous suffisent à en faire un point d'accroche
 * accessible sans changer sa mise en page — un vrai `<button>` grid-conteneur
 * marcherait tout aussi bien visuellement, mais casserait le survol déjà
 * posé par CSS sur `.row` sans reprise de styles.
 */
export function OfferRow({ offer, onOuvrir, afficherStatut, dateColonne, salaireFloor }: Props) {
  const employeur = formatEmployeur(offer);
  const lieu = formatLieu(offer);
  const publication = formatDateCandidature(offer, dateColonne);
  const compensation = formatCompensation(offer, salaireFloor);

  function ouvrir() {
    onOuvrir?.(offer.id);
  }

  return (
    <motion.div
      layout
      className={styles.row}
      data-offer-id={offer.id}
      role={onOuvrir === undefined ? undefined : 'button'}
      tabIndex={onOuvrir === undefined ? undefined : 0}
      onClick={onOuvrir === undefined ? undefined : ouvrir}
      onKeyDown={
        onOuvrir === undefined
          ? undefined
          : (evenement) => {
              if (evenement.key === 'Enter' || evenement.key === ' ') {
                evenement.preventDefault();
                ouvrir();
              }
            }
      }
    >
      <span className={styles.rang}>{offer.final_score}</span>
      <span className={styles.corr}>{offer.fit_score}</span>
      <div className={styles.intitule}>
        <span className={styles.trunc}>
          {offer.title === null || offer.title.trim() === '' ? (
            <Absence nature="non-publiee">{t('absences.non-publiee')}</Absence>
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
      {afficherStatut ? (
        <span className={styles.trunc}>
          {offer.candidature_statut === null ? (
            <Absence nature="non-precisee">{t('matin.sansDecision')}</Absence>
          ) : (
            <StatusBadge
              status={offer.candidature_statut}
              taille="compacte"
              label={t(`statuts.${offer.candidature_statut}`)}
            />
          )}
        </span>
      ) : (
        <span className={styles.trunc}>
          {lieu.connu ? (
            lieu.texte
          ) : (
            <Absence nature="non-precisee">{t('absences.non-precisee')}</Absence>
          )}
        </span>
      )}
      <span className={styles.publiee}>
        {publication.connu ? (
          publication.texte
        ) : dateColonne === 'publiee' ? (
          // `published_at` est un champ de SOURCE (métadonnée de collecte),
          // jamais extrait par le modèle : son absence relève de « non
          // publiée par la source », pas de « non précisée » (qui suppose
          // un champ que le modèle aurait dû dégager d'un texte — GUIDELINES
          // §3.1). Revue de tâche 7 : uniformisé avec `Absence`, comme
          // l'employeur et le lieu ci-dessus — jamais `Absent` nu.
          <Absence nature="non-publiee">{t('absences.non-publiee')}</Absence>
        ) : (
          // Une date d'étape n'a ni source ni modèle derrière elle : elle
          // n'a pas été enregistrée au moment où le statut a été posé —
          // une NEUVIÈME nature d'absence, distincte des huit précédentes
          // (tâche 9, GUIDELINES §3.1).
          <Absence nature="non-datee">{t('absences.non-datee')}</Absence>
        )}
      </span>
    </motion.div>
  );
}
