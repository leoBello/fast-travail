// Runtime-neutre. Le SEUL fichier du projet qui manipule du HTML.
//
// Aucun parseur DOM : les deux sources exposent leurs données dans un bloc
// JSON (JSON-LD pour Free-Work, __NEXT_DATA__ pour Collective), et le HTML
// n'est jamais lu pour en extraire un champ. Charger un parseur pour découper
// deux balises <script> coûterait une dépendance sans rien apporter.

const JSON_LD = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const NEXT_DATA = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i;

/** Blocs `application/ld+json` de la page, dans l'ordre. Un bloc illisible est ignoré. */
export function extractJsonLd(html: string): unknown[] {
  const blocks: unknown[] = [];
  for (const match of html.matchAll(JSON_LD)) {
    try {
      blocks.push(JSON.parse(match[1]));
    } catch {
      // Un bloc mal formé ne doit pas faire perdre les autres : une page peut
      // en porter plusieurs, et un seul nous intéresse.
      continue;
    }
  }
  return blocks;
}

/** Payload `__NEXT_DATA__` de la page, ou null s'il est absent ou illisible. */
export function extractNextData(html: string): unknown {
  const match = html.match(NEXT_DATA);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

const BLOCK_END = /<\/(?:p|div|li|ul|ol|h[1-6]|tr|table|section)>|<br\s*\/?>/gi;
const TAG = /<[^>]*>/g;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi;

/**
 * HTML -> texte brut, pour une description destinée à `offers.description`.
 *
 * La colonne alimente `description_tsv` et le lexique de compétences : y
 * laisser des balises polluerait la recherche plein texte et ferait matcher un
 * terme sur un nom d'attribut. Les coupures de bloc deviennent des retours à la
 * ligne pour que le texte reste lisible dans la sélection quotidienne.
 *
 * Le décodage se fait en UNE passe : décoder deux fois transformerait le texte
 * littéral `&amp;lt;` en `<`, ce qui est faux.
 */
export function htmlToText(html: string): string {
  return html
    .replace(BLOCK_END, '\n')
    .replace(TAG, ' ')
    .replace(ENTITY, (whole, name: string) => {
      if (name.startsWith('#x') || name.startsWith('#X')) {
        return String.fromCodePoint(parseInt(name.slice(2), 16));
      }
      if (name.startsWith('#')) return String.fromCodePoint(parseInt(name.slice(1), 10));
      return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
    })
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n *(?:\n *)*/g, '\n')
    .trim();
}
