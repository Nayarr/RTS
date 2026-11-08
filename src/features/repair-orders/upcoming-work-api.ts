import { supabase } from '@/lib/supabase';
import type { RepairOrderOverview } from './api';
import type { UpcomingInput } from './upcoming-work';

/** Échéances du véhicule de l'OR et ses passages précédents à l'atelier (vidange, extincteurs). */
export async function fetchUpcomingInput(
  order: Pick<RepairOrderOverview, 'id' | 'vehicle_id' | 'vehicle_type' | 'mileage'>,
): Promise<UpcomingInput> {
  const [vehicle, orders] = await Promise.all([
    supabase
      .from('vehicles')
      .select('ct_due_date, tailgate_due_date, antipollution_due_date')
      .eq('id', order.vehicle_id)
      .single(),
    supabase
      .from('repair_orders')
      .select('id, created_at, mileage, ro_lines(description)')
      .eq('vehicle_id', order.vehicle_id),
  ]);
  if (vehicle.error) throw vehicle.error;
  if (orders.error) throw orders.error;
  const visits = orders.data.map((row) => ({
    id: row.id,
    date: row.created_at,
    mileage: row.mileage,
    lines: row.ro_lines.map((line) => line.description),
  }));
  return {
    vehicleType: order.vehicle_type,
    ctDueDate: vehicle.data.ct_due_date,
    tailgateDueMonth: vehicle.data.tailgate_due_date,
    antipollutionDueDate: vehicle.data.antipollution_due_date,
    mileage: order.mileage,
    currentLines: visits.find((visit) => visit.id === order.id)?.lines ?? [],
    history: visits.filter((visit) => visit.id !== order.id),
  };
}
