import { Badge } from '../../ui/kit/Badge';
import { StatusBadge } from '../../ui/kit/StatusBadge';
import { EmptyState } from '../../ui/kit/EmptyState';
import { Absence } from '../../ui/kit/Absence';
import { badgesDeFaits, formatEmployeur } from '../../data/format';
import { formatDateLongue, formatJourHeure } from '../../data/parisDate';
import type { OfferDashboardRow, PageResult } from '../../data/types';
import { t } from '../../i18n/i18n';
import type { AsyncState } from '../matin/useAsync';
import type { ColonnePipeline } from './hooks';
import { joursDepuis, relanceDue } from './relance';
import styles from './PipelineColumn.module.css';

interface ColumnProps {
  statut: ColonnePipeline;
  state: AsyncState<PageResult<OfferDashboardRow>>;
  onReessayer: () => void;
  onOuvrirOffre: (id: string) => void;
}

/**
 * Une colonne du pipeline (`Suivi.dc.html`) : les offres au statut donné,
 * jusqu'à trois cartes pleines, le reste replié sous « + N autres ».
 *
 * **Son propre garde** (task-9-brief.md : « chaque sous-composant qui reçoit
 * un nombre a son propre garde ») — indépendant des trois autres colonnes et
 * de l'entonnoir : chacune tient son propre appel réseau (`usePipelineColonne`),
 * et peut donc être en chargement, en erreur ou vide pendant que les autres
 * ont déjà répondu.
 */
export function PipelineColumn({ statut, state, onReessayer, onOuvrirOffre }: ColumnProps) {
  // Le corps de la colonne distingue déjà chargement/erreur/vide : l'en-tête
  // doit dire la MÊME chose, pas confondre les deux dans un même « … » — une
  // erreur qui se lit comme un chargement encourage à attendre indéfiniment
  // une réponse qui ne viendra pas.
  const compte =
    state.statut === 'succes'
      ? state.donnees.total
      : state.statut === 'erreur'
        ? t('suivi.compteErreur')
        : t('matin.compteEnAttente');

  return (
    <div className={styles.colonne}>
      <div className={styles.entete}>
        <StatusBadge status={statut} label={t(`statuts.${statut}`)} taille="compacte" />
        <div className={styles.spacer} />
        <span className={styles.compte}>{compte}</span>
      </div>

      {state.statut === 'erreur' ? (
        <>
          <EmptyState
            titre={t('suivi.erreurChargement')}
            detail={t('suivi.erreurChargementDetail')}
          />
          <button type="button" className={styles.reessayer} onClick={onReessayer}>
            {t('suivi.reessayer')}
          </button>
        </>
      ) : state.statut === 'chargement' ? (
        <EmptyState titre={t('suivi.chargement')} detail={t('suivi.chargementDetail')} />
      ) : state.donnees.total === 0 ? (
        <EmptyState titre={t('suivi.colonneVideTitre')} detail={t('suivi.colonneVideDetail')} />
      ) : (
        <>
          {state.donnees.rows.map((offer) => (
            <PipelineCard key={offer.id} offer={offer} statut={statut} onOuvrir={onOuvrirOffre} />
          ))}
          {state.donnees.total > state.donnees.rows.length ? (
            <span className={styles.autres}>
              {t('suivi.colonneAutres', state.donnees.total - state.donnees.rows.length)}
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}

interface CardProps {
  offer: OfferDashboardRow;
  statut: ColonnePipeline;
  onOuvrir: (id: string) => void;
}

/** Une carte du pipeline : titre, employeur, faits, et le seul élément
 * PROPRE à chaque colonne — la relance due (`postulee`), la date de
 * relance (`relancee`) ou d'entretien (`entretien`). */
export function PipelineCard({ offer, statut, onOuvrir }: CardProps) {
  const employeur = formatEmployeur(offer);

  return (
    <div className={styles.carte} data-offer-id={offer.id}>
      <button type="button" className={styles.titreLien} onClick={() => onOuvrir(offer.id)}>
        {offer.title === null || offer.title.trim() === '' ? (
          <Absence nature="non-publiee">{t('absences.non-publiee')}</Absence>
        ) : (
          offer.title
        )}
      </button>
      <span className={styles.employeur}>
        {employeur.connu ? (
          employeur.texte
        ) : (
          <Absence nature="non-publiee">{t('absences.non-publiee')}</Absence>
        )}
      </span>
      <div className={styles.badges}>
        {badgesDeFaits(offer).map((badge) => (
          <Badge key={badge.cle} ton={badge.ton} taille="compacte" point>
            {badge.label}
          </Badge>
        ))}
      </div>
      <StatutDuJour statut={statut} offer={offer} />
    </div>
  );
}

function StatutDuJour({ statut, offer }: { statut: ColonnePipeline; offer: OfferDashboardRow }) {
  if (statut === 'postulee') {
    const jours = joursDepuis(offer.candidature_envoyee_le);
    if (jours === null) return null;
    if (relanceDue(offer.candidature_envoyee_le)) {
      return (
        <div className={styles.relance}>
          <Badge ton="alerte" taille="compacte">
            <HorlogeIcone />
            {t('suivi.relanceDue')}
          </Badge>
          <span className={styles.depuis}>{t('matin.joursPublication', jours)}</span>
        </div>
      );
    }
    return (
      <span className={styles.depuis}>
        {jours === 0 ? t('suivi.envoyeeAujourdhui') : t('suivi.envoyeeIlYA', jours)}
      </span>
    );
  }

  if (statut === 'relancee') {
    const jours = joursDepuis(offer.candidature_relancee_le);
    if (jours === null) return null;
    return (
      <span className={styles.depuis}>
        {jours === 0 ? t('suivi.relanceeAujourdhui') : t('suivi.relanceeIlYA', jours)}
      </span>
    );
  }

  if (statut === 'entretien') {
    // L'heure prime : c'est le fait le plus actionnable de la carte, et
    // `candidature_entretien_le` la porte réellement. `formatJourHeure`
    // rend `null` sur minuit pile — cas où l'heure n'a vraisemblablement
    // pas été saisie — et l'affichage retombe alors sur la date seule
    // plutôt que d'affirmer une heure qu'il ignore.
    const jourHeure = formatJourHeure(offer.candidature_entretien_le);
    if (jourHeure !== null) {
      return <span className={styles.entretien}>{t('suivi.entretienLe', jourHeure)}</span>;
    }
    const date = formatDateLongue(offer.candidature_entretien_le);
    if (date === null) return null;
    return <span className={styles.entretien}>{t('suivi.entretienLe', date)}</span>;
  }

  return null;
}

function HorlogeIcone() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
