import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Receipt } from 'lucide-react';
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
import type { RepairOrderOverview } from '@/features/repair-orders/api';
import { todayIso } from '@/features/repair-orders/schemas';
import { useSettings } from '@/features/settings/hooks';
import { formatEuro } from '@/lib/numbers';
import { useInvoiceMutation } from './hooks';
import { buildParkingInvoice, parkingDays, parkingRate } from './parking';

const VEHICLE_LABELS: Record<string, string> = {
  pl: 'poids lourd',
  vul: 'véhicule utilitaire',
  remorque: 'remorque',
};

/**
 * « Facturer le stationnement » : le bureau indique quand le véhicule devait partir (et quand il est
 * parti) ; un brouillon de facture est créé au tarif du type de véhicule.
 */
export function ParkingInvoiceDialog({
  order,
  onClose,
}: {
  order: Pick<RepairOrderOverview, 'id' | 'vehicle_type' | 'planned_date' | 'planned_end_date'>;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const settings = useSettings();
  const [plannedDate, setPlannedDate] = useState(order.planned_end_date ?? order.planned_date ?? '');
  const [leftDate, setLeftDate] = useState(todayIso());
  const company = settings.data?.company;
  const rate = company ? parkingRate(company, order.vehicle_type) : null;
  const days = parkingDays(plannedDate, leftDate);

  const create = useInvoiceMutation(async () => {
    const id = await buildParkingInvoice({ repairOrderId: order.id, plannedDate, leftDate });
    onClose();
    await navigate(`/factures/${id}`);
  }, 'Facture de stationnement préparée');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Facturer le stationnement</DialogTitle>
          <DialogDescription>
            Quand le véhicule devait-il partir ? Chaque jour en plus jusqu’au départ est facturé.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="field">
            <Label htmlFor="parking-planned">Départ prévu le</Label>
            <Input
              id="parking-planned"
              type="date"
              value={plannedDate}
              max={leftDate}
              onChange={(event) => setPlannedDate(event.target.value)}
            />
          </div>
          <div className="field">
            <Label htmlFor="parking-left">Parti le</Label>
            <Input
              id="parking-left"
              type="date"
              value={leftDate}
              onChange={(event) => setLeftDate(event.target.value)}
            />
          </div>
        </div>
        <p className="alert s-blue" role="status" aria-label="Montant du stationnement">
          {days > 0 && rate !== null
            ? `Stationné ${days} jour${days > 1 ? 's' : ''} de trop : ${days} × ${formatEuro(rate)} HT (${
                VEHICLE_LABELS[order.vehicle_type] ?? 'véhicule'
              }) = ${formatEuro(days * rate)} HT`
            : 'Indique une date de départ prévue avant le départ du véhicule.'}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={days <= 0 || create.isPending} onClick={() => create.mutate(undefined)}>
            <Receipt /> Générer la facture
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
