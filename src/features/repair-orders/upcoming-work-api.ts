import { supabase } from '@/lib/supabase';
import type { OilChange, UpcomingInput } from './upcoming-work';

/**
 * Échéances d'un véhicule et ses passages à l'atelier (vidange, extincteurs), plus ses vidanges
 * déclarées. `orderId` : l'OR en cours, dont les travaux ne sont pas reproposés.
 */
export async function fetchUpcomingInput({
  vehicleId,
  vehicleType,
  mileage,
  orderId = null,
}: {
  vehicleId: string;
  vehicleType: string;
  mileage: number | null;
  orderId?: string | null;
}): Promise<UpcomingInput> {
  const [vehicle, orders, oilChanges] = await Promise.all([
    supabase
      .from('vehicles')
      .select('ct_due_date, tailgate_due_date, antipollution_due_date')
      .eq('id', vehicleId)
      .single(),
    supabase
      .from('repair_orders')
      .select('id, created_at, mileage, ro_lines(description)')
      .eq('vehicle_id', vehicleId),
    fetchOilChanges(vehicleId),
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
    vehicleType,
    ctDueDate: vehicle.data.ct_due_date,
    tailgateDueMonth: vehicle.data.tailgate_due_date,
    antipollutionDueDate: vehicle.data.antipollution_due_date,
    mileage,
    currentLines: visits.find((visit) => visit.id === orderId)?.lines ?? [],
    history: visits.filter((visit) => visit.id !== orderId),
    oilChanges,
  };
}

export interface DeclaredOilChange extends OilChange {
  id: string;
  created_at: string;
}

/** Vidanges déclarées du véhicule (faites hors atelier), de la plus récente à la plus ancienne. */
export async function fetchOilChanges(vehicleId: string): Promise<DeclaredOilChange[]> {
  const { data, error } = await supabase
    .from('vehicle_oil_changes')
    .select('id, done_on, mileage, created_at')
    .eq('vehicle_id', vehicleId)
    .order('done_on', { ascending: false });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    date: row.done_on,
    mileage: row.mileage,
    created_at: row.created_at,
  }));
}

/** Vidange faite ailleurs, dite par le client : notée sur la fiche du véhicule. */
export async function addOilChange(input: { vehicleId: string; date: string; mileage: number | null }) {
  const { error } = await supabase
    .from('vehicle_oil_changes')
    .insert({ vehicle_id: input.vehicleId, done_on: input.date, mileage: input.mileage });
  if (error) throw error;
}

/** Forfait vidange actif du type de véhicule (« FORFAIT VIDANGE PL »), à ajouter au devis ou à la facture. */
export async function findOilPackage(vehicleType: string) {
  const { data, error } = await supabase
    .from('service_packages')
    .select('id, name, details, price, standard_hours, category')
    .eq('is_active', true)
    .ilike('name', '%vidange%')
    .order('name');
  if (error) throw error;
  return (
    data.find((item) => item.category === vehicleType) ?? data.find((item) => item.category === null) ?? null
  );
}

/** Vidange déclarée retirée de la fiche du véhicule (erreur de saisie). */
export async function deleteOilChange(id: string) {
  const { data, error } = await supabase.from('vehicle_oil_changes').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Suppression non autorisée');
}
