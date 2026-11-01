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
  it('verdict au mois : valable jusqu’à la fin du mois, à faire dans les 30 jours ou dépassé', () => {
    expect(daysUntil('2026-10-12', '2026-10-02')).toBe(10);
    // Mois d'octobre 2026 : valable jusqu'au 31/10
    expect(tailgateVerdict('2026-10-01', '2026-10-02')).toEqual({
      value: 'HS',
      label: 'À FAIRE · échéance dans 29 j',
    });
    expect(tailgateVerdict('2026-09-01', '2026-10-02').label).toBe('À FAIRE · dépassé depuis 2 j');
    expect(tailgateVerdict('2027-03-01', '2026-10-02')).toEqual({
      value: 'OK',
      label: 'OK · valable encore 180 jours',
    });
  });

  it('mois lu (MMAAAA) proposé, vérifié puis enregistré avec le verdict', async () => {
    vi.mocked(readTailgateLabel).mockResolvedValue({
      due_month: '032099',
      last_control_month: '092098',
      label_text: 'VGP Secure · mois 3 et année 99 percés',
      confidence: 'haute',
    });
    vi.mocked(updateDeadlines).mockResolvedValue();
    const { onApply, onClose } = renderDialog();

    expect(
      await screen.findByText('Lu sur l’étiquette : « VGP Secure · mois 3 et année 99 percés »'),
    ).toBeInTheDocument();
    expect(screen.getByText('09/2098')).toBeInTheDocument();
    expect(screen.getByLabelText('Prochain contrôle hayon (modifiable) : mois')).toHaveValue('03');
    expect(screen.getByLabelText('Prochain contrôle hayon (modifiable) : année')).toHaveValue('2099');
    expect(screen.getByText(/^OK · valable encore/)).toBeInTheDocument();
    expect(screen.queryByText(/Lecture incertaine/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    await waitFor(() =>
      expect(updateDeadlines).toHaveBeenCalledWith('ro1', { tailgate_due_date: '2099-03-01' }),
    );
    expect(onApply).toHaveBeenCalledWith('OK', '2099-03-01');
    expect(onClose).toHaveBeenCalled();
  });

  it('lecture incertaine ou sans mois : le technicien choisit le mois et l’année', async () => {
    vi.mocked(readTailgateLabel).mockResolvedValue({
      due_month: null,
      last_control_month: null,
      label_text: '',
      confidence: 'faible',
    });
    renderDialog();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Lecture impossible : renseigne les informations à la main.',
    );
    expect(screen.getByRole('button', { name: 'Valider' })).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Prochain contrôle hayon (modifiable) : mois'), '01');
    await userEvent.selectOptions(
      screen.getByLabelText('Prochain contrôle hayon (modifiable) : année'),
      String(new Date().getFullYear() - 1),
    );
    expect(screen.getByText(/^À FAIRE · dépassé depuis/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider' })).toBeEnabled();
  });

  it('lecture impossible (pas de clé, photo illisible) : message, la photo reste sur l’OR', async () => {
    vi.mocked(readTailgateLabel).mockRejectedValue(
      new Error('Lecture automatique non configurée : saisis la date à la main'),
    );
    renderDialog();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Lecture impossible : renseigne les informations à la main. (Lecture automatique non configurée',
    );
    expect(screen.queryByRole('button', { name: 'Valider' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Fermer' }).length).toBeGreaterThan(0);
  });
});
