import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import { readTailgateLabel, updateDeadlines } from './api';
import type * as WorkshopApi from './api';
import { daysUntil, tailgateVerdict } from './domain';
import { TailgateLabelDialog } from './order/TailgateLabelDialog';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkshopApi>()),
  readTailgateLabel: vi.fn(),
  updateDeadlines: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const renderDialog = (onApply = vi.fn(), onClose = vi.fn()) => {
  renderRoutes([
    {
      path: '/',
      element: (
        <TailgateLabelDialog
          fileId="f1"
          repairOrderId="ro1"
          vehicleId="v1"
          onApply={onApply}
          onClose={onClose}
        />
      ),
    },
  ]);
  return { onApply, onClose };
};

describe('étiquette du contrôle hayon', () => {
  it('verdict : à faire dans les 30 jours ou dépassé, sinon OK', () => {
    expect(daysUntil('2026-10-12', '2026-10-02')).toBe(10);
    expect(tailgateVerdict('2026-10-12', '2026-10-02')).toEqual({
      value: 'HS',
      label: 'À FAIRE · échéance dans 10 j',
    });
    expect(tailgateVerdict('2026-09-30', '2026-10-02').label).toBe('À FAIRE · dépassé depuis 2 j');
    expect(tailgateVerdict('2027-03-31', '2026-10-02')).toEqual({
      value: 'OK',
      label: 'OK · valable encore 180 jours',
    });
  });

  it('date lue proposée, vérifiée puis enregistrée avec le verdict', async () => {
    vi.mocked(readTailgateLabel).mockResolvedValue({
      next_due_date: '2099-03-31',
      last_control_date: '2098-09-01',
      label_text: 'Contrôle hayon 09/2098 · prochain 03/2099',
      confidence: 'haute',
    });
    vi.mocked(updateDeadlines).mockResolvedValue();
    const { onApply, onClose } = renderDialog();

    expect(
      await screen.findByText('Lu sur l’étiquette : « Contrôle hayon 09/2098 · prochain 03/2099 »'),
    ).toBeInTheDocument();
    expect(screen.getByText('01/09/2098')).toBeInTheDocument();
    expect(screen.getByLabelText('Prochain contrôle hayon (modifiable)')).toHaveValue('2099-03-31');
    expect(screen.getByText(/^OK · valable encore/)).toBeInTheDocument();
    expect(screen.queryByText(/Lecture incertaine/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    await waitFor(() =>
      expect(updateDeadlines).toHaveBeenCalledWith('ro1', { tailgate_due_date: '2099-03-31' }),
    );
    expect(onApply).toHaveBeenCalledWith('OK');
    expect(onClose).toHaveBeenCalled();
  });

  it('lecture incertaine ou sans date : le technicien vérifie ou saisit', async () => {
    vi.mocked(readTailgateLabel).mockResolvedValue({
      next_due_date: null,
      last_control_date: null,
      label_text: '',
      confidence: 'faible',
    });
    renderDialog();
    expect(
      await screen.findByText('Aucune date trouvée sur la photo : saisis-la à la main.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Prochain contrôle hayon (modifiable)'), '2000-01-15');
    expect(screen.getByText(/^À FAIRE · dépassé depuis/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider' })).toBeEnabled();
  });

  it('lecture impossible (pas de clé, photo illisible) : message, la photo reste sur l’OR', async () => {
    vi.mocked(readTailgateLabel).mockRejectedValue(
      new Error('Lecture automatique non configurée : saisis la date à la main'),
    );
    renderDialog();
    expect(await screen.findByRole('alert')).toHaveTextContent('Lecture automatique non configurée');
    expect(screen.queryByRole('button', { name: 'Valider' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Fermer' }).length).toBeGreaterThan(0);
  });
});
