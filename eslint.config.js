// ESLint côté Node/dashboard uniquement. Les Edge Functions et scripts Deno
// sont linté(e)s par `deno lint` (npm run lint) — voir CLAUDE.md, « le piège
// d'outillage ». Ce fichier ne doit jamais être élargi à supabase/functions/
// ou scripts/.
//
// Depuis ESLint 9, le flat config ne lit plus .eslintignore (ce fichier
// existe encore à la racine, mais seulement comme trace de la convention
// posée en phase 1 : c'est le tableau `ignores` ci-dessous qui fait foi).
import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Mêmes chemins que .prettierignore : supabase/functions/ et scripts/
    // sont linté(e)s par `deno lint`, docs/design/maquettes/ est la capture
    // d'un outil de design (pas du code du projet), dashboard/dist/ est de
    // la sortie de build. node_modules/** est déjà ignoré par défaut par
    // ESLint ; listé ici quand même pour que ce tableau reste la liste
    // complète et lisible d'un coup d'œil.
    ignores: [
      'supabase/functions/**',
      'scripts/**',
      'docs/design/maquettes/**',
      'node_modules/**',
      '.superpowers/**',
      'dashboard/dist/**',
    ],
  },
  {
    files: ['dashboard/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  // Désactive les règles de style ESLint qui feraient double emploi avec
  // Prettier. Restreint à dashboard/**, comme le reste de ce fichier : sans
  // `files`, ce bloc s'appliquerait à tout objet ciblé par ESLint, y compris
  // ce fichier de config lui-même — sans effet ici puisqu'il ne fait que
  // désactiver des règles, mais la portée doit rester lisible.
  { ...eslintConfigPrettier, files: ['dashboard/**/*.{ts,tsx}'] },
);
