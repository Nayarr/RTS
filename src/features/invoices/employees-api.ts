// Salarié de chaque ligne de facture : interne, réservé à la direction, jamais sur la facture du client.
import { supabase } from '@/lib/supabase';

/** Salarié proposé : technicien (« t:… ») ou compte du bureau (« p:… »). */
export interface Employee {
  key: string;
  label: string;
  technicianId: string | null;
  profileId: string | null;
}

export interface LineEmployeeChange {
  id: string;
  line_description: string;
  old_name: string | null;
  new_name: string | null;
  changed_at: string;
  changer: { full_name: string } | null;
}

export const employeeKey = (technicianId: string | null, profileId: string | null) =>
  technicianId ? `t:${technicianId}` : profileId ? `p:${profileId}` : '';

/** Tous les salariés : techniciens actifs, puis direction et réception. */
export async function fetchEmployees(): Promise<Employee[]> {
  const [technicians, office] = await Promise.all([
    supabase.from('technicians').select('id, display_name').eq('is_active', true).order('display_name'),
    supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('role', ['direction', 'reception'])
      .eq('is_active', true)
      .order('full_name'),
  ]);
  if (technicians.error) throw technicians.error;
  if (office.error) throw office.error;
  return [
    ...technicians.data.map((t) => ({
      key: employeeKey(t.id, null),
      label: t.display_name,
      technicianId: t.id,
      profileId: null,
    })),
    ...office.data.map((p) => ({
      key: employeeKey(null, p.id),
      label: `${p.full_name} (${p.role === 'direction' ? 'direction' : 'réception'})`,
      technicianId: null,
      profileId: p.id,
    })),
  ];
}

/** Salarié de chaque ligne de la facture (clé de l'employé, par ligne). */
export async function fetchLineEmployees(lineIds: string[]): Promise<Record<string, string>> {
  if (lineIds.length === 0) return {};
  const { data, error } = await supabase
    .from('invoice_line_employees')
    .select('invoice_line_id, technician_id, profile_id')
    .in('invoice_line_id', lineIds);
  if (error) throw error;
  return Object.fromEntries(
    data.map((row) => [row.invoice_line_id, employeeKey(row.technician_id, row.profile_id)]),
  );
}

export async function fetchLineEmployeeChanges(invoiceId: string): Promise<LineEmployeeChange[]> {
  const { data, error } = await supabase
    .from('invoice_line_employee_changes')
    .select(
      'id, line_description, old_name, new_name, changed_at, changer:profiles!invoice_line_employee_changes_changed_by_fkey(full_name)',
    )
    .eq('invoice_id', invoiceId)
    .order('changed_at');
  if (error) throw error;
  return data;
}

export async function setLineEmployee(lineId: string, employee: Employee | null) {
  const { error } = await supabase.rpc('set_invoice_line_employee', {
    p_line_id: lineId,
    p_technician_id: employee?.technicianId ?? undefined,
    p_profile_id: employee?.profileId ?? undefined,
  });
  if (error) throw error;
}
