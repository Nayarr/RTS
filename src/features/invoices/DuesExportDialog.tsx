import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';
import { ToggleChips } from '@/components/ListControls';
import { PdfPreviewDialog, type PdfFile } from '@/components/PdfPreviewDialog';
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
import { loadPdfContext } from '@/features/documents/pdf-context';
import { todayIso } from '@/features/repair-orders/schemas';
import { ACCOUNT_CHOICES, type AccountChoice } from '@/lib/account-type';
import { formatEuro } from '@/lib/numbers';
import { duesByClient, duesTotals, previousMonth } from './dues';
import { invoicesKey } from './hooks';
import { fetchDues } from './statement-api';

const ACCOUNTS = (Object.entries(ACCOUNT_CHOICES) as [AccountChoice, string][]).map(([value, label]) => ({
  value,
  label,
}));

const errorMessage = (error: unknown) =>
  error instanceof Error && error.message ? error.message : 'Export impossible';

/**
 * Sommes dues par les clients à l'instant de l'export : factures d'une période (le mois précédent
 * par défaut) encore à régler, pour les types de règlement choisis. PDF au format de l'extrait de compte.
 */
export function DuesExportDialog({ onClose }: { onClose: () => void }) {
  const initial = previousMonth(todayIso());
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [accounts, setAccounts] = useState<AccountChoice[]>([]);
  const [preview, setPreview] = useState<PdfFile | null>(null);
  // Relu à chaque ouverture : le reste dû est celui de maintenant
  const dues = useQuery({ queryKey: [...invoicesKey, 'dues'], queryFn: fetchDues, staleTime: 0 });

  const groups = useMemo(
    () =>
      dues.data
        ? duesByClient(dues.data.invoices, dues.data.clients, dues.data.vehicles, { from, to, accounts })
        : [],
    [dues.data, from, to, accounts],
  );
  const totals = duesTotals(groups);
  const invalid = !from || !to || from > to;

  const show = useMutation({
    mutationFn: async () => {
      const fresh = await dues.refetch();
      if (!fresh.data) throw new Error('Sommes dues indisponibles');
      const [{ settings, logo }, { buildDuesPdf }] = await Promise.all([
        loadPdfContext(),
        import('./dues-pdf'),
      ]);
      const { doc, fileName } = await buildDuesPdf({
        groups: duesByClient(fresh.data.invoices, fresh.data.clients, fresh.data.vehicles, {
          from,
          to,
          accounts,
        }),
        period: { from, to },
        accounts: accounts.map((value) => ACCOUNT_CHOICES[value]),
        company: settings.company,
        logo,
      });
      setPreview({ blob: doc.output('blob'), fileName });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <Dialog open={preview === null} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sommes dues par les clients</DialogTitle>
            <DialogDescription>
              Factures de la période encore à régler, reste dû à l’instant de l’export, un bloc par client
              comme l’extrait de compte.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="field">
              <Label htmlFor="dues-from">Factures du</Label>
              <Input
                id="dues-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="field">
              <Label htmlFor="dues-to">au</Label>
              <Input id="dues-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </div>
          </div>
          <div className="col gap-1.5">
            <span className="text-sm font-medium">Type de règlement</span>
            <ToggleChips
              label="Type de règlement"
              options={ACCOUNTS}
              values={accounts}
              onChange={setAccounts}
            />
            <span className="hint">Aucun choisi : tous les clients.</span>
          </div>
          <p className="text-sm" aria-live="polite">
            {dues.isPending
              ? 'Calcul…'
              : `${groups.length} client${groups.length > 1 ? 's' : ''} · ${groups.reduce((n, group) => n + group.rows.length, 0)} facture(s) · ${formatEuro(totals.due)} TTC dus`}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Fermer
            </Button>
            <Button disabled={invalid || dues.isPending || show.isPending} onClick={() => show.mutate()}>
              <FileText /> PDF des sommes dues
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PdfPreviewDialog file={preview} onClose={() => setPreview(null)} />
    </>
  );
}
