import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchProfile } from '@/features/auth/api';
import type * as AuthApi from '@/features/auth/api';
import type { Profile } from '@/features/auth/roles';
import { loadPdfContext } from '@/features/documents/pdf-context';
import type { Settings } from '@/features/settings/api';
import { fakeSession, renderRoutes } from '@/test/render';
import { TECHNICIAN_TOPICS } from './help-content';
import { HelpPage } from './HelpPage';
import { buildTechnicianMemoPdf } from './memo-pdf';

vi.mock('@/features/auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthApi>()),
  fetchProfile: vi.fn(),
}));
vi.mock('@/features/documents/pdf-context', () => ({ loadPdfContext: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const company = {
  legal_name: 'RAPID TRUCK SERVICE',
  address_line: '19 rue Gaston Monmousseau',
  postal_code: '95190',
  city: 'Goussainville',
} as Settings['company'];

const profile = (role: Profile['role']): Profile => ({
  id: 'u1',
  email: `${role}@test.fr`,
  full_name: role,
  role,
  is_active: true,
  created_at: '2026-09-27T00:00:00Z',
  updated_at: '2026-09-27T00:00:00Z',
});

const renderHelp = () =>
  renderRoutes([{ path: '/aide', element: <HelpPage /> }], {
    initialPath: '/aide',
    auth: { session: fakeSession() },
  });

beforeEach(() => {
  vi.mocked(loadPdfContext).mockResolvedValue({ settings: { company } as Settings, logo: null });
  URL.createObjectURL = vi.fn(() => 'blob:memo');
  URL.revokeObjectURL = vi.fn();
});

describe('aide', () => {
  it('technicien : ses sujets et les questions fréquentes seulement', async () => {
    vi.mocked(fetchProfile).mockResolvedValue(profile('technician'));
    renderHelp();
    expect(await screen.findByRole('region', { name: 'Pour les techniciens' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Questions fréquentes' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Pour la réception et la direction' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Pour la direction' })).toBeNull();
  });

  it('direction : toutes les sections ; un sujet s’ouvre au clic', async () => {
    vi.mocked(fetchProfile).mockResolvedValue(profile('direction'));
    renderHelp();
    const office = await screen.findByRole('region', { name: 'Pour la réception et la direction' });
    expect(screen.getByRole('region', { name: 'Pour la direction' })).toBeInTheDocument();
    const invoicing = within(office).getByText('Facturer').closest('details')!;
    expect(invoicing).not.toHaveAttribute('open');
    await userEvent.click(within(office).getByText('Facturer'));
    expect(invoicing).toHaveAttribute('open');
    expect(invoicing).toHaveTextContent('Générer un avoir');
  });

  it('réception : pas la section de la direction', async () => {
    vi.mocked(fetchProfile).mockResolvedValue(profile('reception'));
    renderHelp();
    expect(
      await screen.findByRole('region', { name: 'Pour la réception et la direction' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Pour la direction' })).toBeNull();
  });

  it('mémo technicien : aperçu du PDF', async () => {
    vi.mocked(fetchProfile).mockResolvedValue(profile('technician'));
    renderHelp();
    await userEvent.click(await screen.findByRole('button', { name: 'Fiche mémo technicien (PDF)' }));
    expect(await screen.findByTitle('Aperçu du PDF')).toHaveAttribute('src', 'blob:memo');
    expect(screen.getByText('Memo_technicien.pdf')).toBeInTheDocument();
  });

  it('le PDF du mémo reprend chaque sujet des techniciens', async () => {
    const { doc } = await buildTechnicianMemoPdf(company, null);
    const text = doc.output();
    expect(text).toMatch(/M.{1,4}MO TECHNICIEN/); // « É » encodé dans le PDF
    for (const [index] of TECHNICIAN_TOPICS.entries()) expect(text).toContain(`${index + 1}. `);
    expect(text).toContain('Terminer');
  });
});
