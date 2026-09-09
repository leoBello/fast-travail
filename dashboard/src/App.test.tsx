import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App', () => {
  it(
    "sans variables VITE_* (le cas normal d'un clone sans .env.local, y compris cet " +
      'environnement de test), affiche un message de configuration nommé plutôt que de planter',
    () => {
      render(<App />);
      expect(screen.getByText('Configuration manquante')).toBeDefined();
      expect(screen.getAllByText(/VITE_DASHBOARD_API_URL/).length).toBeGreaterThan(0);
    },
  );
});
