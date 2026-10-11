import type { RepairOrderOverview } from '@/features/repair-orders/api';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';
import { planningMechanics, type LeaveSpan, type RestGroup, type WorkdayHours } from './domain';

type AppointmentRow = Tables<'v_appointments_overview'>;
type Guaranteed =
  'id' | 'status' | 'vehicle_type' | 'scheduled_date' | 'start_time' | 'created_at' | 'updated_at';

/** Ligne de la vue des rendez-vous ; les colonnes toujours renseignées sont typées non nulles. */
export type Appointment = Omit<AppointmentRow, Guaranteed> & {
  [K in Guaranteed]: NonNullable<AppointmentRow[K]>;
};

export interface PlanningTechnician {
  id: string;
  display_name: string;
  color: string | null;
  rest_group: RestGroup | null;
}

export interface PlanningData {
  /** OR planifiés à une heure précise (blocs de la grille). */
  orders: RepairOrderOverview[];
  /** OR prévus un jour donné sans horaire, pas encore terminés (étiquettes sous la date). */
  untimedOrders: RepairOrderOverview[];
  appointments: Appointment[];
  technicians: PlanningTechnician[];
  leaves: LeaveSpan[];
  hours: WorkdayHours;
  restReferenceMonday: string | null;
}

/** Tout ce qu'affiche le planning entre deux dates incluses. */
export async function fetchPlanning(from: string, to: string): Promise<PlanningData> {
  const [orders, appointments, technicians, leaves, settings] = await Promise.all([
    supabase.from('v_repair_orders_overview').select('*').gte('planned_date', from).lte('planned_date', to),
    supabase
      .from('v_appointments_overview')
      .select('*')
      .eq('status', 'planned')
      .gte('scheduled_date', from)
      .lte('scheduled_date', to),
    supabase
      .from('technicians')
      .select('id, display_name, color, rest_group, profile:profiles(role)')
      .eq('is_active', true)
      .eq('exclude_from_planning', false)
      .order('sort_order')
      .order('display_name'),
    supabase
      .from('leave_requests')
      .select('technician_id, leave_type, starts_on, ends_on, start_time, end_time')
      .eq('status', 'approved')
      .eq('is_deleted', false)
      .lte('starts_on', to)
      .gte('ends_on', from),
    supabase
      .from('app_settings')
      .select('workday_start, workday_end, lunch_start, lunch_end, friday_lunch_start, rest_reference_monday')
      .single(),
  ]);
  for (const result of [orders, appointments, technicians, leaves]) if (result.error) throw result.error;
  if (settings.error) throw settings.error;
  const { rest_reference_monday, ...hours } = settings.data;
  const planned = (orders.data ?? []) as RepairOrderOverview[];
  return {
    orders: planned.filter((order) => order.planned_start),
    untimedOrders: planned.filter(
      (order) => !order.planned_start && (order.status === 'assigned' || order.status === 'in_progress'),
    ),
    appointments: (appointments.data ?? []) as Appointment[],
    technicians: planningMechanics(technicians.data ?? []),
    leaves: leaves.data ?? [],
    hours,
    restReferenceMonday: rest_reference_monday,
  };
}

/** Rendez-vous à venir (à partir d'aujourd'hui). */
export async function fetchUpcomingAppointments(today: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from('v_appointments_overview')
    .select('*')
    .eq('status', 'planned')
    .gte('scheduled_date', today)
    .order('scheduled_date')
    .order('start_time');
  if (error) throw error;
  return data as Appointment[];
}

/** OR à placer au planning : tous ceux qui ne sont pas encore facturés. */
export async function fetchPlannableOrders(): Promise<
  Pick<RepairOrderOverview, 'id' | 'number' | 'plate' | 'client_name'>[]
> {
  const { data, error } = await supabase
    .from('v_repair_orders_overview')
    .select('id, number, plate, client_name')
    .neq('status', 'invoiced')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return data as Pick<RepairOrderOverview, 'id' | 'number' | 'plate' | 'client_name'>[];
}

export interface AppointmentInput {
  client_name: string;
  plate: string;
  vehicle_type: Appointment['vehicle_type'];
  scheduled_date: string;
  start_time: string;
  end_time: string | null;
  reason: string;
  technician_id: string | null;
  /** Entretien prévu par un contrat : l'OR créé à l'arrivée du véhicule lui sera rattaché. */
  maintenance_contract_id?: string | null;
}

export async function saveAppointment(id: string | null, input: AppointmentInput) {
  const { data, error } = await supabase.rpc('save_appointment', {
    p_id: id ?? undefined,
    p_client_name: input.client_name,
    p_plate: input.plate,
    p_vehicle_type: input.vehicle_type,
    p_scheduled_date: input.scheduled_date,
    p_start_time: input.start_time,
    p_end_time: input.end_time ?? undefined,
    p_reason: input.reason,
    p_technician_id: input.technician_id ?? undefined,
    p_maintenance_contract_id: input.maintenance_contract_id ?? undefined,
  });
  if (error) throw error;
  return data;
}

async function updateAppointment(id: string, patch: { status?: 'cancelled'; reminder_sent_at?: string }) {
  const { data, error } = await supabase.from('appointments').update(patch).eq('id', id).select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Modification non autorisée');
}

export const cancelAppointment = (id: string) => updateAppointment(id, { status: 'cancelled' });

export const markAppointmentReminded = (id: string) =>
  updateAppointment(id, { reminder_sent_at: new Date().toISOString() });

/** « Le véhicule est arrivé : créer l'OR » ; renvoie l'identifiant de l'OR créé. */
export async function convertAppointment(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_repair_order_from_appointment', {
    p_appointment_id: id,
  });
  if (error) throw error;
  return data;
}
