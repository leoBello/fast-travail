import type { StatutCounts } from '../../data/types';
import { TON_STATUT } from '../../ui/kit/StatusBadge';
import { t } from '../../i18n/i18n';
import styles from './StatusTabs.module.css';
import { comptePourOnglet, STATUT_ONGLETS } from './statusTabsLogic';
import type { OngletId } from './statusTabsLogic';

// Réexports de constante et de type : sans risque pour le rafraîchissement
// à chaud (`allowConstantExport` couvre les deux), contrairement aux
// fonctions de `statusTabsLogic.ts`, qui restent à importer depuis là-bas.
export type { OngletId } from './statusTabsLogic';
export { ONGLET_PAR_DEFAUT } from './statusTabsLogic';

/**
 * Le libellé de chaque onglet — une clé DÉDIÉE par onglet (`matin.onglet*`),
 * jamais `statuts.*` : `statuts.*` qualifie une offre au singulier,
 * un onglet nomme une collection au pluriel (voir `fr.ts`).
 *
 * Écrit en `switch` exhaustif, sans `default` : un huitième `OngletId`
 * ajouté un jour laisserait un chemin sans `return`, donc une erreur de
 * compilation (« not all code paths return a value ») plutôt qu'une clé
 * manquante découverte à l'écran.
 */
function libelle(id: OngletId): string {
  switch (id) {
    case 'a_traiter':
      return t('matin.ongletATraiter');
    case 'retenue':
      return t('matin.ongletRetenues');
    case 'postulee':
      return t('matin.ongletPostulees');
    case 'relancee':
      return t('matin.ongletRelancees');
    case 'entretien':
      return t('matin.ongletEntretien');
    case 'terminee':
      return t('matin.ongletTerminees');
    case 'ecartee':
      return t('matin.ongletEcartees');
    case 'toutes':
      return t('matin.ongletToutes');
  }
}

interface Props {
  actif: OngletId;
  onChange: (id: OngletId) => void;
  /** `null` tant que `GET /statut-counts` n'a pas répondu : chaque onglet
   * affiche alors un tiret cadratin plutôt qu'un zéro, qui serait une
   * AFFIRMATION fausse (GUIDELINES §3.3, même règle que le badge
   * « compte en attente » de la liste). */
  comptes: StatutCounts | null;
}

function Onglet({
  id,
  actif,
  comptes,
  onChange,
}: {
  id: OngletId;
  actif: OngletId;
  comptes: StatutCounts | null;
  onChange: (id: OngletId) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={id === actif}
      className={styles.onglet}
      data-actif={id === actif ? 'oui' : undefined}
      data-ton={id === 'toutes' ? undefined : TON_STATUT[id]}
      onClick={() => onChange(id)}
    >
      {id === 'toutes' ? null : (
        <span className={id === 'ecartee' ? styles.anneau : styles.point} aria-hidden="true" />
      )}
      <span>{libelle(id)}</span>
      <span className={styles.compte}>
        {comptes === null ? t('matin.compteEnAttenteCourt') : comptePourOnglet(id, comptes)}
      </span>
    </button>
  );
}

/**
 * La barre d'onglets de « Toute la veille » (`Main.dc.html`).
 *
 * Le point coloré **double** le mot, il ne le remplace jamais (GUIDELINES
 * §3.7), et il reprend `TON_STATUT` du kit plutôt qu'une seconde table de
 * couleurs. « Écartée » porte un anneau discontinu au lieu d'un point plein :
 * c'est la même distinction que `StatusBadge` — une sortie, pas une étape.
 *
 * L'onglet actif ne se signale pas que par la couleur : `aria-selected`, un
 * fond, et un trait de 2 px sous l'onglet.
 *
 * Un séparateur vertical, purement décoratif (`aria-hidden`), isole
 * « Toutes » des sept onglets de statut — repris de la maquette, qui le
 * dessine entre « Écartées » et « Toutes » (GUIDELINES §5.1 : un élément que
 * la maquette porte ne se retire pas de l'écran).
 */
export function StatusTabs({ actif, onChange, comptes }: Props) {
  return (
    <div className={styles.onglets} role="tablist" aria-label={t('matin.ongletsLabel')}>
      {STATUT_ONGLETS.map((id) => (
        <Onglet key={id} id={id} actif={actif} comptes={comptes} onChange={onChange} />
      ))}
      <span className={styles.separateur} aria-hidden="true" />
      <Onglet id="toutes" actif={actif} comptes={comptes} onChange={onChange} />
    </div>
  );
}
