import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { downloadFile } from '@/lib/csv';
import type * as CsvLib from '@/lib/csv';
import { renderRoutes } from '@/test/render';
import type { InvoiceOverview } from './api';
import { InvoiceExportDialog } from './InvoiceExportDialog';

vi.mock('@/lib/csv', async (importOriginal) => ({
  ...(await importOriginal<typeof CsvLib>()),
  downloadFile: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const invoice = (overrides: Partial<InvoiceOverview>): InvoiceOverview =>
  ({
    id: 'i1',
    number: 'F11887',
    status: 'issued',
    client_id: 'c1',
    client_name: 'Transports Martin',
    vehicle_label: 'GH-512-RT',
    issued_at: '2026-08-07T10:00:00Z',
    due_date: '2026-09-07',
    total_ht: 90,
    total_vat: 18,
    total_ttc: 108,
    paid_ttc: 0,
    credited_ttc: 0,
    balance_due: 108,
    repair_order_ids: [],
    repair_order_numbers: [],
    ...overrides,
  }) as InvoiceOverview;

const INVOICES = [
  invoice({}),
  invoice({ id: 'i2', number: 'F11888', paid_ttc: 50, balance_due: 58 }),
  invoice({ id: 'i3', number: 'F11889', paid_ttc: 108, balance_due: 0 }),
  invoice({
    id: 'i4',
    number: 'F11950',
    client_id: 'c2',
    client_name: 'Dupont',
    issued_at: '2026-10-02T10:00:00Z',
  }),
  invoice({ id: 'd', number: null, status: 'draft', issued_at: null }),
];

describe('export des factures', () => {
  it('période, client et états choisis : nombre et montants, CSV des factures retenues', async () => {
    renderRoutes([
      {
        path: '/',
        element: (
          <InvoiceExportDialog
            invoices={INVOICES}
            initialFrom="2026-08-01"
            initialTo="2026-09-30"
            onClose={vi.fn()}
          />
        ),
      },
    ]);
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/3 factures · 324,00\s€ TTC · reste dû 166,00\s€/);

    await userEvent.click(screen.getByRole('button', { name: 'Payées' }));
    expect(status).toHaveTextContent(/2 factures/);

    await userEvent.clear(screen.getByLabelText('Au'));
    expect(status).toHaveTextContent(/3 factures/);
    await userEvent.selectOptions(screen.getByLabelText('Client'), 'Transports Martin');
    expect(status).toHaveTextContent(/2 factures/);

    await userEvent.click(screen.getByRole('button', { name: 'Exporter' }));
    expect(downloadFile).toHaveBeenCalledWith(
      expect.stringContaining('F11888;'),
      'factures-du_2026-08-01.csv',
    );
    const csv = vi.mocked(downloadFile).mock.calls[0]![0] as string;
    expect(csv).toContain('F11887;');
    expect(csv).not.toContain('F11889');
    expect(csv).not.toContain('F11950');
  });
});
