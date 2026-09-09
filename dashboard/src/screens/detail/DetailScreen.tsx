import { useState } from 'react';
import type { DashboardClient } from '../../data/client';
import type { ApplicationOutcome, ApplicationStatus } from '../../data/types';
import {
  badgeConfiance,
  badgeSeniorite,
  badgesDeFaits,
  badgeTexteCoupe,
  formatEmployeur,
  formatLieu,
  formatPublication,
} from '../../data/format';
import { Absence } from '../../ui/kit/Absence';
import { Badge } from '../../ui/kit/Badge';
import { EmptyState } from '../../ui/kit/EmptyState';
import { t } from '../../i18n/i18n';
import { useConfig } from '../matin/hooks';
import { ExtractionSection } from './ExtractionSection';
import { RankSection } from './RankSection';
import { SuiviSection } from './SuiviSection';
import { TwoSourcesPanel } from './TwoSourcesPanel';
import { useOfferDetail } from './hooks';
import styles from './DetailScreen.module.css';

interface Props {
  client: DashboardClient;
  offerId: string;
  onRetour: () => void;
}

/**
 * Le détail d'une offre (`Detail.dc.html`, tâche 8) : la SEULE couche de cet
 * écran qui appelle le réseau — `RankSection`, `TwoSourcesPanel`,
 * `ExtractionSection`, `SuiviSection` restent des composants présentés,
 * même principe que `MatinScreen` (tâche 7).
 *
 * **Trois états, jamais confondus** (la leçon de la tâche 7, deux fois
 * reprise en revue) : `chargement`, `erreur`, et `succès` avec `donnees ===
 * null` (l'offre n'existe pas/plus — un 404 n'est PAS une panne). Les quatre
 * sections ne sont montées que dans la branche `succès` avec des données non
 * nulles : aucun sous-composant ne peut donc recevoir un nombre avant que le
 * réseau ait répondu, puisqu'aucun n'est même monté avant ce moment — plus
 * fort que la garde par prop de `MatinScreen`, mais possible ici parce que
 * TOUT le détail vient d'un seul appel (`GET /offers/:id`), sans second appel
 * indépendant comme `/stats` côté écran du matin.
 */
