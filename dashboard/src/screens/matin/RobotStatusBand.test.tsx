import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RobotStatusBand } from './RobotStatusBand';
import type { RobotStatusResult } from '../../data/types';

/** Un mercredi 10 septembre 2026, 7 h 12 à Paris (05 h 12 UTC en heure
 * d'été) — avant les crons de 8 h et 8 h 30, donc l'instant où l'état
 * « pas encore » est le vrai. */
const MAINTENANT = new Date('2026-09-10T05:12:00.000Z');
/** Le même jour, 8 h 30 à Paris. */
const CE_MATIN = '2026-09-10T06:30:00.000Z';
/** La veille, 8 h 30 à Paris. */
const HIER = '2026-09-09T06:30:00.000Z';

function rendre(etat: RobotStatusResult | null) {
  return render(<RobotStatusBand etat={etat} maintenant={MAINTENANT} />);
}

describe('RobotStatusBand', () => {
  it("n'affiche RIEN tant que la réponse n'est pas arrivée — ni coche, ni heure, ni zéro", () => {
    const { container } = rendre(null);
    expect(container.textContent).toBe('');
  });

  it('nominal : les deux robots ont tourné ce matin, à leur heure de Paris', () => {
    rendre({
      collecte: { etat: 'nominal', at: CE_MATIN },
      jugement: { etat: 'fait', at: CE_MATIN, count: 78 },
    });
    // Deux fois : la collecte et le jugement ont tourné à la même heure ici.
    expect(screen.getAllByText('8 h 30')).toHaveLength(2);
    expect(screen.getByText('78 jugées')).not.toBeNull();
    // Rien ne doit laisser croire à une exécution manquante.
    expect(screen.queryByText("pas encore aujourd'hui")).toBeNull();
  });

  it('partielle : le mot ET le nombre de sources incomplètes, pas seulement une couleur', () => {
    rendre({
      collecte: { etat: 'partielle', at: CE_MATIN, sourcesIncompletes: 1, sourcesTotal: 4 },
      jugement: { etat: 'fait', at: CE_MATIN, count: 78 },
    });
    expect(screen.getByText(/partielle/)).not.toBeNull();
    expect(screen.getByText('1 source sur 4 incomplète')).not.toBeNull();
  });

  it('en échec : le mot, et la dernière réussite datée « hier »', () => {
    rendre({
      collecte: { etat: 'en_echec', at: CE_MATIN, derniereReussite: HIER },
      jugement: { etat: 'pas_encore' },
    });
    expect(screen.getByText(/en échec/)).not.toBeNull();
    expect(screen.getByText('hier 8 h 30')).not.toBeNull();
  });

  it('en échec sans aucune réussite connue : « jamais », pas une date inventée', () => {
    rendre({
      collecte: { etat: 'en_echec', at: CE_MATIN, derniereReussite: null },
      jugement: { etat: 'pas_encore' },
    });
    expect(screen.getByText('jamais')).not.toBeNull();
  });

  it("pas encore : l'heure de la veille est DATÉE, jamais rendue comme celle de ce matin", () => {
    rendre({
      collecte: { etat: 'pas_encore', derniere: HIER },
      jugement: { etat: 'pas_encore' },
    });
    // C'est tout l'objet de cette bande : « 8 h 30 » nu dirait que le robot
    // a tourné ce matin (GUIDELINES §3.3). Il doit porter « hier ».
    expect(screen.queryByText('8 h 30')).toBeNull();
    expect(screen.getByText('hier 8 h 30')).not.toBeNull();
    expect(screen.getAllByText("pas encore aujourd'hui")).toHaveLength(2);
  });

  it('jugement non fait : aucun compte affiché, pas même zéro', () => {
    rendre({
      collecte: { etat: 'nominal', at: CE_MATIN },
      jugement: { etat: 'pas_encore' },
    });
    expect(screen.queryByText(/jugée/)).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
  });
});
