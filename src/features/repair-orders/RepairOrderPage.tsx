import { Link, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProfile } from '@/features/auth/useProfile';
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
import { useRepairOrder, useRepairOrderSupplies } from './hooks';

/** Fiche d'un OR côté bureau. */
export function RepairOrderPage() {
  const { id = '' } = useParams();
  const detail = useRepairOrder(id);
  const supplies = useRepairOrderSupplies(id);
  const { data: profile } = useProfile();
  const isDirection = profile?.role === 'direction';

  if (detail.isPending) return <p className="text-muted-foreground">Chargement…</p>;
  if (detail.isError) return <p className="text-destructive">Impossible de charger cet OR.</p>;
  if (!detail.data) {
    return (
      <div className="space-y-4 py-16 text-center">
        <h1 className="text-2xl font-bold">OR introuvable</h1>
        <p className="text-muted-foreground">Il a peut-être été supprimé.</p>
        <Button asChild>
          <Link to="/or">Retour aux ordres de réparation</Link>
        </Button>
      </div>
    );
  }

  const { order, lines, photos, inspection } = detail.data;
  // Un OR facturé est figé (la base le refuse aussi) : correction par avoir.
  const editable = order.status !== 'invoiced';

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Button variant="ghost" asChild className="-ml-3">
        <Link to="/or">
          <ArrowLeft /> Ordres de réparation
        </Link>
      </Button>
      <OrderHeader order={order} />
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-5">
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
        <div className="space-y-5">
          <TimeCard order={order} loadedAt={detail.dataUpdatedAt} showComparison={isDirection} />
          <OfficeInfoForm order={order} />
          <HistoryCard repairOrderId={order.id} />
          {isDirection && <DirectionCard order={order} />}
        </div>
      </div>
    </div>
  );
}
