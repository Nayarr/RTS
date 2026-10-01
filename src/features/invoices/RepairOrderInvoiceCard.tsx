import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Receipt } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import type { RepairOrderOverview } from '@/features/repair-orders/api';
import { formatEuro } from '@/lib/numbers';
import { buildInvoiceDraft } from './api';
import { useInvoiceMutation, useRepairOrderInvoices } from './hooks';
import { InvoiceStatusBadge } from './PaymentStatusBadge';

/** Facture de l'OR : préparation du brouillon (« Facturer ») et suivi. */
export function RepairOrderInvoiceCard({ order }: { order: RepairOrderOverview }) {
  const navigate = useNavigate();
  const invoices = useRepairOrderInvoices(order.id);
  const prepare = useInvoiceMutation(async () => {
    const id = await buildInvoiceDraft([order.id]);
    await navigate(`/factures/${id}`);
  }, null);

  const [confirmUnfinished, setConfirmUnfinished] = useState(false);

  const list = invoices.data ?? [];
  const draft = list.find((invoice) => invoice.status === 'draft');
  const issued = list.some((invoice) => invoice.status === 'issued');
  // Une nouvelle facture n'est possible qu'après un avoir couvrant toute la précédente.
  const billed = list.some(
    (invoice) => invoice.status === 'issued' && (invoice.credited_ttc ?? 0) < (invoice.total_ttc ?? 0) - 0.01,
  );
  const unfinished = order.status === 'assigned' || order.status === 'in_progress';
  const facturer = () => (unfinished && !draft ? setConfirmUnfinished(true) : prepare.mutate(undefined));

  return (
    <section data-slot="card" className="card" aria-labelledby="ro-invoice">
      <div className="card-h">
        <h2 className="h2" id="ro-invoice">
          Facturation
        </h2>
      </div>
      <div className="card-b col gap-3">
        {list.length === 0 ? (
          <p className="muted">
            {order.status === 'to_invoice' ? 'OR validé : la facture est à faire.' : 'Pas encore facturé.'}
          </p>
        ) : (
          <ul>
            {list.map((invoice) => (
              <li key={invoice.id} className="row between gap-2 border-b py-2 last:border-b-0">
                <Link to={`/factures/${invoice.id}`} className="b ul">
                  {invoice.number ?? 'Brouillon'}
                  {invoice.repair_order_ids.length > 1 && ' (groupée)'}
                </Link>
                <span className="num text-[13px]">{formatEuro(invoice.total_ttc)}</span>
                <InvoiceStatusBadge invoice={invoice} />
              </li>
            ))}
          </ul>
        )}
        {!billed && (
          <Button
            variant={order.status === 'to_invoice' ? 'default' : 'outline'}
            className="w-full"
            disabled={prepare.isPending}
            onClick={facturer}
          >
            <Receipt /> {draft ? 'Reprendre la facture' : issued ? 'Refacturer (après avoir)' : 'Facturer'}
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirmUnfinished}
        onOpenChange={setConfirmUnfinished}
        title="OR pas encore terminé"
        description="Le technicien n’a pas terminé cet OR à l’atelier. Facturer quand même (acompte, travaux partiels) ?"
        confirmLabel="Facturer quand même"
        pending={prepare.isPending}
        onConfirm={() => {
          setConfirmUnfinished(false);
          prepare.mutate(undefined);
        }}
      />
    </section>
  );
}
