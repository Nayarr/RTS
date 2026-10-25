import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { ToggleChips } from '@/components/ListControls';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { todayIso } from '@/features/repair-orders/schemas';
import { downloadFile, toCsv } from '@/lib/csv';
import { formatEuro } from '@/lib/numbers';
import type { InvoiceOverview } from './api';
import { invoicesCsvRows } from './domain';
import { SETTLEMENTS, statementInvoices, type Settlement } from './statement';

type Format = 'csv' | 'pdf' | 'zip';

const FORMATS: { value: Format; label: string; hint: string }[] = [
  { value: 'csv', label: 'CSV', hint: 'tableau pour la comptabilité (Excel)' },
  { value: 'pdf', label: 'PDF', hint: 'toutes les factures à la suite, en un seul fichier' },
  { value: 'zip', label: 'ZIP', hint: 'un PDF par facture' },
];

const errorMessage = (error: unknown) =>
  error instanceof Error && error.message ? error.message : 'Export impossible';

/** Export des factures émises : période, client, états de règlement choisis ; CSV, PDF unique ou ZIP. */
export function InvoiceExportDialog({
  invoices,
  initialFrom,
  initialTo,
  onClose,
}: {
  invoices: InvoiceOverview[];
  initialFrom: string;
  initialTo: string;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [clientId, setClientId] = useState('');
  const [settlements, setSettlements] = useState<Settlement[]>(['unpaid', 'partial', 'paid']);
  const [format, setFormat] = useState<Format>('csv');
  const [progress, setProgress] = useState<string | null>(null);

  const clients = useMemo(() => {
    const names = new Map<string, string>();
    for (const invoice of invoices)
      if (invoice.status === 'issued') names.set(invoice.client_id, invoice.client_name ?? '-');
    return [...names].sort((a, b) => a[1].localeCompare(b[1], 'fr'));
  }, [invoices]);

  const selected = useMemo(
    () =>
      statementInvoices(invoices, { from, to, settlements, credits: false })
        .filter((invoice) => !clientId || invoice.client_id === clientId)
        .sort(
          (a, b) =>
            (a.issued_at ?? '').localeCompare(b.issued_at ?? '') ||
            (a.number ?? '').localeCompare(b.number ?? '', 'fr', { numeric: true }),
        ),
    [invoices, from, to, settlements, clientId],
  );
  const totalTtc = selected.reduce((sum, invoice) => sum + invoice.total_ttc, 0);
  const totalDue = selected.reduce((sum, invoice) => sum + (invoice.balance_due ?? 0), 0);

  const run = useMutation({
    mutationFn: async () => {
      const period = [from && `du_${from}`, to && `au_${to}`].filter(Boolean).join('_') || todayIso();
      if (format === 'csv') {
        const { headers, rows } = invoicesCsvRows(selected);
        downloadFile(toCsv(headers, rows), `factures-${period}.csv`);
        return;
      }
      const { buildInvoiceFiles, mergePdfs, zipFiles } = await import('./invoice-bundle');
      setProgress(`Préparation des factures : 0 sur ${selected.length}`);
      const files = await buildInvoiceFiles(selected, (done, total) =>
        setProgress(`Préparation des factures : ${done} sur ${total}`),
      );
      if (format === 'pdf')
        downloadFile(await mergePdfs(files.map((file) => file.bytes)), `Factures_${period}.pdf`);
      else downloadFile(await zipFiles(files), `Factures_${period}.zip`);
    },
    onSuccess: () => {
      toast.success(
        `${selected.length} facture${selected.length > 1 ? 's' : ''} exportée${selected.length > 1 ? 's' : ''}`,
      );
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => setProgress(null),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && !run.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Exporter des factures</DialogTitle>
          <DialogDescription>
            Factures émises, par date de facture. Choisis la période, le client et les états voulus.
          </DialogDescription>
        </DialogHeader>
        <div className="col gap-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="field">
              <Label htmlFor="export-from">Du</Label>
              <Input
                id="export-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="field">
              <Label htmlFor="export-to">Au</Label>
              <Input id="export-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </div>
          </div>
          <div className="field">
            <Label htmlFor="export-client">Client</Label>
            <select
              id="export-client"
              className="inp"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
            >
              <option value="">Tous les clients</option>
              {clients.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="text-sm font-medium">États</span>
            <ToggleChips
              label="États des factures exportées"
              values={settlements}
              onChange={setSettlements}
              options={SETTLEMENTS}
            />
          </div>
          <fieldset className="field">
            <legend className="text-sm font-medium">Format</legend>
            <div className="col gap-1.5">
              {FORMATS.map((option) => (
                <label key={option.value} className="row items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="export-format"
                    value={option.value}
                    checked={format === option.value}
                    onChange={() => setFormat(option.value)}
                  />
                  <b>{option.label}</b>
                  <span className="hint">{option.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-[13.5px]" role="status">
            {progress ??
              (selected.length === 0
                ? 'Aucune facture pour ces choix.'
                : `${selected.length} facture${selected.length > 1 ? 's' : ''} · ${formatEuro(totalTtc)} TTC · reste dû ${formatEuro(totalDue)}`)}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={run.isPending}>
            Fermer
          </Button>
          <Button onClick={() => run.mutate()} disabled={run.isPending || selected.length === 0}>
            <Download /> Exporter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
