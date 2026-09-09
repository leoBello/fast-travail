import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Tooltip } from './Tooltip';

// Base UI ouvre l'infobulle après un court délai de survol : les tests
// asynchrones lui laissent le temps, plutôt que d'échouer sur une race.
const ATTENTE_SURVOL = { timeout: 2000 };

describe('Tooltip', () => {
  it('garde le contenu hors du DOM tant que rien ne le demande', () => {
    render(
      <Tooltip contenu="Adzuna ne restitue que les 500 premiers caractères.">
        <button type="button">Confiance basse</button>
      </Tooltip>,
    );
    expect(screen.queryByText(/500 premiers/)).toBeNull();
  });

  it('révèle le contenu au survol', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip contenu="Adzuna ne restitue que les 500 premiers caractères.">
        <button type="button">Confiance basse</button>
      </Tooltip>,
    );
    await user.hover(screen.getByRole('button', { name: 'Confiance basse' }));
    expect(await screen.findByText(/500 premiers/, {}, ATTENTE_SURVOL)).toBeDefined();
  });

  it('rend l intitulé au-dessus du contenu, et non à la place', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip intitule="Confiance basse" contenu="Le modèle a jugé sur un texte coupé.">
        <button type="button">42</button>
      </Tooltip>,
    );
    await user.hover(screen.getByRole('button', { name: '42' }));
    const bulle = await screen.findByRole('tooltip', {}, ATTENTE_SURVOL);
    expect(bulle.textContent).toContain('Confiance basse');
    expect(bulle.textContent).toContain('texte coupé');
  });

  it('expose l infobulle au lecteur d écran, et la rattache à son déclencheur', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip contenu="Adzuna ne restitue que les 500 premiers caractères.">
        <button type="button">Confiance basse</button>
      </Tooltip>,
    );
    const declencheur = screen.getByRole('button', { name: 'Confiance basse' });
    await user.hover(declencheur);
    const bulle = await screen.findByRole('tooltip', {}, ATTENTE_SURVOL);

    const decrit = declencheur.getAttribute('aria-describedby');
    expect(decrit).not.toBeNull();
    expect(bulle.getAttribute('id')).toBe(decrit);
  });

  it('révèle le contenu au clavier seul, sans souris', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip contenu="Le repli tranche l unité et l affiche.">
        <button type="button">?</button>
      </Tooltip>,
    );
    await user.tab();
    expect(screen.getByRole('button', { name: '?' })).toBe(document.activeElement);
    expect(await screen.findByText(/Le repli tranche/, {}, ATTENTE_SURVOL)).toBeDefined();
  });
});
