import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ecrireRepli, lireRepli } from './repliStorage';

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('repliStorage', () => {
  it('déplié par défaut : la bande est ce que la maquette montre en premier', () => {
    expect(lireRepli()).toBe(false);
  });

  it('relit ce qui a été écrit', () => {
    ecrireRepli(true);
    expect(lireRepli()).toBe(true);
  });

  it('un stockage indisponible ne fait pas planter l’écran', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('bloqué');
      },
      setItem() {
        throw new Error('bloqué');
      },
    });
    expect(lireRepli()).toBe(false);
    expect(() => ecrireRepli(true)).not.toThrow();
  });
});
