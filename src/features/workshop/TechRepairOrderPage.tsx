import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Lock } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
      <div className="space-y-4 py-16 text-center">
        <h1 className="text-2xl font-bold">OR introuvable</h1>
        <p className="text-muted-foreground">Il ne t’est peut-être plus assigné.</p>
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
    <div className="mx-auto max-w-2xl space-y-4 pb-10">
      {capture.inputs}
      <Button variant="ghost" asChild className="-ml-3">
        <Link to="/">
          <ArrowLeft /> Mes OR
        </Link>
      </Button>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold tracking-wide">{order.plate}</h1>
              <p className="text-muted-foreground">
                {order.client_name ?? ''} · {VEHICLE_TYPES[order.vehicle_type]} · {order.number}
              </p>
            </div>
            <StatusBadge status={order.status} className="px-3 py-1 text-sm" />
          </div>
          <p className="text-lg whitespace-pre-line">{order.requested_work}</p>
        </CardContent>
      </Card>

      {locked && (
        <Alert>
          <Lock />
          <AlertDescription>Cet OR est terminé : consultation seulement.</AlertDescription>
        </Alert>
      )}

      <TimerSection order={order} loadedAt={detail.dataUpdatedAt} locked={locked} />
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
      <WorkLinesSection repairOrderId={order.id} lines={lines} locked={locked} />
      <PartsSection lines={lines} />
      {!locked && <FinishSection repairOrderId={order.id} />}
    </div>
  );
}
