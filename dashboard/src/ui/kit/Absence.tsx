import type { ReactNode } from 'react';
import { Badge } from './Badge';
import styles from './Absence.module.css';

/**
 * Les natures d'absence mesurées en base (GUIDELINES §3.1).
 *
 * Le §3.1 les annonce comme « sept absences », mais son propre tableau et la
 * maquette (Composants.dc.html, « Sept absences, sept rendus ») en
 * dénombrent huit — voir le rapport de tâche 3. Les huit sont reprises ici :
 * mieux vaut un rendu de trop que d'en fusionner deux qui ne disent pas la
 * même chose.
 *
 * Deux d'entre elles produisent la **même donnée** (`stack = []`) pour deux
 * causes opposées : `texte-coupe` (295 offres — Adzuna coupe à 500
 * caractères, la stack est *non détectable*) et `aucune-techno` (244 offres —
 * texte complet, rien de technique dedans). Les confondre a été le piège payé
 * une fois pendant la conception : écrire « stack vide = texte tronqué »
 * aurait été faux sur 244 offres. C'est pour cette seule raison que ces deux
 * natures ont deux rendus distincts, et non parce que chaque nature a besoin
 * du sien.
 */
export type AbsenceNature =
  /** L'annonce existe, le champ non — ex. employeur absent de l'annonce. */
  | 'non-publiee'
  /** Le modèle n'a rien dégagé du texte — ex. séniorité, lieu. */
  | 'non-precisee'
  /** `stack` vide PARCE QUE le texte reçu est tronqué (Adzuna, 500 car.). */
  | 'texte-coupe'
  /** Texte complet, et rien de technique dedans. */
  | 'aucune-techno'
  /** Pas de montant : un zéro de bonus, pas un zéro d'euros. */
  | 'salaire-non-publie'
  /** Le nombre existe, son unité non (P22). */
  | 'unite-incertaine'
  /** Collectée, jamais soumise à l'IA : pas « mal notée ». */
  | 'hors-perimetre'
  /** L'appel au modèle a échoué (P16). */
  | 'echec-jugement';

interface Props {
  nature: AbsenceNature;
  /** Le libellé affiché — fourni par l'appelant, jamais contenu ici. */
  children: ReactNode;
}

/**
 * Une absence, nommée selon sa nature.
 *
 * « Pas encore » n'est pas « jamais », et « vide » n'est pas « zéro »
 * (GUIDELINES §3.1) : une case vide confondrait les sept. `data-nature` porte
 * la nature en attribut, comme `data-ton` sur `Badge`, pour que les tests
 * (et les écrans des tâches 7-9) puissent affirmer sur l'état sans dépendre
 * du texte affiché ni du nom de classe généré.
 */
export function Absence({ nature, children }: Props) {
  switch (nature) {
    case 'non-publiee':
    case 'non-precisee':
      return (
        <span className={styles.texte} data-nature={nature}>
          {children}
        </span>
      );
    case 'salaire-non-publie':
      return (
        <span className={styles.chip} data-nature={nature}>
          {children}
        </span>
      );
    case 'texte-coupe':
    case 'unite-incertaine':
      return (
        <span data-nature={nature}>
          <Badge ton="alerte" taille="compacte" discontinu>
            {children}
          </Badge>
        </span>
      );
    case 'aucune-techno':
    case 'hors-perimetre':
      return (
        <span data-nature={nature}>
          <Badge ton="neutre" taille="compacte" discontinu>
            {children}
          </Badge>
        </span>
      );
    case 'echec-jugement':
      return (
        <span data-nature={nature}>
          <Badge ton="danger" taille="compacte" discontinu>
            {children}
          </Badge>
        </span>
      );
  }
}
