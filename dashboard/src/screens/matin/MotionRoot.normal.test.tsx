import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MotionRoot } from './MotionRoot';

// Voir `MotionRoot.reduit.test.tsx` pour l'explication du découpage en deux
// fichiers (l'état interne de `framer-motion`/`motion-dom` n'est lu qu'une
// fois par cycle de vie du module — chaque fichier de test en obtient un
// neuf).
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

describe('MotionRoot — préférence système inactive', () => {
  it('pose data-reduced-motion="false" quand le système ne demande pas moins de mouvement', async () => {
    render(
      <MotionRoot>
        <div>contenu</div>
      </MotionRoot>,
    );

    await waitFor(() => expect(document.documentElement.dataset.reducedMotion).toBe('false'));
  });
});
