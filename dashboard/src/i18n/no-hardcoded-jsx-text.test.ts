// @vitest-environment node
//
// Ce fichier ne monte rien : il LIT le code source `.tsx` du dashboard et
// en analyse l'AST pour faire respecter GUIDELINES §3.8 (« Tout texte
// affiché passe par t() »). Même raison d'environnement `node` que
// `ui/guidelines.test.ts` et `ui/theme.test.ts` : `fileURLToPath` refuse le
// `URL` de jsdom.
//
// C'est le test que le brief de la tâche 4 nomme comme « le seul moyen
// mécanique de tenir la règle » : sans lui, l'interdiction des chaînes en
// dur ne survit qu'aussi longtemps que chaque revue de code y pense.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Même racine que `ui/guidelines.test.ts` : ce fichier vit à la même
// profondeur (`src/i18n/`, comme `src/ui/`), donc `..` depuis son propre
// dossier rend aussi `dashboard/src/`.
const RACINE = fileURLToPath(new URL('..', import.meta.url));

/**
 * Tous les `.tsx` de `dossier` (récursif), hors fichiers de test.
 *
 * Les fichiers de test sont exclus par construction, pas par oubli : un
 * test comme `Badge.test.tsx` écrit délibérément
 * `<Badge>Rouge éliminatoire</Badge>` pour vérifier le rendu — c'est
 * l'usage normal de React Testing Library, pas une chaîne qui atteint un
 * écran réel.
 */
function fichiersTsx(dossier: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      fichiersTsx(chemin, acc);
    } else if (
      entree.endsWith('.tsx') &&
      !entree.endsWith('.test.tsx') &&
      !entree.endsWith('.spec.tsx')
    ) {
      acc.push(chemin);
    }
  }
  return acc;
}

const FICHIERS = fichiersTsx(RACINE);

interface Violation {
  chemin: string;
  ligne: number;
  extrait: string;
}

/**
 * `expr` rend-il un morceau de texte littéral, directement, sans passer par
 * un appel de fonction ? Couvre les trois formes signalées en revue, où un
 * texte en dur se cache derrière une expression plutôt que d'être un enfant
 * JSX nu :
 * - un opérande littéral d'un ternaire (`cond ? 'oui en dur' : t('non')`),
 *   recherché des deux côtés, récursivement pour un ternaire imbriqué ;
 * - une concaténation portant un littéral (`'a' + name`), côté gauche ou
 *   droit, y compris chaînée (`'a' + 'b' + name`) ;
 * - les portions littérales d'un gabarit **avec** substitution
 *   (`` `Bonjour ${name}` `` — « Bonjour  » est du texte en dur autant que
 *   `` `texte` `` sans substitution, déjà couvert directement par
 *   `isNoSubstitutionTemplateLiteral` dans `violationsDe`).
 *
 * Chaque branche/opérande qui est un **appel de fonction** (`t('a.b')`,
 * `formatX('texte')`, `list.map(...)`…) est traitée comme opaque et n'est
 * jamais descendue : c'est la même exemption que celle déjà documentée pour
 * `t()` lui-même — un argument littéral passé à une fonction n'est pas du
 * texte affiché tel quel, c'est une donnée que la fonction transforme.
 * Conséquence assumée, à garder à l'esprit : `{cond ? formatX('texte en
 * dur') : 'x'}` ne relève QUE la branche `'x'`, pas le littéral caché dans
 * `formatX(...)`.
 */
function contientLitteral(expr: ts.Expression): boolean {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return expr.text.trim() !== '';
  }
  if (ts.isTemplateExpression(expr)) {
    const morceaux = [expr.head.text, ...expr.templateSpans.map((s) => s.literal.text)];
    return morceaux.some((m) => m.trim() !== '');
  }
  if (ts.isConditionalExpression(expr)) {
    return contientLitteral(expr.whenTrue) || contientLitteral(expr.whenFalse);
  }
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return contientLitteral(expr.left) || contientLitteral(expr.right);
  }
  if (ts.isParenthesizedExpression(expr)) {
    return contientLitteral(expr.expression);
  }
  // Tout le reste — Identifier, PropertyAccess, CallExpression, les autres
  // opérateurs binaires (`&&`, `||`, `??`, comparaisons)… — est opaque.
  // `&&`/`||`/`??` restent un angle mort NOMMÉ, pas fermé par cette tâche :
  // `{cond && 'texte en dur'}` passerait au vert. Une comparaison
  // (`x === 'foo'`) est exclue à dessein : son opérande littéral ne devient
  // JAMAIS le texte rendu (l'expression rend un booléen), l'inclure aurait
  // créé un faux positif sur du code parfaitement légitime.
  return false;
}

