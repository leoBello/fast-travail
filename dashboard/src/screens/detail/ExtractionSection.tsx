import type { ReactNode } from 'react';
import { Absence } from '../../ui/kit/Absence';
import { Badge } from '../../ui/kit/Badge';
import { Tooltip } from '../../ui/kit/Tooltip';
import { badgeSeniorite, estTechnoDuCv, formatCompensation } from '../../data/format';
import type { OfferDashboardRow } from '../../data/types';
import { t } from '../../i18n/i18n';
import styles from './ExtractionSection.module.css';

interface Props {
  offer: OfferDashboardRow;
  /** Le plancher `scoring_weights.salaire_floor` (tâche 10, `GET /config`) —
   * `null` tant qu'il n'a pas été lu, voir `data/format.ts`. */
  salaireFloor: number | null;
  /** Les termes de `profile_skills` (tâche 10, `GET /config`) — `null` tant
   * qu'ils n'ont pas été lus. Comble l'écart documenté au rapport de tâche 8
   * (« api-dashboard n'exposait alors AUCUNE route pour cette table ») : la
   * stack colore désormais en vert les technos présentes dans le CV,
   * comme la maquette le dessine. */
  cvSkills: readonly string[] | null;
}

/**
 * « Ce que l'annonce dit » (`Detail.dc.html`) : la grille de faits extraits,
 * puis la stack détectée — en vert, les technologies présentes dans le CV
 * (`profile_skills`, tâche 10), en badge neutre les autres.
 */
export function ExtractionSection({ offer, salaireFloor, cvSkills }: Props) {
  const compensation = formatCompensation(offer, salaireFloor);
  const seniorite = badgeSeniorite(offer.seniority);
  const stack = offer.extraction.stack;
  const unwanted = offer.extraction.unwanted_tech;
  const techsDuCv = stack.filter((techno) => estTechnoDuCv(cvSkills, techno));

  return (
    <section className={styles.section}>
      <span className={styles.titre}>{t('detail.ceQueLAnnonceDit')}</span>

      <div className={styles.grille}>
        <Fait libelle={t('detail.champEngagement')}>
          {offer.engagement === null ? (
            <Absence nature="non-precisee">{t('absences.non-precisee')}</Absence>
          ) : (
            t(`engagement.${offer.engagement}`)
          )}
        </Fait>
        <Fait libelle={t('detail.champModeTravail')}>
          {offer.work_mode === null ? (
            <Absence nature="non-precisee">{t('absences.non-precisee')}</Absence>
          ) : (
            t(`teletravail.${offer.work_mode}`)
          )}
        </Fait>
        <Fait libelle={t('detail.champSeniorite')}>
          {offer.seniority === null ? (
            <Absence nature="non-precisee">{t('absences.non-precisee')}</Absence>
          ) : (
            seniorite.label
          )}
        </Fait>
        <Fait libelle={t('detail.champDuree')}>
          {offer.duration_months === null ? (
            <Absence nature="non-precisee">{t('absences.non-precisee')}</Absence>
          ) : (
            t('detail.dureeMois', offer.duration_months)
          )}
        </Fait>
        <Fait libelle={t('detail.champRemuneration')}>
          {compensation.kind === 'connu' ? (
            compensation.texte
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
          ) : compensation.kind === 'attente' ? (
            // Le plancher n'est pas encore lu (GET /config) : ni « connu »
            // ni « incertain » ne peuvent être affirmés — voir data/format.ts.
            <Badge ton="neutre" taille="compacte" discontinu>
              {compensation.texte}
            </Badge>
          ) : (
            <Absence nature="salaire-non-publie">{t('absences.salaire-non-publie')}</Absence>
          )}
        </Fait>
        <Fait libelle={t('detail.champDomaine')}>
          {offer.domain === null ? (
            <Absence nature="non-precisee">{t('absences.non-precisee')}</Absence>
          ) : (
            offer.domain
          )}
        </Fait>
        <Fait libelle={t('detail.champIaAgents')}>
          {offer.agentic_ai ? (
            t('iaAgents.badge')
          ) : offer.truncated_input ? (
            // Meme garde que le bloc `stack` plus bas : un texte tronque a
            // 500 caracteres (Adzuna) ne permet pas d'affirmer « Non », faute
            // d'avoir pu lire l'annonce en entier (constat I2, revue finale
            // de branche phase 3).
            <Absence nature="texte-coupe">{t('absences.texte-coupe')}</Absence>
          ) : (
            t('detail.non')
          )}
        </Fait>
        <Fait libelle={t('detail.champTechnosNonDesirees')}>
          {unwanted.length > 0 ? (
            unwanted.join(', ')
          ) : offer.truncated_input ? (
            <Absence nature="texte-coupe">{t('absences.texte-coupe')}</Absence>
          ) : (
            t('detail.aucune')
          )}
        </Fait>
      </div>

      <div className={styles.stackBloc}>
        {stack.length === 0 ? (
          offer.truncated_input ? (
            <Absence nature="texte-coupe">{t('absences.texte-coupe')}</Absence>
          ) : (
            <Absence nature="aucune-techno">{t('absences.aucune-techno')}</Absence>
          )
        ) : (
          <>
            <span className={styles.stackTitre}>{t('detail.stackDetectee', stack.length)}</span>
            <div className={styles.stackListe}>
              {stack.map((techno) => (
                <span
                  key={techno}
                  className={
                    estTechnoDuCv(cvSkills, techno)
                      ? `${styles.tech} ${styles.techCv}`
                      : styles.tech
                  }
                >
                  {techno}
                </span>
              ))}
            </div>
            {cvSkills === null ? null : (
              <p className={styles.stackNote}>{t('detail.stackTechnosCv', techsDuCv.length)}</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Fait({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <div className={styles.fait}>
      <span className={styles.faitCle}>{libelle}</span>
      <span className={styles.faitValeur}>{children}</span>
    </div>
  );
}
