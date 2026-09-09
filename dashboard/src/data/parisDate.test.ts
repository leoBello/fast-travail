import { describe, expect, it } from 'vitest';
import { formatJourHeure, parisDateKey } from './parisDate';

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

describe('formatJourHeure', () => {
  it('rend le jour de semaine et l’heure, en heure de Paris (été, UTC+2)', () => {
    // 13 h UTC le 11 septembre = 15 h à Paris (été, UTC+2) = vendredi.
    expect(formatJourHeure('2026-09-11T13:00:00.000Z')).toBe('vendredi 15 h');
  });

  it('applique le même décalage en hiver (UTC+1)', () => {
    // 13 h UTC le 15 janvier = 14 h à Paris (hiver, UTC+1) = jeudi.
    expect(formatJourHeure('2026-01-15T13:00:00.000Z')).toBe('jeudi 14 h');
  });

  it(
    'rend null sur MINUIT PILE heure de Paris — le cas limite tranché : ' +
      "`interview_at` est un timestamptz qu'un appelant peut renseigner avec une date " +
      'SEULE (ex. `"2026-09-11"`, minuit UTC). Rien ne distingue alors « rendez-vous à ' +
      'minuit » de « heure non saisie » ; le doute penche du côté de l’absence, comme une ' +
      'unité de rémunération incertaine (GUIDELINES §3.6) ne se pare jamais d’un montant sûr.',
    () => {
      // 22 h UTC le 10 septembre = minuit (00:00) le 11 septembre à Paris (été, UTC+2).
      expect(formatJourHeure('2026-09-10T22:00:00.000Z')).toBeNull();
    },
  );

  it('ne confond pas un horaire proche de minuit (23 h 59, 00 h 01) avec minuit pile', () => {
    // 21:59 UTC = 23:59 Paris (été) ; 22:01 UTC = 00:01 Paris (été).
    expect(formatJourHeure('2026-09-10T21:59:00.000Z')).toBe('jeudi 23 h');
    expect(formatJourHeure('2026-09-10T22:01:00.000Z')).toBe('vendredi 00 h');
  });

  it('rend null sur une date absente', () => {
    expect(formatJourHeure(null)).toBeNull();
  });

  it('rend null sur une date invalide', () => {
    expect(formatJourHeure('pas une date')).toBeNull();
  });
});