/**
 * Parcourt l'AST d'un `.tsx` et relève tout texte JSX affiché en dur :
 * - le texte entre balises (`JsxText` non blanc — les retours à la ligne
 *   et l'indentation entre éléments ne comptent pas comme du texte) ;
 * - une expression enfant de JSX qui rend un littéral, directement
 *   (`{'texte'}`, `` {`texte`} `` sans substitution) ou via l'une des trois
 *   formes de `contientLitteral` ci-dessus (ternaire, concaténation,
 *   gabarit avec substitution).
 *
 * Volontairement **hors périmètre** :
 * - les valeurs d'attribut (`type="button"`, `className="…"`,
 *   `data-testid="…"`…). La plupart ne sont pas du texte affiché, et les y
 *   inclure sans distinction ferait échouer le test sur du code technique
 *   légitime — le risque inverse de « passer à vide », tout aussi réel. Le
 *   vocabulaire d'attributs réellement visibles (`aria-label`, `alt`,
 *   `title`) est laissé aux écrans des tâches 7-9, qui sauront lesquels
 *   portent du texte et lesquels portent un identifiant technique ;
 * - un littéral passé en argument à un appel de fonction (voir
 *   `contientLitteral`) — sauf s'il redevient, lui, un `JsxText` ou une
 *   expression enfant de JSX plus bas dans l'arbre (ex. à l'intérieur d'un
 *   `.map()` qui retourne du JSX), auquel cas cette même fonction le
 *   retrouvera à cet endroit-là, normalement ;
 * - les opérateurs binaires autres que `+` (`&&`, `||`, `??`, comparaisons).
 */
function violationsDe(chemin: string): Violation[] {
  const source = readFileSync(chemin, 'utf8');
  const fichier = ts.createSourceFile(
    chemin,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const violations: Violation[] = [];

  // Distingue un enfant (`<p>{expr}</p>`) d'une valeur d'attribut
  // (`<p title={expr}>`) : seul le premier est du texte AFFICHÉ. Les deux
  // parents sont mutuellement exclusifs pour une `JsxExpression` — pas
  // besoin d'exclure explicitement `JsxAttribute`.
  function estEnfantJsx(noeud: ts.Node): boolean {
    const parent = noeud.parent;
    return parent !== undefined && (ts.isJsxElement(parent) || ts.isJsxFragment(parent));
  }

  function visiter(noeud: ts.Node) {
    if (ts.isJsxText(noeud) && noeud.getText(fichier).trim() !== '') {
      const { line } = fichier.getLineAndCharacterOfPosition(noeud.getStart(fichier));
      violations.push({ chemin, ligne: line + 1, extrait: noeud.getText(fichier).trim() });
    }
    if (
      ts.isJsxExpression(noeud) &&
      noeud.expression !== undefined &&
      estEnfantJsx(noeud) &&
      contientLitteral(noeud.expression)
    ) {
      const { line } = fichier.getLineAndCharacterOfPosition(noeud.getStart(fichier));
      violations.push({
        chemin,
        ligne: line + 1,
        extrait: noeud.expression.getText(fichier).trim(),
      });
    }
    ts.forEachChild(noeud, visiter);
  }

  visiter(fichier);
  return violations;
}

describe('aucune chaîne littérale rendue dans du JSX (GUIDELINES §3.8)', () => {
  it('trouve des fichiers .tsx de production — sinon le contrôle suivant passerait à vide', () => {
    // Garde-fou (même forme que `ui/guidelines.test.ts`, tâche 3) : si
    // `fichiersTsx()` se casse — mauvais chemin, mauvaise extension — et
    // rend toujours `[]`, le test ci-dessous serait vrai sur l'ensemble
    // vide, en silence, exactement le piège que le brief nomme. Compté au
    // moment d'écrire ce test : 9 fichiers (`App.tsx`, `main.tsx`, les
    // sept composants du kit). Le seuil est posé en dessous pour ne pas
    // casser à la moindre réorganisation.
    expect(FICHIERS.length).toBeGreaterThanOrEqual(5);
  });

  it("n'affiche aucune chaîne littérale dans du JSX", () => {
    const violations = FICHIERS.flatMap(violationsDe);
    if (violations.length > 0) {
      const detail = violations
        .map((v) => `${v.chemin.slice(RACINE.length)}:${v.ligne} → "${v.extrait}"`)
        .join('\n');
      expect.fail(
        `Chaîne(s) affichée(s) en dur, à faire passer par t() (GUIDELINES §3.8) :\n${detail}`,
      );
    }
  });
});
