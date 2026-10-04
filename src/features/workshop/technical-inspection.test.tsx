import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import { readTechnicalInspection, updateDeadlines } from './api';
import type * as WorkshopApi from './api';
import { isVin, normalizeVin } from './domain';
import { TechnicalInspectionDialog } from './order/TechnicalInspectionDialog';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkshopApi>()),
  readTechnicalInspection: vi.fn(),
  updateDeadlines: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const renderDialog = (onClose = vi.fn()) => {
  renderRoutes([
    {
      path: '/',
      element: <TechnicalInspectionDialog fileId="f1" repairOrderId="ro1" vehicleId="v1" onClose={onClose} />,
    },
  ]);
  return { onClose };
};

describe('contrôle technique lu sur la photo', () => {
  it('VIN : majuscules, sans espaces ni tirets, 17 caractères sans I, O, Q', () => {
    expect(normalizeVin('vf6 1234-5678 901234')).toBe('VF612345678901234');
    expect(isVin('VF612345678901234')).toBe(true);
    expect(isVin('VF61234567890123O')).toBe(false);
  });

  it('échéance et VIN proposés, vérifiés puis enregistrés sur le véhicule', async () => {
    vi.mocked(readTechnicalInspection).mockResolvedValue({
      next_due_date: '2027-09-30',
      last_control_date: '2026-09-28',
      vin: 'VF612345678901234',
      label_text: 'Contrôle favorable · à présenter avant le 30/09/2027',
      confidence: 'haute',
    });
    vi.mocked(updateDeadlines).mockResolvedValue();
    const { onClose } = renderDialog();

    expect(await screen.findByLabelText('Prochain contrôle technique (modifiable)')).toHaveValue(
      '2027-09-30',
    );
    expect(screen.getByLabelText('VIN · numéro d’identification (modifiable)')).toHaveValue(
      'VF612345678901234',
    );
    expect(screen.getByText('28/09/2026')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    await waitFor(() =>
      expect(updateDeadlines).toHaveBeenCalledWith('ro1', {
        ct_due_date: '2027-09-30',
        vin: 'VF612345678901234',
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('VIN mal lu : corrigé à la main, refusé tant qu’il est invalide', async () => {
    vi.mocked(readTechnicalInspection).mockResolvedValue({
      next_due_date: null,
      last_control_date: null,
      vin: null,
      label_text: '',
      confidence: 'faible',
    });
    renderDialog();
    expect(
      await screen.findByText('Aucune date d’échéance trouvée sur la photo : saisis-la à la main.'),
    ).toBeInTheDocument();
    const vin = screen.getByLabelText('VIN · numéro d’identification (modifiable)');
    await userEvent.type(vin, 'vf6123');
    expect(screen.getByText('VIN : 17 caractères (lettres sauf I, O, Q, et chiffres)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider' })).toBeDisabled();
    await userEvent.type(vin, '45678901234');
    expect(vin).toHaveValue('VF612345678901234');
    expect(screen.getByRole('button', { name: 'Valider' })).toBeEnabled();
  });

  it('lecture impossible : message, la photo reste sur l’OR', async () => {
    vi.mocked(readTechnicalInspection).mockRejectedValue(
      new Error('Lecture automatique non configurée : saisis la date à la main'),
    );
    renderDialog();
    expect(await screen.findByRole('alert')).toHaveTextContent('Lecture automatique non configurée');
    expect(screen.queryByRole('button', { name: 'Valider' })).toBeNull();
  });
});
