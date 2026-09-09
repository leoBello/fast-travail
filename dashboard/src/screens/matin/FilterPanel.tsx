import { ENGAGEMENTS, SOURCES, WORK_MODES, WORK_MODE_UNSPECIFIED } from '../../data/types';
import type { Engagement, Source, WorkModeFilter } from '../../data/types';
import type { WorkModeCounts } from './hooks';
import { t } from '../../i18n/i18n';
import styles from './FilterPanel.module.css';

export interface FilterState {
  workMode?: WorkModeFilter;
  engagement?: Engagement;
  source?: Source;
  agenticAi?: boolean;
}

interface Props {
  valeurs: FilterState;
  onChange: (valeurs: FilterState) => void;
  /** `null` tant que les comptes n'ont pas encore été chargés — chaque ligne
   * affiche alors un compte à blanc plutôt qu'un zéro trompeur. */
  comptesModeTravail: WorkModeCounts | null;
}

const TOUS_WORK_MODES: WorkModeFilter[] = [...WORK_MODES, WORK_MODE_UNSPECIFIED];

/**
 * Le panneau de filtres (`Etats.dc.html`, « Filtres — aucun coché au
 * démarrage »).
 *
 * **Aucun filtre par `domain`** (960 valeurs distinctes sur 1 269 lignes,
 * texte libre — task-7-brief.md) : ce panneau ne facette que les quatre
 * dimensions que l'API borne à un vocabulaire fermé.
 *
 * `work_mode` est le seul filtre exclusif dont la ligne « non précisé » est
 * chiffrée : GUIDELINES §3.2, 863 offres (68 % du corpus) n'ont aucun mode de
 * travail connu — la cocher masquerait silencieusement les deux tiers du
 * corpus sans le dire. Les autres dimensions (engagement, source) sont aussi
 * des choix exclusifs (l'API ne filtre que sur UNE valeur à la fois), mais
 * sans ce piège documenté : rien n'impose de compter leur cas nul.
 */
export function FilterPanel({ valeurs, onChange, comptesModeTravail }: Props) {
  function toggleWorkMode(valeur: WorkModeFilter) {
    onChange({ ...valeurs, workMode: valeurs.workMode === valeur ? undefined : valeur });
  }
  function toggleEngagement(valeur: Engagement) {
    onChange({ ...valeurs, engagement: valeurs.engagement === valeur ? undefined : valeur });
  }
  function toggleSource(valeur: Source) {
    onChange({ ...valeurs, source: valeurs.source === valeur ? undefined : valeur });
  }
  function toggleAgentique() {
    onChange({ ...valeurs, agenticAi: valeurs.agenticAi === true ? undefined : true });
  }

  return (
    <div className={styles.panneau} role="group" aria-label={t('matin.filtres')}>
      <section>
        <h3 className={styles.titreSection}>{t('matin.filtreModeTravail')}</h3>
        {TOUS_WORK_MODES.map((valeur) => (
          <label
            key={valeur}
            className={valeur === WORK_MODE_UNSPECIFIED ? styles.ligneNonPrecise : styles.ligne}
          >
            <input
              type="checkbox"
              checked={valeurs.workMode === valeur}
              onChange={() => toggleWorkMode(valeur)}
            />
            <span className={styles.libelle}>
              {valeur === WORK_MODE_UNSPECIFIED
                ? t('teletravail.nonPrecise')
                : t(`teletravail.${valeur}`)}
            </span>
            <span className={styles.compte}>
              {comptesModeTravail === null
                ? t('matin.compteEnAttente')
                : comptesModeTravail[valeur]}
            </span>
          </label>
        ))}
      </section>

      <section>
        <h3 className={styles.titreSection}>{t('matin.filtreEngagement')}</h3>
        {ENGAGEMENTS.map((valeur) => (
          <label key={valeur} className={styles.ligne}>
            <input
              type="checkbox"
              checked={valeurs.engagement === valeur}
              onChange={() => toggleEngagement(valeur)}
            />
            <span className={styles.libelle}>{t(`engagement.${valeur}`)}</span>
          </label>
        ))}
      </section>

      <section>
        <h3 className={styles.titreSection}>{t('matin.filtreSource')}</h3>
        {SOURCES.map((valeur) => (
          <label key={valeur} className={styles.ligne}>
            <input
              type="checkbox"
              checked={valeurs.source === valeur}
              onChange={() => toggleSource(valeur)}
            />
            <span className={styles.libelle}>{t(`sources.${valeur}`)}</span>
          </label>
        ))}
      </section>

      <section>
        <label className={styles.ligne}>
          <input type="checkbox" checked={valeurs.agenticAi === true} onChange={toggleAgentique} />
          <span className={styles.libelle}>{t('matin.filtreAgentique')}</span>
        </label>
      </section>

      <button type="button" className={styles.reinitialiser} onClick={() => onChange({})}>
        {t('matin.reinitialiserFiltres')}
      </button>
    </div>
  );
}
