import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
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
import { groupByClient, nextMonthStart, previousMonth, scoreTechnicians } from './analysis';
import { fetchMonthlyReport, fetchProfitability, fetchTechnicianPerformance } from './api';
import { buildMonthlyReportPdf } from './monthly-report-pdf';

async function generate(month: string): Promise<PdfFile> {
  const range = { from: `${month}-01`, to: nextMonthStart(month) };
  const [report, profitability, performance, { settings, logo }] = await Promise.all([
    fetchMonthlyReport(range.from),
    fetchProfitability(range),
    fetchTechnicianPerformance(range),
    loadPdfContext(),
  ]);
  const { doc, fileName } = await buildMonthlyReportPdf(
    {
      report,
      clients: groupByClient(profitability).clients.slice(0, 5),
      technicians: scoreTechnicians(performance),
    },
    settings.company,
    logo,
  );
  return { blob: doc.output('blob'), fileName };
}

/** Choix du mois, puis aperçu du rapport PDF. */
export function MonthlyReportDialog({ onClose }: { onClose: () => void }) {
  const [month, setMonth] = useState(() => previousMonth(todayIso()));
  const [pdf, setPdf] = useState<PdfFile | null>(null);
  const build = useMutation({
    mutationFn: generate,
    onSuccess: setPdf,
    onError: () => toast.error('Échec du rapport'),
  });

  if (pdf) return <PdfPreviewDialog file={pdf} onClose={onClose} />;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rapport mensuel</DialogTitle>
          <DialogDescription>
            Chiffres clés, meilleurs clients, techniciens, factures à relancer et échéances des véhicules.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="report-month">Mois</Label>
          <Input
            id="report-month"
            type="month"
          
            max={todayIso().slice(0, 7)}
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={!month || build.isPending} onClick={() => build.mutate(month)}>
            {build.isPending ? 'Préparation…' : 'Générer le rapport PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
