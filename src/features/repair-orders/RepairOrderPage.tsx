import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { useProfile } from '@/features/auth/useProfile';
import { RepairOrderInvoiceCard } from '@/features/invoices/RepairOrderInvoiceCard';
import { PrepareQuoteButton, RepairOrderQuotesCard } from '@/features/quotes/RepairOrderQuotesCard';
import { updateRepairOrder, type RepairOrderOverview } from './api';
import { ClientMessagesCard } from './detail/ClientMessagesCard';
import { ConsumablesCard } from './detail/ConsumablesCard';
import { DirectionCard } from './detail/DirectionCard';
import { HistoryCard } from './detail/HistoryCard';
import { InspectionCard } from './detail/InspectionCard';
import { LinesCard } from './detail/LinesCard';
import { OfficeInfoForm } from './detail/OfficeInfoForm';
import { OrderHeader } from './detail/OrderHeader';
import { PartsCard } from './detail/PartsCard';
import { PhotosCard } from './detail/PhotosCard';
import { SubcontractsCard } from './detail/SubcontractsCard';
import { TimeCard } from './detail/TimeCard';
import { useRepairOrder, useRepairOrderMutation, useRepairOrderSupplies } from './hooks';
import { PreQuoteWorkCard } from './PreQuoteWorkCard';

/** Travaux terminés (ou devis à faire) : l'OR passe en « Facture à faire ». */
function ValidateButton({ order }: { order: RepairOrderOverview }) {
  const validate = useRepairOrderMutation(
    () => updateRepairOrder(order.id, { status: 'to_invoice' }),
    'OR validé : facture à faire',
  );
  if (order.status !== 'work_done' && order.status !== 'quote_pending') return null;
  return (
    <Button onClick={() => validate.mutate(undefined)} disabled={validate.isPending}>
      <CheckCircle2 /> Valider → Facture à faire
    </Button>
  );
}

/** Fiche d'un OR côté bureau. */
export function RepairOrderPage() {
  const { id = '' } = useParams();
  const detail = useRepairOrder(id);
  const supplies = useRepairOrderSupplies(id);
  const { data: profile } = useProfile();
  const isDirection = profile?.role === 'direction';

  const header = (number?: string, actions?: ReactNode) => (
    <PageHeader
      back={{ to: '/or', label: 'Retour aux ordres de réparation' }}
      crumbs={[
        { label: 'Atelier' },
        { label: 'Ordres de réparation', to: '/or' },
        { label: number ?? 'Fiche' },
      ]}
      title="Fiche OR"
      actions={actions}
    />
  );

  if (detail.isPending) {
    return (
      <>
        {header()}
        <p className="text-muted-foreground">Chargement…</p>
      </>
    );
  }
  if (detail.isError) {
    return (
      <>
        {header()}
        <p className="text-destructive">Impossible de charger cet OR.</p>
      </>
    );
  }
  if (!detail.data) {
    return (
      <>
        {header()}
        <div className="col items-center gap-4 py-16 text-center">
          <h2 className="title">OR introuvable</h2>
          <p className="muted">Il a peut-être été supprimé.</p>
          <Button asChild>
            <Link to="/or">Retour aux ordres de réparation</Link>
          </Button>
        </div>
      </>
    );
  }

  const { order, lines, photos, inspection } = detail.data;
  // Un OR facturé est figé (la base le refuse aussi) : correction par avoir.
  const editable = order.status !== 'invoiced';

  return (
    <>
      {header(
        order.number,
        <>
          {editable && <PrepareQuoteButton order={order} variant="outline" />}
          <ValidateButton order={order} />
        </>,
      )}
      <OrderHeader order={order} />
      <OfficeInfoForm order={order} />
      <div className="split grid-cols-1! xl:grid-cols-[minmax(0,1fr)_380px]!">
        <div className="col gap-5">
          <PreQuoteWorkCard repairOrderId={order.id} />
          <LinesCard lines={lines} />
          <PartsCard
            repairOrderId={order.id}
            lines={lines}
            partSuppliers={supplies.data?.partSuppliers ?? {}}
            editable={editable}
          />
          {supplies.data && (
            <>
              <SubcontractsCard
                repairOrderId={order.id}
                subcontracts={supplies.data.subcontracts}
                editable={editable}
              />
              <ConsumablesCard
                repairOrderId={order.id}
                consumables={supplies.data.consumables}
                editable={editable}
              />
            </>
          )}
          {supplies.isError && (
            <p className="text-destructive">Impossible de charger la sous-traitance et les consommables.</p>
          )}
          <PhotosCard photos={photos} missingLabels={order.missing_photo_labels} />
          <InspectionCard data={inspection} />
        </div>
        <div className="col gap-5">
          <TimeCard order={order} loadedAt={detail.dataUpdatedAt} showComparison={isDirection} />
          <RepairOrderInvoiceCard order={order} />
          <RepairOrderQuotesCard order={order} />
          <ClientMessagesCard order={order} />
          <HistoryCard repairOrderId={order.id} />
          {isDirection && <DirectionCard order={order} />}
        </div>
      </div>
    </>
  );
}
