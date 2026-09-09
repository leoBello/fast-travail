import { Absence } from '../../ui/kit/Absence';
import { Badge } from '../../ui/kit/Badge';
import { Tooltip } from '../../ui/kit/Tooltip';
import { badgeConfiance, badgeTexteCoupe, formatCompensationValeurs } from '../../data/format';
import type { OfferScoredRow } from '../../data/types';
import { t } from '../../i18n/i18n';
import styles from './TwoSourcesPanel.module.css';

interface Props {
  /** `offer.id` — l'id de la ligne ÉLUE par `offers_dashboard`, qui sert à
   * identifier le jugement retenu dans `judgements` (voir plus bas). */
  offerId: string;
  /** Un jugement par source du groupe, `offerId` compris. */
  judgements: OfferScoredRow[];
}

/**
 * « Vue sur deux sources » (`Detail.dc.html`) : la pièce maîtresse de cet
 * écran. Une même mission peut être jugée deux fois — le classement retient
 * le jugement le MIEUX INFORMÉ (confiance, puis longueur de texte), jamais
 * le mieux noté (GUIDELINES §3.5). Ce panneau montre les deux côte à côte,
 * pour que ce choix reste vérifiable à l'œil plutôt qu'une décision opaque.
 *
 * `null` tant que `judgements.length < 2` : rien à comparer, et un groupe de
 * taille 1 ne doit rien afficher ici (l'appelant peut aussi choisir de ne
 * pas monter ce composant sur `group_size === 1` — la garde est posée aux
 * deux endroits, l'un n'excusant pas l'autre).
 *
 * Le jugement RETENU est identifié par `id === offerId`, jamais par
 * position dans le tableau : `groupJudgements` (tâche 6, `dashboard-query.ts`)
 * trie par confiance puis `final_score`, un ordre proche mais pas
 * rigoureusement identique à celui, plus complet, qui élit `offer.id` dans
 * `offers_dashboard` (qui départage aussi par longueur de description avant
 * le score) — s'appuyer sur `offerId` reste correct même si les deux ordres
 * divergeaient un jour.
 */
export function TwoSourcesPanel({ offerId, judgements }: Props) {
  if (judgements.length < 2) return null;

  const retenu = judgements.find((j) => j.id === offerId) ?? judgements[0];
  const masques = judgements.filter((j) => j.id !== retenu.id);

  const uniteDivergente = masques.some(
    (j) =>
      retenu.compensation_kind !== null &&
      j.compensation_kind !== null &&
      j.compensation_kind !== retenu.compensation_kind,
  );

  return (
    <section className={styles.section}>
      <div className={styles.entete}>
        <span className={styles.titre}>{t('detail.deuxSources')}</span>
        <Badge ton="neutre" taille="compacte" discontinu>
          {t('detail.nAnnonces', judgements.length)}
        </Badge>
      </div>
      <p className={styles.explication}>{t('detail.deuxSourcesExplication')}</p>

      <div className={styles.grille}>
        <JudgementCard judgement={retenu} retenu />
        {masques.map((judgement) => (
          <JudgementCard key={judgement.id} judgement={judgement} retenu={false} />
        ))}
      </div>

      {uniteDivergente ? <p className={styles.note}>{t('detail.uniteTrancheeNote')}</p> : null}
    </section>
  );
}

function JudgementCard({ judgement, retenu }: { judgement: OfferScoredRow; retenu: boolean }) {
  const compensation = formatCompensationValeurs(
    judgement.compensation_kind,
    judgement.compensation_min,
    judgement.compensation_max,
  );
  const confiance = badgeConfiance(judgement);
  const texteCoupe = badgeTexteCoupe(judgement);

  return (
    <div
      className={styles.carte}
      data-retenu={retenu ? 'true' : 'false'}
      data-offer-id={judgement.id}
    >
      <div className={styles.carteEntete}>
        {retenu ? (
          <Badge ton="succes" taille="compacte" point>
            {t('detail.retenu')}
          </Badge>
        ) : (
          <Badge ton="neutre" taille="compacte" discontinu>
            {t('detail.masque')}
          </Badge>
        )}
        <span className={styles.source}>{t(`sources.${judgement.source}`)}</span>
        <div className={styles.spacer} />
        <span className={retenu ? styles.score : styles.scoreMasque}>{judgement.final_score}</span>
      </div>

      <div className={styles.badges}>
        <Badge ton={confiance.ton} taille="compacte" point>
          {confiance.label}
        </Badge>
        {texteCoupe === null ? (
          <Badge ton="neutre" taille="compacte" discontinu>
            {t('detail.texteIntegral')}
          </Badge>
        ) : (
          <Badge ton={texteCoupe.ton} taille="compacte" discontinu>
            {texteCoupe.label}
          </Badge>
        )}
      </div>

      <p className={styles.verdict}>{judgement.verdict}</p>

      {compensation.kind === 'connu' ? (
        <span className={styles.remuneration}>{compensation.texte}</span>
      ) : compensation.kind === 'incertain' ? (
        <Tooltip
          intitule={t('matin.uniteIncertaineBadge')}
          contenu={t('matin.uniteIncertaineInfobulle')}
        >
          <span>
            <Badge ton="alerte" taille="compacte" discontinu>
              <span className={styles.montantBarre}>{compensation.texte}</span>
            </Badge>
          </span>
        </Tooltip>
      ) : (
        <Absence nature="salaire-non-publie">{t('absences.salaire-non-publie')}</Absence>
      )}
    </div>
  );
}
