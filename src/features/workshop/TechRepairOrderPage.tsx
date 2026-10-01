import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProfile } from '@/features/auth/useProfile';
import { OPEN_STATUSES, VEHICLE_TYPES } from '@/features/repair-orders/constants';
import { useRepairOrder } from '@/features/repair-orders/hooks';
import { StatusBadge } from '@/features/repair-orders/StatusBadge';
import { markSeen } from './api';
import { seenKey } from './hooks';
import { DeadlinesSection } from './order/DeadlinesSection';
import { FinishSection } from './order/FinishSection';
import { InspectionEditor } from './order/InspectionEditor';
import { PartsSection } from './order/PartsSection';
import { PhotosSection } from './order/PhotosSection';
import { TimerSection } from './order/TimerSection';
import { usePhotoCapture } from './order/use-photo-capture';
import { WorkLinesSection } from './order/WorkLinesSection';

const REQUIRED_PHOTOS = ['Face avant', 'Côté gauche', 'Côté droit', 'Arrière', 'Tableau de bord'];

/** Fiche OR du technicien : kilométrage, chrono, photos, fiche de contrôle, travaux, clôture. */
export function TechRepairOrderPage() {
  const { id = '' } = useParams();
  const detail = useRepairOrder(id);
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const capture = usePhotoCapture(id);

  // Ouverture de l'OR : les badges « Nouveau » / « Modifié » disparaissent.
  const assignmentChangedAt = detail.data?.order.assignment_changed_at;
  useEffect(() => {
    if (!profile || !assignmentChangedAt) return;
    void markSeen(id, profile.id).then(() => queryClient.invalidateQueries({ queryKey: seenKey }));
  }, [id, profile, assignmentChangedAt, queryClient]);

  if (detail.isPending) return <p className="text-muted-foreground">Chargement…</p>;
  if (detail.isError || !detail.data) {
    return (
      <div className="col items-center gap-4 py-16 text-center">
        <h1 className="title">OR introuvable</h1>
        <p className="sub">Il ne t’est peut-être plus assigné.</p>
        <Button asChild>
          <Link to="/">Retour à mes OR</Link>
        </Button>
      </div>
    );
  }

  const { order, lines, photos, inspection } = detail.data;
  const locked = !OPEN_STATUSES.includes(order.status);
  // Pas de photo du tableau de bord sur une remorque (même règle que la base).
  const requiredLabels = REQUIRED_PHOTOS.filter(
    (label) => order.vehicle_type !== 'remorque' || label !== 'Tableau de bord',
  );

  return (
    <div className="col gap-3 pb-6">
      {capture.inputs}
      <header className="mbar sticky top-0 z-30 -mx-4 -mt-3.5 print:hidden">
        <div className="row min-w-0 gap-2.5">
          <Link to="/" className="ibtn shrink-0" aria-label="Retour à mes OR">
            <ArrowLeft className="size-[18px]" />
          </Link>
          <div className="col min-w-0 gap-0">
            <h1 className="plate text-xl leading-tight">{order.plate}</h1>
            <span className="hint truncate text-[11.5px]!">
              {[order.number, order.client_name, VEHICLE_TYPES[order.vehicle_type]]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        </div>
        <StatusBadge status={order.status} />
      </header>

      {locked && (
        <p className="alert s-grey">
          <Lock className="i s shrink-0" />
          <span>Cet OR est terminé : consultation seulement.</span>
        </p>
      )}

      <section data-slot="card" className="card sec" aria-label="Travaux demandés">
        <p className="text-[14.5px] leading-[1.45] whitespace-pre-line">{order.requested_work}</p>
      </section>

      <TimerSection order={order} loadedAt={detail.dataUpdatedAt} locked={locked} />
      <WorkLinesSection repairOrderId={order.id} lines={lines} locked={locked} />
      <PartsSection lines={lines} />
      <PhotosSection
        repairOrderId={order.id}
        photos={photos}
        requiredLabels={requiredLabels}
        capture={capture}
        locked={locked}
      />
      <InspectionEditor
        key={order.id}
        repairOrderId={order.id}
        initial={inspection}
        capture={capture}
        locked={locked}
      />
      <DeadlinesSection repairOrderId={order.id} vehicleId={order.vehicle_id} locked={locked} />
      {!locked && <FinishSection repairOrderId={order.id} />}
    </div>
  );
}
