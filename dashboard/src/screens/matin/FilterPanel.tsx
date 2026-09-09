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

interface GroupeRadioProps<V extends string> {
  nom: string;
  valeurs: readonly V[];
  selection: V | undefined;
  onChange: (valeur: V | undefined) => void;
  libelle: (valeur: V) => string;
  /** Le compte à afficher pour chaque valeur — absent si cette dimension
   * n'est pas chiffrée (seul `work_mode` l'est, GUIDELINES §3.2). */
  compte?: (valeur: V) => string | number;
  classeLigne?: (valeur: V) => string;
}

/**
 * Un groupe de boutons radio EXCLUSIFS, avec la possibilité de revenir à
 * "aucune sélection" — ce que `<input type="radio">` natif ne permet pas
 * (cliquer un radio déjà coché ne le décoche jamais, aucun `onChange` ne se
 * déclenche). `onClick` se déclenche, lui, à CHAQUE clic y compris sur une
 * option déjà cochée : c'est lui qui porte la logique de désélection,
 * `onChange` ne portant que la sélection d'une valeur différente.
 *
 * Remplace les cases à cocher de la version précédente (revue de tâche 7) :
 * une case à cocher signifie "sélection indépendante" pour un lecteur
 * d'écran comme pour l'œil, alors que l'API (`GET /offers`) ne retient
 * qu'UNE valeur par dimension — cocher une case en décochait une autre,
 * silencieusement. `type="radio"` rend ce comportement honnête.
 */
function GroupeRadio<V extends string>({
  nom,
  valeurs,
  selection,
  onChange,
  libelle,
  compte,
  classeLigne,
}: GroupeRadioProps<V>) {
  return (
    <>
      {valeurs.map((valeur) => (
        <label key={valeur} className={classeLigne?.(valeur) ?? styles.ligne}>
          <input
            type="radio"
            name={nom}
            value={valeur}
            checked={selection === valeur}
            onChange={() => onChange(valeur)}
            onClick={() => {
              if (selection === valeur) onChange(undefined);
            }}
          />
          <span className={styles.libelle}>{libelle(valeur)}</span>
          {compte === undefined ? null : <span className={styles.compte}>{compte(valeur)}</span>}
        </label>
      ))}
    </>
  );
}

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
 *
 * Chaque dimension exclusive vit dans un `<fieldset>` : le titre de section
 * (`<legend>`) est alors relié PROGRAMMATIQUEMENT à ses champs, pas
 * seulement visuellement — un lecteur d'écran annonce « Mode de travail,
 * Full remote, case à cocher » plutôt que « Full remote » nu.
 */
export function FilterPanel({ valeurs, onChange, comptesModeTravail }: Props) {
  return (
    <div className={styles.panneau} role="group" aria-label={t('matin.filtres')}>
      <fieldset className={styles.fieldset}>
        <legend className={styles.titreSection}>{t('matin.filtreModeTravail')}</legend>
        <GroupeRadio
          nom="workMode"
          valeurs={TOUS_WORK_MODES}
          selection={valeurs.workMode}
          onChange={(workMode) => onChange({ ...valeurs, workMode })}
          libelle={(v) =>
            v === WORK_MODE_UNSPECIFIED ? t('teletravail.nonPrecise') : t(`teletravail.${v}`)
          }
          compte={(v) =>
            comptesModeTravail === null ? t('matin.compteEnAttente') : comptesModeTravail[v]
          }
          classeLigne={(v) => (v === WORK_MODE_UNSPECIFIED ? styles.ligneNonPrecise : styles.ligne)}
        />
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.titreSection}>{t('matin.filtreEngagement')}</legend>
        <GroupeRadio
          nom="engagement"
          valeurs={ENGAGEMENTS}
          selection={valeurs.engagement}
          onChange={(engagement) => onChange({ ...valeurs, engagement })}
          libelle={(v) => t(`engagement.${v}`)}
        />
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.titreSection}>{t('matin.filtreSource')}</legend>
        <GroupeRadio
          nom="source"
          valeurs={SOURCES}
          selection={valeurs.source}
          onChange={(source) => onChange({ ...valeurs, source })}
          libelle={(v) => t(`sources.${v}`)}
        />
      </fieldset>

      <fieldset className={styles.fieldset}>
        {/* Seul booléen indépendant du panneau — reste une vraie case à
            cocher, pas un radio : cocher "IA / agents" ne retire ni ne
            remplace aucune autre sélection. */}
        <label className={styles.ligne}>
          <input
            type="checkbox"
            checked={valeurs.agenticAi === true}
            onChange={() =>
              onChange({ ...valeurs, agenticAi: valeurs.agenticAi === true ? undefined : true })
            }
          />
          <span className={styles.libelle}>{t('matin.filtreAgentique')}</span>
        </label>
      </fieldset>

      <button type="button" className={styles.reinitialiser} onClick={() => onChange({})}>
        {t('matin.reinitialiserFiltres')}
      </button>
    </div>
  );
}
