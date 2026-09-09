import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResponseRateCard, TAUX_REPONSE_SEUIL_BRUT } from './ResponseRateCard';

describe('ResponseRateCard', () => {
  it("pendant le chargement, n'affiche ni fraction ni pourcentage", () => {
    render(<ResponseRateCard responseRate={null} chargement />);
    expect(screen.queryByText(/\//)).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('affiche le taux BRUT sous le seuil — un pourcentage y serait inventé', () => {
    render(<ResponseRateCard responseRate={{ responses: 1, sent: 5 }} chargement={false} />);
    expect(screen.getByText('1 / 5')).toBeDefined();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it(`affiche un pourcentage à partir de ${TAUX_REPONSE_SEUIL_BRUT} candidatures envoyées`, () => {
    render(
      <ResponseRateCard
        responseRate={{ responses: 5, sent: TAUX_REPONSE_SEUIL_BRUT }}
        chargement={false}
      />,
    );
    expect(screen.getByText('25 %')).toBeDefined();
    expect(screen.queryByText(`5 / ${TAUX_REPONSE_SEUIL_BRUT}`)).toBeNull();
  });

  it("n'échoue pas sur zéro envoi (0 / 0), sans division par zéro affichée", () => {
    render(<ResponseRateCard responseRate={{ responses: 0, sent: 0 }} chargement={false} />);
    expect(screen.getByText('0 / 0')).toBeDefined();
  });
});
