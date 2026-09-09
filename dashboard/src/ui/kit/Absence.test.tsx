import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Absence } from './Absence';
import type { AbsenceNature } from './Absence';

describe('Absence', () => {
  it('rend "non publiée" et "non précisée" comme un texte discret, pas un badge', () => {
    const { container } = render(<Absence nature="non-publiee">non publié par la source</Absence>);
    expect(screen.getByText('non publié par la source')).toBeDefined();
    expect(container.querySelector('[data-ton]')).toBeNull();
    expect(container.querySelector('[data-nature="non-publiee"]')).not.toBeNull();
  });

  it(
    'distingue "stack vide, texte coupé" de "stack vide, aucune techno" — ' +
      'même donnée (stack = []), deux causes opposées (GUIDELINES §3.1)',
    () => {
      const { container: coupe } = render(
        <Absence nature="texte-coupe">Non détectable — texte coupé</Absence>,
      );
      const { container: aucune } = render(
        <Absence nature="aucune-techno">Aucune techno reconnue</Absence>,
      );

      const tonCoupe = coupe.querySelector('[data-ton]')?.getAttribute('data-ton');
      const tonAucune = aucune.querySelector('[data-ton]')?.getAttribute('data-ton');

      // Le piège payé une fois pendant la conception : écrire « stack vide =
      // texte tronqué » aurait été faux sur 244 offres. Si ce test passait
      // avec les deux tons égaux, il ne protégerait plus rien.
      expect(tonCoupe).toBe('alerte');
      expect(tonAucune).toBe('neutre');
      expect(tonCoupe).not.toBe(tonAucune);
    },
  );

  it('rend "salaire non publié" comme un jeton discontinu, pas un badge', () => {
    const { container } = render(<Absence nature="salaire-non-publie">salaire non publié</Absence>);
    expect(screen.getByText('salaire non publié')).toBeDefined();
    expect(container.querySelector('[data-ton]')).toBeNull();
  });

  it('marque "unité incertaine" en ambre, comme "texte coupé" — ce sont deux avertissements, pas deux fautes', () => {
    const { container } = render(<Absence nature="unite-incertaine">unité incertaine</Absence>);
    expect(container.querySelector('[data-ton="alerte"]')).not.toBeNull();
  });

  it('marque "jugement en échec" en danger, seule nature à ce ton', () => {
    const { container } = render(<Absence nature="echec-jugement">Jugement en échec</Absence>);
    expect(container.querySelector('[data-ton="danger"]')).not.toBeNull();
    expect(container.querySelector('[data-discontinu="true"]')).not.toBeNull();
  });

  it('marque "hors périmètre" comme une absence de lecture, pas une mauvaise note', () => {
    const { container } = render(
      <Absence nature="hors-perimetre">Hors périmètre — jamais lue</Absence>,
    );
    // Neutre, pas danger : une offre non lue n'est pas une offre mal notée.
    expect(container.querySelector('[data-ton="neutre"]')).not.toBeNull();
  });

  it('porte `data-nature` pour chacune des huit natures répertoriées, sans jamais rendre une case vide', () => {
    const natures: AbsenceNature[] = [
      'non-publiee',
      'non-precisee',
      'texte-coupe',
      'aucune-techno',
      'salaire-non-publie',
      'unite-incertaine',
      'hors-perimetre',
      'echec-jugement',
    ];
    for (const nature of natures) {
      const { container, unmount } = render(<Absence nature={nature}>texte de test</Absence>);
      expect(container.querySelector(`[data-nature="${nature}"]`)).not.toBeNull();
      expect(screen.getByText('texte de test')).toBeDefined();
      unmount();
    }
  });
});
