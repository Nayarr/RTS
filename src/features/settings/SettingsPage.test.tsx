import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import { fetchSettings, updateCompanySettings, updateLaborRates, type Settings } from './api';
import type * as SettingsApi from './api';
import { downloadBackup } from './backup';
import type * as BackupApi from './backup';
import { SettingsPage } from './SettingsPage';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof SettingsApi>()),
  fetchSettings: vi.fn(),
  updateCompanySettings: vi.fn(),
  updateLaborRates: vi.fn(),
}));
vi.mock('@/features/files/hooks', () => ({
  useFileUrl: () => ({ url: undefined, isPending: false, isError: false }),
  useUploadFile: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('./backup', async (importOriginal) => ({
  ...(await importOriginal<typeof BackupApi>()),
  downloadBackup: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const settings: Settings = {
  company: {
    id: true,
    legal_name: 'RAPID TRUCK SERVICE',
    legal_form: 'SASU',
    share_capital: '181 726 €',
    address_line: '19 rue Gaston Monmousseau',
    postal_code: '95190',
    city: 'Goussainville',
    email: 'atelier@rapidtruckservice.fr',
    phone: null,
    siren: '984 989 137',
    siret: '984 989 137 00018',
    vat_number: 'FR66984989137',
    rcs: 'RCS Pontoise',
    default_vat_rate: 20,
    payment_terms_days: 30,
    quote_validity_days: 30,
    invoice_legal_mentions: ['TVA sur les encaissements.'],
    logo_file_id: null,
    updated_at: '2026-09-28T00:00:00Z',
  },
  laborRates: [
    {
      category: 'pl',
      label: 'PL',
      labor_line_label: 'Main d’œuvre mécanique poids lourds niveau 1',
      hourly_rate: 90,
      updated_at: '2026-09-28T00:00:00Z',
    },
  ],
  app: {
    id: true,
    roadside_flat_fee: 60,
    roadside_price_per_km: 1.5,
    roadside_travel_hourly_rate: 90,
    workday_start: '09:00:00',
    workday_end: '18:00:00',
    lunch_start: '13:00:00',
    lunch_end: '14:00:00',
    friday_lunch_start: '12:30:00',
    daily_hours: 8,
    friday_hours: 7.5,
    overtime_start: '18:30:00',
    expected_arrival: '09:00:00',
    late_tolerance: '09:05:00',
    rest_reference_monday: null,
    clock_photo_retention_months: 3,
    label_scan_enabled: false,
    last_backup_at: null,
    updated_at: '2026-09-28T00:00:00Z',
  },
};

const renderSettings = (initialPath = '/reglages') => {
  vi.mocked(fetchSettings).mockResolvedValue(settings);
  return renderRoutes([{ path: '/reglages', element: <SettingsPage /> }], { initialPath });
};

describe('SettingsPage', () => {
  it('affiche les coordonnées ; rien à enregistrer tant que rien n’est modifié', async () => {
    renderSettings();
    expect(await screen.findByLabelText('Raison sociale')).toHaveValue('RAPID TRUCK SERVICE');
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });

  it('n’envoie que les coordonnées modifiées (pas d’écrasement des autres champs)', async () => {
    vi.mocked(updateCompanySettings).mockResolvedValue();
    renderSettings();
    await userEvent.type(await screen.findByLabelText('Téléphone'), '01 23 45 67 89');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updateCompanySettings).toHaveBeenCalledOnce());
    expect(vi.mocked(updateCompanySettings).mock.calls[0]?.[0]).toEqual({ phone: '01 23 45 67 89' });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Coordonnées enregistrées'));
  });

  it('bloque une saisie invalide sans appel', async () => {
    renderSettings();
    const siret = await screen.findByLabelText('SIRET');
    await userEvent.clear(siret);
    await userEvent.type(siret, '123');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('SIRET à 14 chiffres')).toBeInTheDocument();
    expect(updateCompanySettings).not.toHaveBeenCalled();
  });

  it('modifie un taux horaire', async () => {
    vi.mocked(updateLaborRates).mockResolvedValue();
    renderSettings();
    await userEvent.click(await screen.findByRole('tab', { name: 'Taux horaires' }));
    const rate = await screen.findByLabelText('Taux HT (€/h)');
    await userEvent.clear(rate);
    await userEvent.type(rate, '95');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updateLaborRates).toHaveBeenCalledOnce());
    expect(vi.mocked(updateLaborRates).mock.calls[0]?.[0]).toEqual([{ category: 'pl', hourly_rate: 95 }]);
  });

  it('affiche le refus de la base', async () => {
    vi.mocked(updateCompanySettings).mockRejectedValue(new Error('Modification réservée à la direction'));
    renderSettings();
    await userEvent.type(await screen.findByLabelText('Téléphone'), '0102030405');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Modification réservée à la direction'));
  });

  it('sauvegarde : ouverte depuis l’alerte, téléchargement puis confirmation', async () => {
    vi.mocked(downloadBackup).mockResolvedValue({
      app: 'RTS Atelier',
      format: 1,
      exported_at: '2026-09-29T08:00:00Z',
      schema_version: '20261019090000',
      tables: { clients: [{}, {}], invoices: [{}] },
    });
    renderSettings('/reglages?onglet=sauvegarde');
    expect(await screen.findByText('Aucune sauvegarde pour l’instant')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Télécharger la sauvegarde' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Sauvegarde téléchargée (3 lignes)'));
    expect(fetchSettings).toHaveBeenCalledTimes(2); // date de la dernière sauvegarde rechargée
  });
});
