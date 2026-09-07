// Runtime-neutre : aucun accès à l'environnement d'exécution dans ce fichier.
// Classifieur de télétravail partagé par les six sources de collecte.

export type RemoteMode = 'full' | 'hybride' | 'ponctuel' | 'mention' | null;

const NEGATION_PATTERNS: RegExp[] = [
  /pas\s+de\s+t[ée]l[ée]travail/i,
  /sans\s+t[ée]l[ée]travail/i,
];

const FULL_PATTERNS: RegExp[] = [
  /100\s*%\s*(?:de\s+|en\s+)?(?:t[ée]l[ée]travail|remote|distanciel)/i,
  /(?:t[ée]l[ée]travail|remote)\s*(?:à|a)?\s*100\s*%/i,
  /full\s*[-\s]?remote/i,
  /t[ée]l[ée]travail\s+(?:complet|total|int[ée]gral|permanent)/i,
  /(?:enti[èe]rement|int[ée]gralement)\s+(?:en\s+)?t[ée]l[ée]travail/i,
  /t[ée]l[ée]travail\s+5\s*jours/i,
  /100\s*%\s*(?:à\s+)?distance/i,
];

const HYBRIDE_PATTERNS: RegExp[] = [
  /hybride/i,
  /t[ée]l[ée]travail\s+partiel/i,
  /\d\s*(?:à\s*\d\s*)?(?:jours?|journ[ée]es?)\s+(?:de\s+|en\s+)?t[ée]l[ée]travail/i,
  /t[ée]l[ée]travail\w*\s*(?:[:(]|\s)\s*(?:jusqu'?\s*[àa]\s*)?\d\s*(?:jours?|j)/i,
  /t[ée]l[ée]travailler\s+(?:jusqu'?\s*[àa]\s*)?\d\s*jours?/i,
  /accord\s+t[ée]l[ée]travail/i,
];

const PONCTUEL_PATTERNS: RegExp[] = [
  /possibilit[ée]\s+de\s+t[ée]l[ée]travail/i,
  /t[ée]l[ée]travail\s+(?:ponctuel|occasionnel)/i,
  /t[ée]l[ée]travail\s+possible/i,
];

const MENTION_PATTERN = /t[ée]l[ée]travail|full\s*remote|distanciel/i;

function matchesAny(patterns: RegExp[], text: string): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Classe le mode de télétravail d'une offre à partir de son texte.
 * `text` : concaténation du titre et de la description.
 * `extraConditions` : champ annexe optionnel (ex. contexteTravail.conditionsExercice de
 * France Travail, joint par des espaces).
 *
 * Ordre de décision impératif : négation d'abord, puis du plus précis au plus vague.
 */
export function classifyRemote(text: string, extraConditions?: string): RemoteMode {
  const haystack = extraConditions ? `${text} ${extraConditions}` : text;

  if (matchesAny(NEGATION_PATTERNS, haystack)) return null;

  if (matchesAny(FULL_PATTERNS, haystack)) return 'full';

  if (matchesAny(HYBRIDE_PATTERNS, haystack)) return 'hybride';

  if (matchesAny(PONCTUEL_PATTERNS, haystack)) return 'ponctuel';

  if (MENTION_PATTERN.test(haystack)) return 'mention';

  return null;
}
