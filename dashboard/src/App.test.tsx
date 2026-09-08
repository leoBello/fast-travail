import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App', () => {
  it("affiche le texte d'échafaudage", () => {
    render(<App />);
    // getByText lève si rien ne correspond : pas besoin d'un matcher jest-dom
    // supplémentaire pour prouver la présence de l'élément.
    expect(screen.getByText(/tableau de bord/i)).toBeTruthy();
  });
});
