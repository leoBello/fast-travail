import { describe, expect, it } from 'vitest';
import { parisDateKey } from './parisDate';

describe('parisDateKey', () => {
  it('formate en YYYY-MM-DD', () => {
    expect(parisDateKey(new Date('2026-06-15T12:00:00.000Z'))).toBe('2026-06-15');
  });

  it(
    'lit le jour EN HEURE DE PARIS, pas en UTC — un instant qui tombe sur deux jours ' +
      'civils différents selon le fuseau doit rendre la clé parisienne',
    () => {
      // 23:30 UTC le 15 janvier = 00:30 le 16 janvier à Paris (hiver, UTC+1).
      // Une implémentation en UTC rendrait '2026-01-15' ; la bonne réponse
      // est '2026-01-16'. Même piège que celui corrigé en tâche 6
      // (`dashboard-query.ts`, `parisDateKey`).
      expect(parisDateKey(new Date('2026-01-15T23:30:00.000Z'))).toBe('2026-01-16');
    },
  );

  it('applique le même décalage en été (UTC+2, heure d’été européenne)', () => {
    // 22:30 UTC le 14 juillet = 00:30 le 15 juillet à Paris (été, UTC+2).
    expect(parisDateKey(new Date('2026-07-14T22:30:00.000Z'))).toBe('2026-07-15');
  });

  it('utilise "maintenant" par défaut sans argument', () => {
    expect(parisDateKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
