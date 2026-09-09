import { describe, expect, it } from 'vitest';
import { RELANCE_DUE_DAYS, joursDepuis, relanceDue } from './relance';

describe('joursDepuis', () => {
  it('compte les jours écoulés, arrondis vers le bas', () => {
    const maintenant = new Date('2026-09-09T10:00:00.000Z');
    expect(joursDepuis('2026-09-06T10:00:00.000Z', maintenant)).toBe(3);
  });

  it('ne rend jamais un compte négatif (horloge cliente en avance)', () => {
    const maintenant = new Date('2026-09-09T10:00:00.000Z');
    expect(joursDepuis('2026-09-10T10:00:00.000Z', maintenant)).toBe(0);
  });

  it('rend null sur une date absente', () => {
    expect(joursDepuis(null)).toBeNull();
  });

  it('rend null sur une date invalide', () => {
    expect(joursDepuis('pas une date')).toBeNull();
  });
});

describe('relanceDue', () => {
  it(`est fausse tant que moins de ${RELANCE_DUE_DAYS} jours se sont écoulés`, () => {
    const maintenant = new Date('2026-09-09T10:00:00.000Z');
    const appliedAt = new Date(maintenant.getTime() - (RELANCE_DUE_DAYS - 1) * 86_400_000);
    expect(relanceDue(appliedAt.toISOString(), maintenant)).toBe(false);
  });

  it(`devient vraie à ${RELANCE_DUE_DAYS} jours pile`, () => {
    const maintenant = new Date('2026-09-09T10:00:00.000Z');
    const appliedAt = new Date(maintenant.getTime() - RELANCE_DUE_DAYS * 86_400_000);
    expect(relanceDue(appliedAt.toISOString(), maintenant)).toBe(true);
  });

  it("n'affirme jamais de relance due sur un envoi inconnu (null)", () => {
    expect(relanceDue(null)).toBe(false);
  });
});
