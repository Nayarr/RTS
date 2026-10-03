import { invokeFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';
import { uploadFile } from '@/features/files/api';
import type { RepairOrderOverview, RoLine } from '@/features/repair-orders/api';
import type { InspectionData } from '@/features/repair-orders/inspection';

/** OR du technicien connecté (le RLS ne renvoie que les siens). */
export async function fetchMyRepairOrders(): Promise<RepairOrderOverview[]> {
  const { data, error } = await supabase
    .from('v_repair_orders_overview')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data as RepairOrderOverview[];
}

/** Dernière consultation de chaque OR par l'utilisateur (badges « Nouveau » / « Modifié »). */
export async function fetchSeen(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('repair_order_seen').select('repair_order_id, seen_at');
  if (error) throw error;
  return Object.fromEntries(data.map((row) => [row.repair_order_id, row.seen_at]));
}

export async function markSeen(repairOrderId: string, profileId: string) {
  const { error } = await supabase
    .from('repair_order_seen')
    .upsert({ repair_order_id: repairOrderId, profile_id: profileId, seen_at: new Date().toISOString() });
  if (error) throw error;
}

export interface VehicleDeadlines {
  ct_due_date: string | null;
  tailgate_due_date: string | null;
}

/** Ce que l'OR peut changer sur le véhicule : échéances, et VIN lu sur le contrôle technique. */
export type VehiclePatch = Partial<VehicleDeadlines> & { vin?: string | null };

export async function fetchVehicleDeadlines(vehicleId: string): Promise<VehicleDeadlines | null> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('ct_due_date, tailgate_due_date')
    .eq('id', vehicleId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- Actions (vérifiées par la base)

export async function updateMileage(repairOrderId: string, mileage: number | null) {
  const { error } = await supabase.rpc('tech_update_repair_order', {
    p_repair_order_id: repairOrderId,
    p_patch: { mileage },
  });
  if (error) throw error;
}

export async function updateDeadlines(repairOrderId: string, patch: VehiclePatch) {
  const { error } = await supabase.rpc('update_vehicle_deadlines', {
    p_repair_order_id: repairOrderId,
    p_patch: patch as Json,
  });
  if (error) throw error;
}

export async function startTimer(repairOrderId: string) {
  const { error } = await supabase.rpc('start_timer', { p_repair_order_id: repairOrderId });
  if (error) throw error;
}

export async function stopTimer(repairOrderId: string) {
  const { error } = await supabase.rpc('stop_timer', { p_repair_order_id: repairOrderId });
  if (error) throw error;
}

export async function completeRepairOrder(repairOrderId: string, quoteNeeded: boolean) {
  const { error } = await supabase.rpc('complete_repair_order', {
    p_repair_order_id: repairOrderId,
    p_quote_needed: quoteNeeded,
  });
  if (error) throw error;
}

/** Photo prise sur l'OR : envoi dans R2 (compressée au préalable) puis rattachement à l'OR. */
export async function addPhoto(repairOrderId: string, file: File, label: string) {
  const fileId = await uploadFile(file, { category: 'ro_photo' });
  const { error } = await supabase
    .from('ro_photos')
    .insert({ repair_order_id: repairOrderId, file_id: fileId, label });
  if (error) throw error;
  return fileId;
}

/** Réglage de la direction : lecture automatique des étiquettes photographiées. */
export async function fetchLabelScanEnabled(): Promise<boolean> {
  const { data, error } = await supabase.from('app_settings').select('label_scan_enabled').maybeSingle();
  if (error) return false;
  return data?.label_scan_enabled ?? false;
}

export interface TailgateLabelReading {
  /** Prochaine échéance (lue, sinon dernier contrôle + 6 mois), ou null si rien de lisible. */
  next_due_date: string | null;
  last_control_date: string | null;
  label_text: string;
  confidence: 'haute' | 'moyenne' | 'faible';
}

/** Lecture de l'étiquette du contrôle hayon par l'assistant (Edge Function « label-read »). */
export async function readTailgateLabel(fileId: string) {
  return invokeFunction<TailgateLabelReading>('label-read', { file_id: fileId, kind: 'tailgate' });
}

export interface TechnicalInspectionReading {
  /** Date limite du prochain contrôle lue sur le document, ou null. */
  next_due_date: string | null;
  last_control_date: string | null;
  /** VIN lu (17 caractères), ou null. */
  vin: string | null;
  label_text: string;
  confidence: 'haute' | 'moyenne' | 'faible';
}

/** Lecture du contrôle technique (procès-verbal ou vignette) par l'assistant (Edge Function « label-read »). */
export async function readTechnicalInspection(fileId: string) {
  return invokeFunction<TechnicalInspectionReading>('label-read', {
    file_id: fileId,
    kind: 'technical_inspection',
  });
}

export async function deletePhoto(photoId: string) {
  const { data, error } = await supabase.from('ro_photos').delete().eq('id', photoId).select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Cet OR est terminé, modification impossible.');
}

export async function saveInspection(repairOrderId: string, data: InspectionData) {
  const { error } = await supabase
    .from('inspections')
    .upsert(
      { repair_order_id: repairOrderId, data: data as { [key: string]: Json } },
      { onConflict: 'repair_order_id' },
    );
  if (error) throw error;
}

export async function addLine(
  repairOrderId: string,
  kind: RoLine['kind'],
  position: number,
  description = '',
) {
  const { data, error } = await supabase
    .from('ro_lines')
    .insert({ repair_order_id: repairOrderId, kind, position, line_type: 'labor', description })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export type LinePatch = Partial<Pick<RoLine, 'description' | 'estimated_hours' | 'estimate_is_minimum'>>;

export async function updateLine(lineId: string, patch: LinePatch) {
  const { data, error } = await supabase.from('ro_lines').update(patch).eq('id', lineId).select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Cet OR est terminé, modification impossible.');
}

export async function deleteLine(lineId: string) {
  const { data, error } = await supabase.from('ro_lines').delete().eq('id', lineId).select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Cette ligne ne peut pas être supprimée.');
}
