import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAsync } from './useAsync';

describe('useAsync', () => {
  it('démarre en chargement, puis passe à succès avec les données', async () => {
    const fn = vi.fn().mockResolvedValue({ valeur: 42 });
    const { result } = renderHook(() => useAsync(fn, []));

    expect(result.current[0]).toEqual({ statut: 'chargement' });

    await waitFor(() => expect(result.current[0].statut).toBe('succes'));
    expect(result.current[0]).toEqual({ statut: 'succes', donnees: { valeur: 42 } });
  });

  it('passe à erreur si la promesse est rejetée — jamais confondu avec un succès vide', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('panne réseau'));
    const { result } = renderHook(() => useAsync(fn, []));

    await waitFor(() => expect(result.current[0].statut).toBe('erreur'));
    expect(result.current[0]).toMatchObject({ statut: 'erreur' });
  });

  it('recharger() rejoue fn() sans repasser par "chargement" (les données restent affichées)', async () => {
    const fn = vi.fn().mockResolvedValueOnce({ n: 1 }).mockResolvedValueOnce({ n: 2 });
    const { result } = renderHook(() => useAsync(fn, []));

    await waitFor(() => expect(result.current[0]).toEqual({ statut: 'succes', donnees: { n: 1 } }));

    act(() => result.current[1]());

    // Toujours les données précédentes tant que le second appel n'a pas
    // résolu — pas de retour visible à "chargement" (voir la doc du hook).
    expect(result.current[0]).toEqual({ statut: 'succes', donnees: { n: 1 } });

    await waitFor(() => expect(result.current[0]).toEqual({ statut: 'succes', donnees: { n: 2 } }));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('ignore la réponse périmée quand `deps` change avant que le premier appel ne résolve', async () => {
    let resoudrePremier: ((v: { qui: string }) => void) | undefined;
    const premier = new Promise<{ qui: string }>((resolve) => {
      resoudrePremier = resolve;
    });
    const fn = vi
      .fn()
      .mockImplementationOnce(() => premier)
      .mockImplementationOnce(() => Promise.resolve({ qui: 'second' }));

    const { result, rerender } = renderHook(({ dep }: { dep: number }) => useAsync(fn, [dep]), {
      initialProps: { dep: 1 },
    });

    rerender({ dep: 2 });
    await waitFor(() =>
      expect(result.current[0]).toEqual({ statut: 'succes', donnees: { qui: 'second' } }),
    );

    // Le premier appel résout APRÈS le second : sa réponse périmée ne doit
    // rien écraser.
    resoudrePremier?.({ qui: 'premier-perime' });
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current[0]).toEqual({ statut: 'succes', donnees: { qui: 'second' } });
  });
});
