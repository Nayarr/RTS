import type { CompanySettings } from '@/features/settings/api';
import { supabase } from '@/lib/supabase';

type ParkingRates = Pick<CompanySettings, 'parking_rate_pl' | 'parking_rate_vul' | 'parking_rate_remorque'>;

/** Tarif HT par jour du type de véhicule (Réglages › Facturation). */
export function parkingRate(rates: ParkingRates, vehicleType: string): number {
  if (vehicleType === 'vul') return rates.parking_rate_vul;
  if (vehicleType === 'remorque') return rates.parking_rate_remorque;
  return rates.parking_rate_pl;
}

const dayNumber = (iso: string) =>
  Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

/** Jours de stationnement en trop : du lendemain de la date prévue au jour du départ (0 si à l'heure). */
export function parkingDays(plannedDate: string, leftDate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(plannedDate) || !/^\d{4}-\d{2}-\d{2}$/.test(leftDate)) return 0;
  return Math.max(0, dayNumber(leftDate) - dayNumber(plannedDate));
}

/** Brouillon de facture des frais de stationnement ; renvoie son identifiant. */
export async function buildParkingInvoice(input: {
  repairOrderId: string;
  plannedDate: string;
  leftDate: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('build_parking_invoice_draft', {
    p_repair_order_id: input.repairOrderId,
    p_planned_date: input.plannedDate,
    p_left_date: input.leftDate,
  });
  if (error) throw error;
  return data;
}
