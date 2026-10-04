import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import { globalSearch, type SearchResults } from './api';
import { GlobalSearch } from './GlobalSearch';
import { searchSections } from './sections';

vi.mock('./api', () => ({ globalSearch: vi.fn() }));

const empty: SearchResults = { repair_orders: [], clients: [], vehicles: [], quotes: [], invoices: [] };

const results: SearchResults = {
  repair_orders: [
    {
      id: 'ro1',
      number: 'OR00012',
      status: 'in_progress',
      created_at: '2026-09-20T08:00:00Z',
      plate: 'AB-123-CD',
      client_name: 'Transports Dupont',
    },
  ],
  clients: [{ id: 'c1', name: 'Transports Dupont', phone: '06 12 34 56 78', email: null }],
  vehicles: [
    {
      id: 'v1',
      plate: 'AB-123-CD',
      vehicle_type: 'pl',
      brand: 'Renault Trucks',
      model: 'T 480',
      client_name: 'Transports Dupont',
    },
  ],
  quotes: [
    {
      id: 'q1',
      number: null,
      status: 'draft',
      created_at: '2026-09-21T08:00:00Z',
      plate: 'AB-123-CD',
      client_name: 'Transports Dupont',
    },
  ],
  invoices: [
    {
      id: 'i1',
      number: 'F11890',
      status: 'issued',
      created_at: '2026-09-22T08:00:00Z',
      issued_at: '2026-09-22T08:00:00Z',
      total_ttc: 1200,
      vehicle_label: 'AB-123-CD',
      client_name: 'Transports Dupont',
    },
  ],
};

beforeEach(() => {
  vi.mocked(globalSearch).mockResolvedValue(results);
});

const renderSearch = () =>
  renderRoutes(
    [
      {
        element: (
          <>
            <GlobalSearch />
            <Outlet />
          </>
        ),
        children: [
          { path: '/', element: <p>Accueil</p> },
          { path: '/or/:id', element: <h1>Fiche OR</h1> },
          { path: '/vehicules/:id', element: <h1>Fiche véhicule</h1> },
        ],
      },
    ],
    { initialPath: '/' },
  );

describe('recherche globale : règles', () => {
  it('sections dans l’ordre, liens et détails ; catégories vides masquées', () => {
    const sections = searchSections(results);
    expect(sections.map((s) => s.title)).toEqual([
      'Ordres de réparation',
      'Clients',
      'Véhicules',
      'Devis',
      'Factures',
    ]);
    expect(sections.map((s) => s.items[0])).toMatchObject([
      { to: '/or/ro1', title: 'OR00012 · AB-123-CD', detail: 'Transports Dupont · En cours · 20/09/2026' },
      { to: '/clients/c1', title: 'Transports Dupont', detail: '06 12 34 56 78' },
      { to: '/vehicules/v1', title: 'AB-123-CD', detail: 'PL · Renault Trucks T 480 · Transports Dupont' },
      { to: '/devis/q1', title: 'Devis sans numéro · AB-123-CD' },
      { to: '/factures/i1', title: 'F11890 · AB-123-CD' },
    ]);
    expect(sections[4]?.items[0]?.detail).toMatch(/Transports Dupont · 22\/09\/2026 · 1\s200,00\s€ TTC/);
    expect(searchSections({ ...empty, clients: results.clients }).map((s) => s.title)).toEqual(['Clients']);
  });
});

describe('recherche globale : écran', () => {
  it('Ctrl+K ouvre la recherche ; 2 caractères au moins ; clic sur un résultat', async () => {
    renderSearch();
    await userEvent.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Rechercher' });
    const input = within(dialog).getByRole('searchbox', { name: 'Rechercher partout' });
    expect(input).toHaveFocus();

    await userEvent.type(input, 'a');
    expect(within(dialog).getByText('Tape au moins 2 caractères.')).toBeInTheDocument();
    await userEvent.type(input, 'b12');
    const vehicles = await within(dialog).findByRole('region', { name: 'Véhicules' });
    expect(globalSearch).toHaveBeenLastCalledWith('ab12');
    expect(globalSearch).toHaveBeenCalledTimes(1); // saisie regroupée

    await userEvent.click(within(vehicles).getByRole('link', { name: /AB-123-CD/ }));
    expect(await screen.findByRole('heading', { name: 'Fiche véhicule' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Entrée ouvre le premier résultat ; aucun résultat', async () => {
    renderSearch();
    await userEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
    const input = screen.getByRole('searchbox', { name: 'Rechercher partout' });
    await userEvent.type(input, 'OR00012');
    await screen.findByRole('region', { name: 'Ordres de réparation' });
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Fiche OR' })).toBeInTheDocument();

    vi.mocked(globalSearch).mockResolvedValue(empty);
    await userEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher partout' }), 'zzz');
    await waitFor(() => expect(screen.getByText('Aucun résultat.')).toBeInTheDocument());
  });
});
