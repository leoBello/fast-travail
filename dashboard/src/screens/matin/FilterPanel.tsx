import { ENGAGEMENTS, SOURCES, WORK_MODES, WORK_MODE_UNSPECIFIED } from '../../data/types';
import type { Engagement, Source, WorkModeCounts, WorkModeFilter } from '../../data/types';
import { t } from '../../i18n/i18n';
import styles from './FilterPanel.module.css';

/** Chaque dimension accepte plusieurs valeurs, composées en `OU` par le
 * serveur (tâche 10) — `undefined` : aucune sélection, ce dashboard ne
 * construit jamais de tableau vide. */
export interface FilterState {
  workMode?: WorkModeFilter[];
  engagement?: Engagement[];
  source?: Source[];
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

interface GroupeCaseProps<V extends string> {
  nom: string;
  valeurs: readonly V[];
  selection: readonly V[] | undefined;
  onChange: (valeurs: V[]) => void;
  libelle: (valeur: V) => string;
  /** Le compte à afficher pour chaque valeur — absent si cette dimension
   * n'est pas chiffrée (seul `work_mode` l'est, GUIDELINES §3.2). */
  compte?: (valeur: V) => string | number;
  classeLigne?: (valeur: V) => string;
}

/**
 * Un groupe de cases à cocher INDÉPENDANTES, une par valeur possible d'une
 * dimension — plusieurs valeurs composées en `OU` côté serveur (tâche 10).
 *
 * **Remplace les boutons radio de la tâche 7** : ceux-ci n'étaient qu'un
 * pis-aller honnête devant une API qui ne retenait qu'UNE valeur par
 * dimension — cocher une case en aurait silencieusement décoché une autre.
 * `GET /offers` compose désormais un `OU` sur plusieurs valeurs, et c'est ce
 * qui rend possible « full remote OU non précisé », la requête réellement
 * utile (`work_mode` nul sur 863 offres, 68 % du corpus — GUIDELINES §3.2).
 */
function GroupeCase<V extends string>({
  nom,
  valeurs,
  selection,
  onChange,
  libelle,
  compte,
  classeLigne,
}: GroupeCaseProps<V>) {
  const selectionnees = new Set(selection ?? []);
  return (
    <>
      {valeurs.map((valeur) => (
        <label key={valeur} className={classeLigne?.(valeur) ?? styles.ligne}>
          <input
            type="checkbox"
            name={nom}
            value={valeur}
            checked={selectionnees.has(valeur)}
            onChange={() => {
              const suivant = new Set(selectionnees);
              if (suivant.has(valeur)) suivant.delete(valeur);
              else suivant.add(valeur);
              onChange([...suivant]);
            }}
          />
          <span className={styles.libelle}>{libelle(valeur)}</span>
          {compte === undefined ? null : <span className={styles.compte}>{compte(valeur)}</span>}
        </label>
      ))}
    </>
  );
}

/** Un tableau vide vaut `undefined` (aucune restriction) : ce dashboard ne
 * construit jamais de tableau vide dans l'état de filtre. */
function versFiltre<V>(valeurs: V[]): V[] | undefined {
  return valeurs.length === 0 ? undefined : valeurs;
}

/**
 * Le panneau de filtres (`Etats.dc.html`, « Filtres — aucun coché au
 * démarrage »).
 *
 * **Aucun filtre par `domain`** (960 valeurs distinctes sur 1 269 lignes,
 * texte libre — task-7-brief.md) : ce panneau ne facette que les quatre
 * dimensions que l'API borne à un vocabulaire fermé.
 *
 * `work_mode` est le seul filtre dont la ligne « non précisé » est chiffrée :
 * GUIDELINES §3.2, 863 offres (68 % du corpus) n'ont aucun mode de travail
 * connu — la cocher masquerait silencieusement les deux tiers du corpus sans
 * le dire. C'est aussi la case qui rend « full remote OU non précisé »
 * possible : cocher les deux compose un `OU` côté serveur (tâche 10),
 * jamais un `ET` qui ne rendrait plus rien.
 *
 * Chaque dimension vit dans un `<fieldset>` : le titre de section
 * (`<legend>`) est alors relié PROGRAMMATIQUEMENT à ses champs, pas
 * seulement visuellement — un lecteur d'écran annonce « Mode de travail,
 * Full remote, case à cocher » plutôt que « Full remote » nu.
 */
export function FilterPanel({ valeurs, onChange, comptesModeTravail }: Props) {
  return (
    <div className={styles.panneau} role="group" aria-label={t('matin.filtres')}>
      <fieldset className={styles.fieldset}>
        <legend className={styles.titreSection}>{t('matin.filtreModeTravail')}</legend>
        <GroupeCase
          nom="workMode"
          valeurs={TOUS_WORK_MODES}
          selection={valeurs.workMode}
          onChange={(workMode) => onChange({ ...valeurs, workMode: versFiltre(workMode) })}
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
        <GroupeCase
          nom="engagement"
          valeurs={ENGAGEMENTS}
          selection={valeurs.engagement}
          onChange={(engagement) => onChange({ ...valeurs, engagement: versFiltre(engagement) })}
          libelle={(v) => t(`engagement.${v}`)}
        />
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.titreSection}>{t('matin.filtreSource')}</legend>
        <GroupeCase
          nom="source"
          valeurs={SOURCES}
          selection={valeurs.source}
          onChange={(source) => onChange({ ...valeurs, source: versFiltre(source) })}
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
