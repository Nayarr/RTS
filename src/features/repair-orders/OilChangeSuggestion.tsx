import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Droplet, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { NewLine } from '@/features/documents/lines';
import { supabase } from '@/lib/supabase';
import { todayIso } from './schemas';
import { oilChangeStatus, oilChangesOf } from './upcoming-work';
import { fetchUpcomingInput, findOilPackage } from './upcoming-work-api';

/** Kilométrage et véhicule de l'OR, relevés par le technicien. */
async function orderVehicle(repairOrderId: string) {
  const { data, error } = await supabase
    .from('repair_orders')
    .select('vehicle_id, vehicle_type, mileage')
    .eq('id', repairOrderId)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Devis et facture : écart de kilométrage depuis la dernière vidange plus grand que l'intervalle du
 * véhicule (40 000 km pour un poids lourd, 15 000 km pour un utilitaire) ; un bouton ajoute la vidange
 * (forfait vidange du type de véhicule, sinon une ligne de main d'œuvre).
 */
export function OilChangeSuggestion({
  repairOrderId,
  documentLines,
  laborRate,
  onAdd,
}: {
  repairOrderId: string;
  /** Désignations des lignes du document : vidange déjà là, rien à proposer. */
  documentLines: string[];
  laborRate: number;
  onAdd: (line: NewLine) => Promise<unknown>;
}) {
  const [pending, setPending] = useState(false);
  const suggestion = useQuery({
    queryKey: ['repair-orders', repairOrderId, 'oil-change'],
    queryFn: async () => {
      const order = await orderVehicle(repairOrderId);
      const input = await fetchUpcomingInput({
        vehicleId: order.vehicle_id,
        vehicleType: order.vehicle_type,
        mileage: order.mileage,
        orderId: repairOrderId,
      });
      const status = oilChangeStatus(
        { vehicleType: order.vehicle_type, mileage: order.mileage, changes: oilChangesOf(input) },
        todayIso(),
      );
      if (status?.reason !== 'km') return null;
      return {
        detail: status.detail,
        vehicleType: order.vehicle_type,
        pkg: await findOilPackage(order.vehicle_type),
      };
    },
  });
  const data = suggestion.data;
  if (!data || documentLines.some((line) => /vidange/i.test(line))) return null;

  const add = () => {
    const line: NewLine = data.pkg
      ? {
          line_type: 'package',
          description: data.pkg.details ? `${data.pkg.name}\n${data.pkg.details}` : data.pkg.name,
          unit_price: data.pkg.price,
          standard_hours: data.pkg.standard_hours,
          package_id: data.pkg.id,
          labor_category: data.pkg.category ?? data.vehicleType,
        }
      : {
          line_type: 'labor',
          description: 'Vidange',
          hours: 1,
          quantity: 1,
          unit_price: laborRate,
          labor_category: data.vehicleType,
        };
    setPending(true);
    onAdd(line)
      .catch(() => undefined) // l'erreur est déjà signalée par le document
      .finally(() => setPending(false));
  };

  return (
    <div
      className="alert s-warn row flex-wrap items-center gap-3"
      role="status"
      aria-label="Vidange à proposer"
    >
      <Droplet className="i" />
      <span className="min-w-0 flex-1">
        <b>Vidange à proposer</b> : {data.detail}.
      </span>
      <Button type="button" size="sm" disabled={pending} onClick={add}>
        <Plus /> Ajouter la vidange
      </Button>
    </div>
  );
}