export function DetailScreen({ client, offerId, onRetour }: Props) {
  const [detailState, recharger] = useOfferDetail(client, offerId);
  const [enTraitement, setEnTraitement] = useState(false);
  const [erreurAction, setErreurAction] = useState(false);

  // Appel réseau INDÉPENDANT de `useOfferDetail` (même principe que
  // `MatinScreen`, où `/stats` et `/brief` sont deux appels séparés) : le
  // plancher de salaire et les compétences du CV (tâche 10, `GET /config`)
  // n'ont pas besoin d'attendre — ni de bloquer — le détail de l'offre.
  const [configState] = useConfig(client);
  const salaireFloor =
    configState.statut === 'succes'
      ? (configState.donnees.scoringWeights.salaire_floor ?? null)
      : null;
  const cvSkills = configState.statut === 'succes' ? configState.donnees.cvSkills : null;

  const applicationConnue =
    detailState.statut === 'succes' && detailState.donnees !== null
      ? detailState.donnees.application
      : null;

  async function executerAction(action: () => Promise<unknown>) {
    setErreurAction(false);
    setEnTraitement(true);
    try {
      await action();
      recharger();
    } catch {
      setErreurAction(true);
    } finally {
      setEnTraitement(false);
    }
  }

  function avancer(status: ApplicationStatus, appliedAt?: string) {
    void executerAction(async () => {
      if (applicationConnue === null) await client.openOffer(offerId);
      await client.patchApplication(
        offerId,
        appliedAt === undefined ? { status } : { status, appliedAt },
      );
    });
  }

  function ecarter() {
    void executerAction(async () => {
      if (applicationConnue === null) await client.openOffer(offerId);
      await client.patchApplication(offerId, { status: 'ecartee' });
    });
  }

  function definirIssue(outcome: ApplicationOutcome) {
    void executerAction(() => client.patchApplication(offerId, { outcome }));
  }

  if (detailState.statut === 'erreur') {
    return (
      <div className={styles.ecran}>
        <Entete onRetour={onRetour} />
        <EmptyState
          titre={t('detail.erreurChargement')}
          detail={t('detail.erreurChargementDetail')}
        />
        <button type="button" className={styles.bouton} onClick={recharger}>
          {t('detail.reessayer')}
        </button>
      </div>
    );
  }

  if (detailState.statut === 'chargement') {
    return (
      <div className={styles.ecran}>
        <Entete onRetour={onRetour} />
        <EmptyState titre={t('detail.chargement')} detail={t('detail.chargementDetail')} />
      </div>
    );
  }

  if (detailState.donnees === null) {
    return (
      <div className={styles.ecran}>
        <Entete onRetour={onRetour} />
        <EmptyState titre={t('detail.introuvableTitre')} detail={t('detail.introuvableDetail')} />
      </div>
    );
  }

  const { offer, groupJudgements, application } = detailState.donnees;
  const employeur = formatEmployeur(offer);
  const lieu = formatLieu(offer);
  const publication = formatPublication(offer.published_at);
  const seniorite = badgeSeniorite(offer.seniority);
  // Remontes au niveau du detail, pas seulement dans `TwoSourcesPanel` (monte
  // uniquement si `group_size > 1`) : sur le perimetre mesure, 501 des 1 245
  // lignes affichees sont tronquees SANS second jugement, et n'auraient donc
  // jamais montre ce signal (constat I2, revue finale de branche phase 3).
  const confiance = badgeConfiance(offer);
  const texteCoupe = badgeTexteCoupe(offer);

  return (
    <div className={styles.ecran}>
      <Entete onRetour={onRetour} />

      <div className={styles.header}>
        <div className={styles.headerTexte}>
          <h1 className={styles.titre}>
            {offer.title === null || offer.title.trim() === '' ? (
              <Absence nature="non-publiee">{t('absences.non-publiee')}</Absence>
            ) : (
              offer.title
            )}
          </h1>
          <div className={styles.sousTitre}>
            <span className={styles.employeur}>
              {employeur.connu ? (
                employeur.texte
              ) : (
                <Absence nature="non-publiee">{t('absences.non-publiee')}</Absence>
              )}
            </span>
            <span className={styles.point} aria-hidden="true" />
            <span>
              {lieu.connu ? (
                lieu.texte
              ) : (
                <Absence nature="non-precisee">{t('absences.non-precisee')}</Absence>
              )}
            </span>
            <span className={styles.point} aria-hidden="true" />
            <span>
              {publication.connu ? (
                publication.texte
              ) : (
                <Absence nature="non-publiee">{t('absences.non-publiee')}</Absence>
              )}
            </span>
          </div>
        </div>

        {offer.url === null ? (
          <button type="button" className={styles.boutonPrimaire} disabled>
            <SortieIcone />
            {t('detail.voirAnnonce')}
          </button>
        ) : (
          <a
            className={styles.boutonPrimaire}
            href={offer.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <SortieIcone />
            {t('detail.voirAnnonce')}
          </a>
        )}
      </div>

      <div className={styles.badges}>
        {badgesDeFaits(offer).map((badge) => (
          <Badge key={badge.cle} ton={badge.ton} point>
            {badge.label}
          </Badge>
        ))}
        <Badge ton={seniorite.ton} point>
          {seniorite.label}
        </Badge>
        <Badge ton={confiance.ton} point>
          {confiance.label}
        </Badge>
        {texteCoupe === null ? null : (
          <Badge ton={texteCoupe.ton} discontinu>
            {texteCoupe.label}
          </Badge>
        )}
      </div>

      <RankSection offer={offer} />

      {offer.group_size > 1 ? (
        <TwoSourcesPanel
          offerId={offer.id}
          judgements={groupJudgements}
          salaireFloor={salaireFloor}
        />
      ) : null}

      <ExtractionSection offer={offer} salaireFloor={salaireFloor} cvSkills={cvSkills} />

      <SuiviSection
        application={application}
        enTraitement={enTraitement}
        erreur={erreurAction}
        onAvancer={avancer}
        onEcarter={ecarter}
        onDefinirIssue={definirIssue}
      />

      <ProvenanceSection labels={offer.found_by_labels} trustedQuery={offer.trusted_query} />
    </div>
  );
}

/**
 * « Trouvée par » (`Detail.dc.html`) : les étiquettes des requêtes qui ont
 * ramené cette offre, et si l'une d'elles est `anchored` (tâche 10,
 * `offers_ranked.found_by_labels`/`trusted_query`). Ne rend rien s'il n'y a
 * ni étiquette ni requête de confiance : une section vide n'aurait rien à
 * montrer — mieux vaut l'omettre que l'afficher creuse.
 */
function ProvenanceSection({ labels, trustedQuery }: { labels: string[]; trustedQuery: boolean }) {
  if (labels.length === 0 && !trustedQuery) return null;
  return (
    <div className={styles.provenance}>
      <span className={styles.provenanceTitre}>{t('detail.trouveePar')}</span>
      {labels.map((label) => (
        <Badge key={label} ton="neutre" taille="compacte" discontinu>
          {label}
        </Badge>
      ))}
      {trustedQuery ? (
        <Badge ton="accent" taille="compacte">
          {t('detail.requeteConfiance')}
        </Badge>
      ) : null}
    </div>
  );
}

function Entete({ onRetour }: { onRetour: () => void }) {
  return (
    <button type="button" className={styles.retour} onClick={onRetour}>
      <FlecheIcone />
      {t('detail.retour')}
    </button>
  );
}

/** L'icône « sortie de l'application » — même tracé que `OfferCard.LienIcone`
 * (tâche 7) : le lien vers l'annonce d'origine la porte toujours (GUIDELINES
 * §1). Redessinée ici plutôt qu'importée : ni le kit ni un module d'icônes
 * partagé n'existent pour ces tracés — `OfferCard` définit déjà la sienne
 * localement, ce fichier suit le même motif établi. */
function SortieIcone() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

function FlecheIcone() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}
