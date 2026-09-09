import type { ReactNode } from 'react';
import { Absence } from '../../ui/kit/Absence';
import { Badge } from '../../ui/kit/Badge';
import { Tooltip } from '../../ui/kit/Tooltip';
import { badgeSeniorite, formatCompensation } from '../../data/format';
import type { OfferDashboardRow } from '../../data/types';
import { t } from '../../i18n/i18n';
import styles from './ExtractionSection.module.css';

interface Props {
  offer: OfferDashboardRow;
}

/**
 * « Ce que l'annonce dit » (`Detail.dc.html`) : la grille de faits extraits,
 * puis la stack détectée.
 *
 * **Écart connu avec la maquette, documenté plutôt que fabriqué** (voir le
 * rapport de tâche 8) : la maquette distingue en vert les technologies
 * présentes au CV. `api-dashboard` (tâche 6) n'expose `profile_skills` sur
 * AUCUNE route — la seule lecture de cette table est
 * `supabase/functions/_shared/run-scoring.ts`, côté Edge Function. Sans
 * cette donnée, colorer une techno « comme si » elle correspondait au CV
 * serait inventer un fait, ce que `GUIDELINES.md` interdit explicitement.
 * La stack s'affiche donc en badges neutres, tous identiques, jusqu'à ce
 * qu'une route l'expose.
 */
export function ExtractionSection({ offer }: Props) {
  const compensation = formatCompensation(offer);
  const seniorite = badgeSeniorite(offer.seniority);
  const stack = offer.extraction.stack;
  const unwanted = offer.extraction.unwanted_tech;

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
          {offer.agentic_ai ? t('iaAgents.badge') : t('detail.non')}
        </Fait>
        <Fait libelle={t('detail.champTechnosNonDesirees')}>
          {unwanted.length === 0 ? t('detail.aucune') : unwanted.join(', ')}
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
                <span key={techno} className={styles.tech}>
                  {techno}
                </span>
              ))}
            </div>
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
