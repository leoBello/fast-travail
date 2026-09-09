// @vitest-environment node
//
// La config globale du dépôt tourne les tests sous jsdom (les composants
// montent de vrais éléments) : jsdom y remplace le `URL` global par le sien,
// et `fileURLToPath` de Node refuse alors cette instance. Ce test ne monte
// rien, ne lit que des fichiers — l'environnement `node` lui rend le `URL`
// natif dont `new URL('./theme.css', import.meta.url)` a besoin.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./theme.css', import.meta.url)), 'utf8');

// `theme.test.ts` vit dans `src/ui/` : la racine du code applicatif, celle
// dont dépendent tous les écrans et composants, est son parent.
const racineSrc = dirname(fileURLToPath(new URL('.', import.meta.url)));

/**
 * Parcourt `dir` récursivement et retourne le chemin de chaque fichier dont
 * le nom se termine par `suffixe`.
 *
 * Écrite à la main plutôt que via `readdirSync(dir, { recursive: true })` :
 * la variante récursive de Node existe, mais un test censé prouver qu'un
 * parcours de fichiers ne s'est pas silencieusement vidé doit rester lisible
 * ligne à ligne, sans compter sur le comportement d'une option récente.
 */
function listerFichiers(dir: string, suffixe: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dir, { withFileTypes: true })) {
    const chemin = join(dir, entree.name);
    if (entree.isDirectory()) {
      listerFichiers(chemin, suffixe, acc);
    } else if (entree.name.endsWith(suffixe)) {
      acc.push(chemin);
    }
  }
  return acc;
}

/**
 * Luminance relative WCAG d'une couleur hexadécimale.
 *
 * Recopiée ici plutôt qu'importée : le test doit pouvoir échouer même si le
 * code applicatif est cassé, et une dépendance de plus pour six lignes de
 * calcul ne se justifie pas.
 */
function luminance(hex: string): number {
  const canal = (n: number) => {
    const c = n / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

function contraste(a: string, b: string): number {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((clair as number) + 0.05) / ((sombre as number) + 0.05);
}

/** Lit un token dans un bloc de sélecteur donné. */
function token(selecteur: string, nom: string): string {
  const bloc = css.split(selecteur)[1]?.split('}')[0] ?? '';
  return new RegExp(`${nom}:\\s*([^;]+);`).exec(bloc)?.[1]?.trim() ?? '';
}

describe('theme.css', () => {
  it('donne au texte secondaire le contraste AA, dans les deux thèmes', () => {
    // La réserve du préambule de theme.css : à #6b7280, `--color-text-muted`
    // tombait à 3,60:1 — sous le seuil AA de 4,5:1, sur la couleur qui porte
    // la raison de présence de chaque ligne (GUIDELINES §9.2 côté prospeo,
    // même principe ici). Mesuré contre `--color-surface-2` : c'est la
    // surface que `Card` rend réellement (voir le rapport de tâche 3 sur le
    // choix de l'ancre de mesure).
    const sombre = contraste(
      token(':root {', '--color-text-muted'),
      token(':root {', '--color-surface-2'),
    );
    expect(sombre).toBeGreaterThanOrEqual(4.5);

    const clair = contraste(
      token(":root[data-theme='light']", '--color-text-muted'),
      token(":root[data-theme='light']", '--color-surface-2'),
    );
    expect(clair).toBeGreaterThanOrEqual(4.5);
  });

  it('déclare les trois familles typographiques', () => {
    expect(css).toContain('--font-display:');
    expect(css).toContain('--font-ui:');
    expect(css).toContain('--font-mono:');
  });

  it("n'abandonne aucun token utilisé par les composants existants", () => {
    // Aucune modification de ce fichier ne doit casser un composant du kit :
    // les composants actuels lisent ces variables, les renommer les rendrait
    // transparents.
    for (const t of [
      '--color-bg',
      '--color-surface-2',
      '--color-border',
      '--color-border-strong',
      '--color-text',
      '--color-text-muted',
      '--color-text-faint',
      '--color-accent',
      '--color-success',
      '--color-danger',
      '--color-warning',
      '--color-info',
    ]) {
      expect(css).toContain(`${t}:`);
    }
  });

  it('sert la police d affichage à au moins un consommateur', () => {
    // À ce stade (tâche 3, kit seul, aucun écran encore construit), la
    // maquette (Composants.dc.html, « Le couple de scores ») n'utilise la
    // police d'affichage qu'à un seul endroit : `final_score` dans `Score`.
    // Les tâches 7-9 en ajouteront d'autres (titres d'écran, en-têtes de
    // panneau) — le seuil remonte alors, comme il l'a fait sur prospeo. Un
    // seuil à zéro laisserait passer un token déclaré et jamais consommé sans
    // que rien ne le signale.
    const feuillesDeStyle = listerFichiers(racineSrc, '.module.css');

    // Garde-fou : si le parcours casse (mauvais dossier, extension mal
    // écrite), `feuillesDeStyle` tombe à zéro et l'assertion du dessous
    // passerait vide silencieusement. Le kit compte aujourd'hui cinq feuilles.
    expect(feuillesDeStyle.length).toBeGreaterThanOrEqual(5);

    const consommateurs = feuillesDeStyle.filter((chemin) =>
      readFileSync(chemin, 'utf8').includes('var(--font-display)'),
    );

    expect(consommateurs.length).toBeGreaterThanOrEqual(1);
  });

  it('ne laisse aucun token déclaré sans consommateur', () => {
    const fichiersSource = [
      ...listerFichiers(racineSrc, '.module.css'),
      ...listerFichiers(racineSrc, '.tsx'),
    ];

    // Même garde-fou que ci-dessus : sans lui, un parcours cassé (zéro
    // fichier lu) ferait passer TOUS les tokens pour orphelins, ou pire, TOUS
    // pour consommés selon la forme du bug — dans les deux cas en silence
    // plutôt qu'en échec net.
    expect(fichiersSource.length).toBeGreaterThan(10);

    const contenus = fichiersSource.map((chemin) => readFileSync(chemin, 'utf8'));
    // `--font-ui` n'a pas de consommateur hors theme.css : c'est la police du
    // `body`, la base dont tout le reste hérite. Sa propre feuille compte.
    contenus.push(css);

    const tokensDeclares = [
      ...new Set(
        [...css.matchAll(/(--[a-z0-9-]+):/g)]
          .map((m) => m[1])
          .filter((nom): nom is string => nom !== undefined),
      ),
    ];

    const orphelins = tokensDeclares.filter(
      (tok) => !contenus.some((contenu) => contenu.includes(`var(${tok})`)),
    );

    expect(orphelins).toEqual([]);
  });
});
