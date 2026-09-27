import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { PdfFile } from '@/components/PdfPreviewDialog';
import { loadPdfContext } from '@/features/documents/pdf-context';
import { repairOrdersKey } from '@/features/repair-orders/hooks';
import {
  fetchBillableOrders,
  fetchCreditNotes,
  fetchInvoice,
  fetchInvoices,
  fetchRepairOrderInvoices,
  type CreditNote,
  type InvoiceDetail,
  type InvoiceOverview,
} from './api';
import { buildCreditNotePdf, buildInvoicePdf } from './invoice-pdf';

export const invoicesKey = ['invoices'] as const;
export const invoiceKey = (id: string) => ['invoices', id] as const;

export function useInvoices() {
  return useQuery({ queryKey: invoicesKey, queryFn: fetchInvoices, refetchOnWindowFocus: true });
}

export function useInvoice(id: string) {
  return useQuery({ queryKey: invoiceKey(id), queryFn: () => fetchInvoice(id) });
}

export function useRepairOrderInvoices(repairOrderId: string) {
  return useQuery({
    queryKey: [...invoicesKey, 'repair-order', repairOrderId],
    queryFn: () => fetchRepairOrderInvoices(repairOrderId),
  });
}

export function useCreditNotes() {
  return useQuery({ queryKey: [...invoicesKey, 'credit-notes'], queryFn: fetchCreditNotes });
}

export function useBillableOrders(enabled: boolean) {
  return useQuery({ queryKey: [...invoicesKey, 'billable-orders'], queryFn: fetchBillableOrders, enabled });
}

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Opération impossible';

/** Mutation de facturation : notification, puis rechargement des factures et des OR (statut « Facturé »). */
export function useInvoiceMutation<TArgs, TData = unknown>(
  mutationFn: (args: TArgs) => Promise<TData>,
  successMessage: string | ((data: TData, args: TArgs) => string) | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (data, args) => {
      if (successMessage !== null) {
        toast.success(typeof successMessage === 'function' ? successMessage(data, args) : successMessage);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: invoicesKey }),
        queryClient.invalidateQueries({ queryKey: repairOrdersKey }),
      ]);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
}

/** Aperçu PDF d'une facture (ou pro forma pour un brouillon) et des avoirs. */
export function useInvoicePdf() {
  const [file, setFile] = useState<PdfFile | null>(null);

  const invoicePdf = useMutation({
    mutationFn: async ({ detail, proforma }: { detail: InvoiceDetail; proforma: boolean }) => {
      const { settings, logo } = await loadPdfContext();
      const { doc, fileName } = await buildInvoicePdf({
        invoice: detail.invoice,
        lines: detail.lines,
        company: settings.company,
        logo,
        proforma: proforma
          ? { client: detail.client, paymentTermsDays: settings.company.payment_terms_days }
          : undefined,
      });
      setFile({ blob: doc.output('blob'), fileName });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const creditNotePdf = useMutation({
    mutationFn: async ({
      creditNote,
      invoice,
    }: {
      creditNote: CreditNote;
      invoice: Pick<InvoiceOverview, 'number' | 'issued_at' | 'client_name' | 'vehicle_label'>;
    }) => {
      const { settings, logo } = await loadPdfContext();
      const { doc, fileName } = await buildCreditNotePdf({
        creditNote,
        invoice,
        company: settings.company,
        logo,
      });
      setFile({ blob: doc.output('blob'), fileName });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return { file, close: () => setFile(null), invoicePdf, creditNotePdf };
}
