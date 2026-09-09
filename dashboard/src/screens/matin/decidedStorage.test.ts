import { afterEach, describe, expect, it, vi } from 'vitest';
import { ecrireDecideesDuJour, lireDecideesDuJour } from './decidedStorage';

afterEach(() => {
  window.localStorage.clear();
});

describe('decidedStorage — le compteur « décidées » persiste, borné au jour civil de Paris', () => {
  it("rend 0 quand rien n'a encore été décidé aujourd'hui", () => {
    expect(lireDecideesDuJour(new Date('2026-06-15T10:00:00.000Z'))).toBe(0);
  });

  it('relit exactement ce qui a été écrit pour le même jour', () => {
    const maintenant = new Date('2026-06-15T10:00:00.000Z');
    ecrireDecideesDuJour(4, maintenant);
    expect(lireDecideesDuJour(maintenant)).toBe(4);
  });

  it("n'expose PAS le compte d'un autre jour civil parisien — la promesse « ça remet à zéro le lendemain »", () => {
    const hier = new Date('2026-06-14T10:00:00.000Z');
    const aujourdhui = new Date('2026-06-15T10:00:00.000Z');
    ecrireDecideesDuJour(7, hier);
    expect(lireDecideesDuJour(aujourdhui)).toBe(0);
  });

  it(
    'utilise le jour civil de PARIS pour la frontière, pas UTC — même piège que la série ' +
      '(tâche 6, dashboard-query.ts)',
    () => {
      // 23:30 UTC le 15 janvier = 00:30 le 16 janvier à Paris (hiver, UTC+1).
      // Écrit "hier" (encore le 15 en UTC, déjà le 16 à Paris) puis relu
      // avec un instant clairement dans la journée du 16 à Paris : une
      // implémentation en UTC les traiterait comme deux jours différents et
      // rendrait 0 à tort.
      const finDeJournee = new Date('2026-01-15T23:30:00.000Z');
      const lendemainMatin = new Date('2026-01-16T09:00:00.000Z');
      ecrireDecideesDuJour(2, finDeJournee);
      expect(lireDecideesDuJour(lendemainMatin)).toBe(2);
    },
  );

  it('traite une valeur corrompue en base comme 0, sans lever', () => {
    const maintenant = new Date('2026-06-15T10:00:00.000Z');
    window.localStorage.setItem('fast-travail:decidees:2026-06-15', 'pas-un-nombre');
    expect(lireDecideesDuJour(maintenant)).toBe(0);
  });

  it('rend 0 sans lever si `localStorage` est indisponible (navigation privée, quota)', () => {
    const espion = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('stockage indisponible');
    });

    expect(() => lireDecideesDuJour()).not.toThrow();
    expect(lireDecideesDuJour()).toBe(0);

    espion.mockRestore();
  });

  it("n'écrit rien de bloquant si `localStorage.setItem` échoue (quota dépassé)", () => {
    const espion = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota dépassé');
    });

    expect(() => ecrireDecideesDuJour(9)).not.toThrow();

    espion.mockRestore();
  });
});
