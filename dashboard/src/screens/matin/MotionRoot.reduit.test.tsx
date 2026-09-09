import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MotionRoot } from './MotionRoot';

/**
 * `framer-motion` (`motion-dom`) lit `window.matchMedia` UNE SEULE FOIS par
 * cycle de vie de son module (`hasReducedMotionListener.current` mémorise
 * l'initialisation). C'est pourquoi les deux réponses possibles
 * (préférence active / inactive) vivent dans deux FICHIERS de test séparés
 * plutôt que deux `it()` du même fichier : Vitest isole le registre de
 * modules par fichier (confirmé empiriquement — `vi.resetModules()` seul,
 * essayé d'abord, laissait l'état du premier test fuiter dans le second, le
 * module `motion-dom` restant partagé). Deux fichiers garantissent un
 * `window.matchMedia` lu à l'état neuf dans chacun.
 *
 * C'est la vérification que la revue de tâche 7 demandait : la version
 * précédente affirmait le respect de `prefers-reduced-motion` sans jamais
 * simuler la préférence système et lire ce qui en résulte réellement —
 * `theme.css` neutralise des animations CSS, jamais celles, en JS, de
 * Framer Motion.
 */
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: true,
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

describe('MotionRoot — préférence système active', () => {
  it('pose data-reduced-motion="true" sur <html> quand le système préfère moins de mouvement', async () => {
    render(
      <MotionRoot>
        <div>contenu</div>
      </MotionRoot>,
    );

    await waitFor(() => expect(document.documentElement.dataset.reducedMotion).toBe('true'));
  });
});
