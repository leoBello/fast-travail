import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HAUTEUR_LIGNE, PAGE_SIZE_DEFAUT, usePageSizeAjustee } from './usePageSizeAjustee';

/** `jsdom` n'implémente pas `ResizeObserver` : on le remplace par un double
 * dont on déclenche la notification à la main. */
let declencher: (() => void) | null = null;

beforeEach(() => {
  declencher = null;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        declencher = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});

function refDeHauteur(hauteur: number) {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientHeight', { value: hauteur, configurable: true });
  return { current: element };
}

describe('usePageSizeAjustee', () => {
  it('rend la valeur par défaut tant que rien n’est mesurable', () => {
    const { result } = renderHook(() => usePageSizeAjustee({ current: null }));
    expect(result.current).toBe(PAGE_SIZE_DEFAUT);
  });

  it('une hauteur nulle ne change rien (jsdom, et la frame de montage)', () => {
    const { result } = renderHook(() => usePageSizeAjustee(refDeHauteur(0)));
    act(() => declencher?.());
    expect(result.current).toBe(PAGE_SIZE_DEFAUT);
  });

  it('déduit le nombre de lignes qui tiennent', () => {
    const { result } = renderHook(() => usePageSizeAjustee(refDeHauteur(HAUTEUR_LIGNE * 15 + 20)));
    act(() => declencher?.());
    expect(result.current).toBe(15);
  });

  it('ne descend jamais sous le plancher', () => {
    const { result } = renderHook(() => usePageSizeAjustee(refDeHauteur(HAUTEUR_LIGNE)));
    act(() => declencher?.());
    expect(result.current).toBe(5);
  });
});
