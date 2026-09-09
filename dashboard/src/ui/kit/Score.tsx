import styles from './Score.module.css';

/**
 * Un bonus ou malus de la décomposition, déjà signé (`bonus_remote`,
 * `malus_technos`… lus dans `scoring_weights`). `cle` sert de clé React
 * stable ; `libelle` est le texte affiché, fourni par l'appelant.
 */
export interface ScoreJeton {
  cle: string;
  libelle: string;
  valeur: number;
}

interface PaireProps {
  /** `final_score` : réglable et gratuit — six bonus/malus lus dans `scoring_weights`. */
  final: number;
  /** `fit_score` : jugement du modèle, figé, payé une fois pour toutes. */
  fit: number;
  /** Libellé du premier nombre (ex. « rang ») — fourni par l'appelant. */
  libelleFinal: string;
  /** Libellé du second nombre (ex. « corresp. ») — fourni par l'appelant. */
  libelleFit: string;
}

interface Props extends PaireProps {
  /** La décomposition en jetons signés. Un tableau vide masque la rangée. */
  jetons: ScoreJeton[];
}

function texteSigne(valeur: number): string {
  if (valeur > 0) return `+${valeur}`;
  // Signe moins typographique (U+2212), pas un trait d'union : c'est celui
  // de la maquette (Composants.dc.html, « &minus; »).
  if (valeur < 0) return `−${Math.abs(valeur)}`;
  return '0';
}

function signe(valeur: number): 'positif' | 'negatif' | 'nul' {
  if (valeur > 0) return 'positif';
  if (valeur < 0) return 'negatif';
  return 'nul';
}

/**
 * Le couple `final`/`fit`, seul — sans la décomposition. Existe pour les
 * écrans qui doivent intercaler autre chose (titre, badges de faits...)
 * entre la paire et sa décomposition (tâche 7, `OfferCard` : la maquette
 * `Main.dc.html` place le corps de la carte entre les deux). Extension du
 * kit plutôt qu'un second composant qui redessinerait la même paire
 * (GUIDELINES §1) : `Score` ci-dessous n'est plus qu'une composition de
 * `ScorePaire` + `ScoreJetons`, à l'identique du rendu précédent.
 */
export function ScorePaire({ final, fit, libelleFinal, libelleFit }: PaireProps) {
  return (
    <div className={styles.paire}>
      <div className={styles.chiffre}>
        <span className={styles.final}>{final}</span>
        <span className={styles.libelle}>{libelleFinal}</span>
      </div>
      <span className={styles.separateur} aria-hidden="true" />
      <div className={styles.chiffre}>
        <span className={styles.fit}>{fit}</span>
        <span className={styles.libelle}>{libelleFit}</span>
      </div>
    </div>
  );
}

/** La décomposition en jetons signés, seule. Un tableau vide ne rend rien
 * (même règle que `Score` : un jeton à zéro n'explique rien, une rangée
 * vide n'affiche pas de conteneur fantôme). */
export function ScoreJetons({ jetons }: { jetons: ScoreJeton[] }) {
  if (jetons.length === 0) return null;
  return (
    <div className={styles.jetons}>
      {jetons.map((jeton) => (
        <span key={jeton.cle} className={styles.jeton} data-signe={signe(jeton.valeur)}>
          {texteSigne(jeton.valeur)} {jeton.libelle}
        </span>
      ))}
    </div>
  );
}

/**
 * Le couple de scores — jamais l'un sans l'autre (GUIDELINES §3.4).
 *
 * `final` et `fit` sont deux natures différentes : `final` est réglable et
 * gratuit, `fit` est un jugement d'IA figé qui a été payé. Aucune prop ne
 * permet de rendre l'un sans l'autre — c'est délibéré. Mesuré : une offre à
 * `fit` 42 / `final` 79 dit « stack moyenne, mais coche toutes tes
 * préférences » ; une offre à `fit` 90 / `final` 89 dit l'inverse. Un seul
 * nombre confondrait ces deux situations opposées.
 *
 * La décomposition en jetons signés rend la différence corrigeable à l'œil :
 * un score opaque ne l'est pas. Composé de `ScorePaire` + `ScoreJetons` —
 * mêmes classes, même DOM qu'avant leur extraction.
 */
export function Score({ final, fit, libelleFinal, libelleFit, jetons }: Props) {
  return (
    <div className={styles.couple}>
      <ScorePaire final={final} fit={fit} libelleFinal={libelleFinal} libelleFit={libelleFit} />
      <ScoreJetons jetons={jetons} />
    </div>
  );
}
