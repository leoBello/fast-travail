// Runtime-neutre. Lecture de robots.txt selon la convention usuelle :
// groupe d'agent le plus spécifique, puis motif le plus long, Allow gagnant à
// égalité de longueur.

export interface RobotsRules {
  /** `path` inclut la query string éventuelle, ex. `/jobs/fr?page=2`. */
  allows(path: string): boolean;
}

interface Rule {
  allow: boolean;
  pattern: RegExp;
  /** Longueur du motif brut : c'est elle qui arbitre, pas l'ordre des lignes. */
  length: number;
}

function toRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
  const withWildcards = escaped.replace(/\*/g, '.*');
  const anchored = withWildcards.endsWith('$')
    ? `^${withWildcards.slice(0, -1)}$`
    : `^${withWildcards}`;
  return new RegExp(anchored);
}

/**
 * `userAgent` est notre agent complet ; un groupe s'applique si son jeton
 * apparaît dedans (insensible à la casse), conformément à l'usage. Le groupe
 * `*` ne sert que si aucun groupe nominatif ne correspond.
 */
export function parseRobots(text: string, userAgent: string): RobotsRules {
  const ua = userAgent.toLowerCase();
  const named: Rule[] = [];
  const wildcard: Rule[] = [];

  let currentTargets: 'named' | 'wildcard' | null = null;
  let expectingAgents = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;

    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') {
      if (!expectingAgents) currentTargets = null;
      expectingAgents = true;
      if (value === '*') currentTargets = currentTargets === 'named' ? 'named' : 'wildcard';
      else if (ua.includes(value.toLowerCase())) currentTargets = 'named';
      continue;
    }

    if (field !== 'allow' && field !== 'disallow') continue;
    expectingAgents = false;
    if (currentTargets === null) continue;
    // « Disallow: » vide veut dire « rien n'est interdit » : on ignore la ligne.
    if (field === 'disallow' && value === '') continue;

    const rule: Rule = { allow: field === 'allow', pattern: toRegExp(value), length: value.length };
    if (currentTargets === 'named') named.push(rule);
    else wildcard.push(rule);
  }

  const rules = named.length > 0 ? named : wildcard;

  return {
    allows(path: string): boolean {
      let best: Rule | null = null;
      for (const rule of rules) {
        if (!rule.pattern.test(path)) continue;
        if (best === null || rule.length > best.length) best = rule;
        else if (rule.length === best.length && rule.allow) best = rule;
      }
      return best === null ? true : best.allow;
    },
  };
}
