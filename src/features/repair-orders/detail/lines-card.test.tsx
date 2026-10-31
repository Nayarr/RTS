import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addLine, deleteLine, updateLine } from '@/features/workshop/api';
import type * as WorkshopApi from '@/features/workshop/api';
import { renderRoutes } from '@/test/render';
import type { RoLine } from '../api';
import { LinesCard } from './LinesCard';

vi.mock('@/features/workshop/api', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkshopApi>()),
  addLine: vi.fn(),
  updateLine: vi.fn(),
  deleteLine: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const line = (fields: Partial<RoLine>) =>
  ({
    id: fields.description,
    kind: 'planned',
    line_type: 'labor',
    visibility: 'all',
    estimated_hours: null,
    estimate_is_minimum: false,
    standard_hours: null,
    billed_hours: null,
    unit_price: null,
    quantity: 1,
    ...fields,
  }) as RoLine;

describe('intervention atelier', () => {
  it('forfaits des pneus : quantité et prix unitaire, pas leur temps de barème', () => {
    render(
      <LinesCard
        lines={[
          line({
            description: 'DÉPOSE/REPOSE PNEUMATIQUE (avant)',
            line_type: 'package',
            visibility: 'quote',
            standard_hours: 0,
            unit_price: 18,
            quantity: 2,
          }),
          line({ description: 'Remplacement Pneus avant', visibility: 'workshop', estimated_hours: 1 }),
          line({ description: 'Contrôle hayon', standard_hours: 0.5 }),
        ]}
      />,
    );
    expect(screen.getByText('2 × 18,00 € HT')).toBeInTheDocument();
    expect(screen.queryByText('0 h (barème)')).not.toBeInTheDocument();
    expect(screen.getByText('1 h')).toBeInTheDocument();
    expect(screen.getByText('0,5 h (barème)')).toBeInTheDocument();
  });
});

describe('intervention atelier : lignes modifiées par le bureau', () => {
  const lines = [
    line({ id: 'l1', description: 'Remplacement plaquettes', kind: 'done', position: 1, estimated_hours: 1 }),
    line({ id: 'l2', description: 'Disques avant', kind: 'planned', position: 1 }),
    line({ id: 'p1', description: 'Plaquettes', kind: 'planned', position: 2, line_type: 'part' }),
  ];
  const setup = () =>
    renderRoutes([{ path: '/', element: <LinesCard lines={lines} repairOrderId="ro1" editable /> }]);

  beforeEach(() => {
    vi.mocked(addLine)
      .mockReset()
      .mockResolvedValue({ id: 'new' } as RoLine);
    vi.mocked(updateLine).mockReset().mockResolvedValue();
    vi.mocked(deleteLine).mockReset().mockResolvedValue();
  });

  it('texte d’une ligne modifié', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Modifier : Remplacement plaquettes' }));
    const text = screen.getByRole('textbox', { name: 'Texte de la ligne : Remplacement plaquettes' });
    await userEvent.clear(text);
    await userEvent.type(text, 'Remplacement plaquettes et disques avant');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(updateLine).toHaveBeenCalledWith('l1', {
        description: 'Remplacement plaquettes et disques avant',
      }),
    );
  });

  it('ligne ajoutée à prévoir, après les pièces, avec son temps', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une ligne (à prévoir)' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Nouvelle ligne (à prévoir)' }), 'Géométrie');
    await userEvent.type(screen.getByRole('textbox', { name: 'Temps en heures (à prévoir)' }), '1,5');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(addLine).toHaveBeenCalledWith('ro1', 'planned', 3, 'Géométrie'));
    await waitFor(() => expect(updateLine).toHaveBeenCalledWith('new', { estimated_hours: 1.5 }));
  });

  it('ligne supprimée après confirmation ; pièces jamais proposées ici', async () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Supprimer : Plaquettes' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer : Disques avant' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Supprimer cette ligne ?' })).getByRole('button', {
        name: 'Supprimer',
      }),
    );
    await waitFor(() => expect(deleteLine).toHaveBeenCalledWith('l2'));
  });

  it('OR facturé : lecture seule', () => {
    render(<LinesCard lines={lines} repairOrderId="ro1" editable={false} />);
    expect(screen.queryByRole('button', { name: /Modifier|Supprimer|Ajouter une ligne/ })).toBeNull();
  });
});
