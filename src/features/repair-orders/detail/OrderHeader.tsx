import { AlertTriangle, CheckCircle2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StoredImage } from '@/features/files/StoredImage';
import type { RepairOrderOverview } from '../api';
import { updateRepairOrder } from '../api';
import { formatDate, VEHICLE_TYPES } from '../constants';
import { useRepairOrderMutation } from '../hooks';
import { StatusBadge } from '../StatusBadge';

/** En-tête de la fiche OR : véhicule, client, statut, tâche demandée, signature du client. */
export function OrderHeader({ order }: { order: RepairOrderOverview }) {
  const validate = useRepairOrderMutation(
    () => updateRepairOrder(order.id, { status: 'to_invoice' }),
    'OR validé : facture à faire',
  );
  const readyForBilling = order.status === 'work_done' || order.status === 'quote_pending';

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-wide">{order.plate}</h1>
            <p className="text-muted-foreground">
              {order.client_name ?? 'Client non renseigné'} · {VEHICLE_TYPES[order.vehicle_type]}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(order.parts_pending_count ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-destructive px-3 py-1 text-sm font-semibold text-destructive">
                <Package className="size-4" /> Attente pièces ({order.parts_pending_count})
              </span>
            )}
            <StatusBadge status={order.status} className="px-3 py-1 text-sm" />
          </div>
        </div>

        <p className="text-base whitespace-pre-line">{order.requested_work}</p>

        <p className="text-sm text-muted-foreground">
          {order.number} · Technicien : {order.technician_name ?? 'non assigné'} · Créé le{' '}
          {formatDate(order.created_at)}
          {order.mileage !== null && ` · ${order.mileage.toLocaleString('fr-FR')} km`}
        </p>

        {order.customer_signature_file_id ? (
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-success" /> Signature client (accord avant intervention)
            </p>
            <StoredImage
              fileId={order.customer_signature_file_id}
              alt="Signature du client"
              className="h-24 w-56 border bg-white object-contain"
            />
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertTriangle className="size-4" /> Aucune signature client enregistrée.
          </p>
        )}

        {readyForBilling && (
          <Button onClick={() => validate.mutate(undefined)} disabled={validate.isPending}>
            <CheckCircle2 /> Valider → Facture à faire
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
