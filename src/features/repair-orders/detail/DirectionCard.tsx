import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Pause, Trash2, Unlock } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { deleteRepairOrder, forceStopTimer, updateRepairOrder, type RepairOrderOverview } from '../api';
import { OPEN_STATUSES } from '../constants';
import { useRepairOrderMutation } from '../hooks';

/** Pilotage réservé à la direction : déblocage pour le technicien, arrêt du chrono, suppression. */
export function DirectionCard({ order }: { order: RepairOrderOverview }) {
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const closed = !OPEN_STATUSES.includes(order.status);

  const unlock = useRepairOrderMutation(
    () => updateRepairOrder(order.id, { status: 'in_progress' }),
    'OR débloqué pour le technicien',
  );
  const stopTimer = useRepairOrderMutation(() => forceStopTimer(order.id), 'Chrono arrêté');
  // Retour à la liste dès la suppression, avant le rechargement de la fiche (qui n'existe plus).
  const remove = useRepairOrderMutation(async () => {
    await deleteRepairOrder(order.id);
    await navigate('/or', { replace: true });
  }, `${order.number} supprimé`);

  return (
    <section data-slot="card" className="card" aria-labelledby="ro-direction">
      <div className="card-h">
        <h2 className="h2" id="ro-direction">
          Pilotage (direction)
        </h2>
      </div>
      <div className="card-b col gap-2">
        {order.running_since && closed && (
          <Button
            variant="destructive"
            className="w-full"
            disabled={stopTimer.isPending}
            onClick={() => stopTimer.mutate(undefined)}
          >
            <Pause /> Arrêter le chrono resté actif
          </Button>
        )}
        {closed && order.status !== 'invoiced' && (
          <Button
            variant="outline"
            className="w-full"
            disabled={unlock.isPending}
            onClick={() => unlock.mutate(undefined)}
          >
            <Unlock /> Débloquer pour le technicien
          </Button>
        )}
        {order.status !== 'invoiced' && (
          <Button
            variant="outline"
            className="w-full text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 /> Supprimer cet OR
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Supprimer ${order.number} ?`}
        description="L’OR, ses photos, sa fiche de contrôle et son historique seront supprimés définitivement."
        confirmLabel="Supprimer"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate(undefined)}
      />
    </section>
  );
}
