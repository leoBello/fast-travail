import type { StatsResult } from '../../data/types';
import { t } from '../../i18n/i18n';
import styles from './SerieCard.module.css';

const FORMATEUR_JOUR_COURT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'narrow',
  timeZone: 'Europe/Paris',
});
const FORMATEUR_JOUR_LONG = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  timeZone: 'Europe/Paris',
});

/** `streak.recentDays[i].date` est une clé `YYYY-MM-DD` (`parisDateKey` côté
 * serveur, `dashboard-query.ts`) — midi UTC pour la reformater évite tout
 * basculement de jour dû au fuseau lors du formatage (`Intl` avec
 * `timeZone: 'Europe/Paris'` ne recule jamais un midi UTC à la veille). */
function dateDepuisCle(cle: string): Date {
  const [annee, mois, jour] = cle.split('-').map(Number);
  return new Date(Date.UTC(annee, mois - 1, jour, 12));
}

interface Props {
  /** `null` tant que `/stats` n'a jamais répondu. */
  streak: StatsResult['streak'] | null;
  chargement: boolean;
}

/**
 * « Série » (`Suivi.dc.html`) : les jours consécutifs avec au moins une
 * candidature ENVOYÉE — lire des offres ne la maintient pas (task-9-brief.md).
 *
 * **Jamais confondu, chargement vs jour zéro réel** : tant que `chargement`
 * est vrai (ou `streak` encore `null`), aucun chiffre ni aucune case du
 * calendrier n'est affirmé — même défaut que `StreakIndicator`/
 * `DecidedProgress` (tâche 7) corrige déjà, reproduit ici pour ce composant,
 * distinct de ces deux-là (une carte, pas un badge de bandeau).
 */
export function SerieCard({ streak, chargement }: Props) {
  const pretes = !chargement && streak !== null;

  return (
    <div className={styles.carte} data-chargement={!pretes}>
      <span className={styles.titre}>{t('suivi.serieTitre')}</span>

      <div className={styles.grand}>
        <FlammeIcone active={pretes && streak.days > 0} />
        {pretes ? (
          <>
            <span className={styles.nombre}>{streak.days}</span>
            <span className={styles.libelle}>
              {streak.days > 0
                ? t('jourZero.serieJours', streak.days)
                : t('jourZero.serieNonCommencee')}
            </span>
          </>
        ) : (
          <span className={styles.attente}>{t('suivi.chargement')}</span>
        )}
      </div>

      {pretes ? (
        <div className={styles.grille}>
          {streak.recentDays.map((jour) => {
            const date = dateDepuisCle(jour.date);
            return (
              <div key={jour.date} className={styles.case}>
                <span
                  className={jour.sent ? styles.caseRemplie : styles.caseVide}
                  role="img"
                  aria-label={
                    jour.sent
                      ? t('suivi.serieJourEnvoyee', FORMATEUR_JOUR_LONG.format(date))
                      : t('suivi.serieJourVide', FORMATEUR_JOUR_LONG.format(date))
                  }
                />
                <span className={styles.lettre} aria-hidden="true">
                  {FORMATEUR_JOUR_COURT.format(date)}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      <p className={styles.note}>{t('suivi.serieNote')}</p>
    </div>
  );
}

function FlammeIcone({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={active ? styles.flammeActive : styles.flammeInactive}
    >
      <path d="M12 2c1.5 4 5 5.5 5 9.5a5 5 0 0 1-10 0C7 8.5 9 7 9.5 5.5 10.5 7 11 8 12 8c0-2-1-4 0-6z" />
    </svg>
  );
}
