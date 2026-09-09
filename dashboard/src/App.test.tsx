import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

/**
 * Simule explicitement l'ABSENCE des trois variables `VITE_*`, plutôt que de
 * compter sur l'environnement AMBIANT pour ne pas les avoir définies.
 *
 * **Défaut corrigé (revue de tâche 10)** : la version précédente de ce test
 * ne posait rien — elle supposait qu'aucune des trois variables n'était
 * définie, ce qui n'est vrai que sur un clone nu. Dès que `dashboard/.env`
 * (gitignoré, jamais dans le dépôt) porte de vraies valeurs sur une
 * machine — ce qui arrive dès qu'on veut tester l'application contre la
 * fonction déployée, exactement ce que cette tâche a fait — Vite les charge
 * AUSSI en mode test, `dashboardClientFromEnv()` ne lève plus, et ce test
 * échoue pour une raison totalement étrangère à ce qu'il prétend vérifier :
 * le même code produit un résultat différent selon qui a rempli ce fichier
 * avant, sur quelle machine.
 *
 * `vi.stubEnv` agit sur `import.meta.env` comme sur `process.env` (Vitest
 * 5) : il rend ce test vrai sur un clone nu ET sur une machine où
 * `dashboard/.env` est rempli — le même résultat, indépendamment de
 * l'environnement ambiant. `vi.unstubAllEnvs()` après CHAQUE test (succès ou
 * échec) pour ne rien laisser fuiter vers un autre fichier.
 */
beforeEach(() => {
  vi.stubEnv('VITE_DASHBOARD_API_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  vi.stubEnv('VITE_DASHBOARD_TOKEN', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('App', () => {
  it(
    "sans variables VITE_* (simulé explicitement ci-dessus — le cas normal d'un clone sans " +
      '.env.local, mais aussi celui d’une machine où dashboard/.env existe : ce test rend le ' +
      'même résultat dans les deux cas), affiche un message de configuration nommé plutôt que ' +
      'de planter',
    () => {
      render(<App />);
      expect(screen.getByText('Configuration manquante')).toBeDefined();
      expect(screen.getAllByText(/VITE_DASHBOARD_API_URL/).length).toBeGreaterThan(0);
    },
  );
});
