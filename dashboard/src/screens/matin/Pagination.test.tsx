import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from './Pagination';
import { numerosDePage } from './paginationLogic';

describe('numerosDePage', () => {
  it('rend toutes les pages quand il y en a peu', () => {
    expect(numerosDePage(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('replie le milieu par une ellipse quand il y en a beaucoup', () => {
    expect(numerosDePage(1, 158)).toEqual([1, 2, 3, 4, 'ellipse', 158]);
  });

  it('garde la page courante entourée de ses voisines', () => {
    expect(numerosDePage(63, 158)).toEqual([1, 'ellipse', 62, 63, 64, 'ellipse', 158]);
  });

  it('ne rend rien quand il n’y a qu’une page', () => {
    expect(numerosDePage(1, 1)).toEqual([]);
  });
});

describe('Pagination', () => {
  const base = {
    debut: 1,
    fin: 8,
    total: 1258,
    onSuivant: vi.fn(),
    onPrecedent: vi.fn(),
    suivantDisponible: true,
    precedentDisponible: false,
  };

  it('sans numérotation : aucun bouton de page (le rendu de la bande)', () => {
    render(<Pagination {...base} />);
    expect(screen.queryByRole('button', { name: 'Page 2' })).toBeNull();
  });

  it('sans numérotation : Précédentes/Suivantes restent enfants directs de la pagination, sans groupe imbriqué', () => {
    const { container } = render(<Pagination {...base} precedentDisponible={true} />);
    const pagination = container.querySelector('[class*="pagination"]');
    expect(pagination).not.toBeNull();
    expect(container.querySelector('[class*="navGroup"]')).toBeNull();

    const boutonPrecedent = screen.getByRole('button', { name: 'Précédentes' });
    const boutonSuivant = screen.getByRole('button', { name: 'Suivantes' });
    expect(boutonPrecedent.parentElement).toBe(pagination);
    expect(boutonSuivant.parentElement).toBe(pagination);
  });

  it('avec numérotation : les boutons de navigation sont dans un groupe imbriqué distinct', () => {
    const { container } = render(
      <Pagination
        {...base}
        precedentDisponible={true}
        numerotation={{ page: 3, pageCount: 158, onPageChange: vi.fn(), pageSize: 8 }}
      />,
    );
    const pagination = container.querySelector('[class*="pagination"]');
    const navGroup = container.querySelector('[class*="navGroup"]');
    expect(pagination).not.toBeNull();
    expect(navGroup).not.toBeNull();
    expect(navGroup?.parentElement).toBe(pagination);

    const boutonPrecedent = screen.getByRole('button', { name: 'Précédentes' });
    const boutonSuivant = screen.getByRole('button', { name: 'Suivantes' });
    const boutonPage = screen.getByRole('button', { name: 'Page 3' });
    expect(boutonPrecedent.parentElement).toBe(navGroup);
    expect(boutonSuivant.parentElement).toBe(navGroup);
    expect(boutonPage.parentElement).toBe(navGroup);
  });

  it('avec numérotation : la page courante porte aria-current', () => {
    render(
      <Pagination
        {...base}
        numerotation={{ page: 1, pageCount: 158, onPageChange: vi.fn(), pageSize: 8 }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Page 1' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('un clic sur un numéro remonte cette page', async () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        {...base}
        numerotation={{ page: 1, pageCount: 158, onPageChange, pageSize: 8 }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('une seule page : aucun numéro affiché', () => {
    render(
      <Pagination
        {...base}
        fin={6}
        total={6}
        suivantDisponible={false}
        numerotation={{ page: 1, pageCount: 1, onPageChange: vi.fn(), pageSize: 8 }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Page 1' })).toBeNull();
  });

  it('avec numérotation : le badge « N par page » est rendu avec la bonne taille de page (Main.dc.html)', () => {
    const { container } = render(
      <Pagination
        {...base}
        numerotation={{ page: 1, pageCount: 158, onPageChange: vi.fn(), pageSize: 10 }}
      />,
    );
    const badge = container.querySelector(
      '[data-ton="neutre"][data-taille="compacte"][data-discontinu="true"]',
    );
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('10 par page');
  });

  it('sans numérotation : aucun badge « par page » (la bande « Ce matin » ne le dessine pas)', () => {
    const { container } = render(<Pagination {...base} />);
    expect(container.querySelector('[data-discontinu="true"]')).toBeNull();
  });
});
