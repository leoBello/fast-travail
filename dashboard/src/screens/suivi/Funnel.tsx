import { BRIEF_THRESHOLD } from '../../data/types';
import type { StatsResult } from '../../data/types';
import { EmptyState } from '../../ui/kit/EmptyState';
import { t } from '../../i18n/i18n';
import styles from './Funnel.module.css';

type Etape = 'collectees' | 'lues' | 'seuil' | 'retenues' | 'postulees';

const ETAPES: {
  cle: Etape;
  libelle: () => string;
  valeur: (f: StatsResult['funnel']) => number;
}[] = [
  { cle: 'collectees', libelle: () => t('suivi.etapeCollectees'), valeur: (f) => f.collected },
  { cle: 'lues', libelle: () => t('suivi.etapeLues'), valeur: (f) => f.scored },
  {
    cle: 'seuil',
    libelle: () => t('suivi.etapeSeuil', BRIEF_THRESHOLD),
    valeur: (f) => f.aboveThreshold,
  },
  { cle: 'retenues', libelle: () => t('suivi.etapeRetenues'), valeur: (f) => f.retained },
  { cle: 'postulees', libelle: () => t('suivi.etapePostulees'), valeur: (f) => f.applied },
];

interface Props {
  /** `null` tant que `/stats` n'a jamais répondu — jamais confondu avec un
   * entonnoir réellement à zéro (GUIDELINES §3.3). */
  funnel: StatsResult['funnel'] | null;
  chargement: boolean;
  erreur: boolean;
  onReessayer: () => void;
}

/**
 * « Cette nuit, pendant que le PC était éteint » (`Suivi.dc.html`) :
 * l'entonnoir à cinq étages, les trois premiers comptés en base, les deux
 * derniers issus des décisions.
 *
 * **Trois états, jamais confondus** (le piège nommé par task-9-brief.md) :
 * `erreur` (rien n'a pu être lu), `chargement` (rien n'est encore confirmé —
 * cinq segments neutres, AUCUN chiffre, surtout pas un 0 qui affirmerait à
 * tort un entonnoir vide) et `succès` (les cinq nombres réels, `retenues`
 * et `postulees` valant éventuellement 0 — un fait confirmé que la note du
 * bas explique plutôt que de le laisser passer pour un défaut).
 */
export function Funnel({ funnel, chargement, erreur, onReessayer }: Props) {
  return (
    <section className={styles.section}>
      <div className={styles.entete}>
        <span className={styles.titre}>{t('suivi.entonnoirTitre')}</span>
        <div className={styles.spacer} />
        <span className={styles.horaire}>{t('suivi.entonnoirHoraire')}</span>
      </div>

      {erreur ? (
        <>
          <EmptyState
            titre={t('suivi.erreurChargement')}
            detail={t('suivi.erreurChargementDetail')}
          />
          <button type="button" className={styles.reessayer} onClick={onReessayer}>
            {t('suivi.reessayer')}
          </button>
        </>
      ) : chargement || funnel === null ? (
        <div
          className={styles.segments}
          data-chargement="true"
          role="img"
          aria-label={t('suivi.chargement')}
        >
          {ETAPES.map((etape) => (
            <div key={etape.cle} className={styles.segmentChargement} />
          ))}
        </div>
      ) : (
        <>
          <div className={styles.segments} data-chargement="false">
            {ETAPES.map((etape) => (
              <div key={etape.cle} className={styles.segment}>
                <div className={styles.pastille} data-etape={etape.cle}>
                  <span className={styles.nombre}>{etape.valeur(funnel)}</span>
                </div>
                <span className={styles.libelle}>{etape.libelle()}</span>
              </div>
            ))}
          </div>
          <p className={styles.note}>{t('suivi.entonnoirNote')}</p>
        </>
      )}
    </section>
  );
}
