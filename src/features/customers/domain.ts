import { z } from 'zod';
import { formatPlate, normalizeKey } from '@/features/repair-orders/constants';
import { decimalField, decimalText, decimalValue } from '@/lib/numbers';
import type { TablesUpdate } from '@/types/database';
import type { ClientOverview, VehicleOverview } from './api';

// ---------------------------------------------------------------- Échéances

export type DeadlineKind = 'ct' | 'tailgate';

export const DEADLINE_LABELS: Record<DeadlineKind, string> = {
  ct: 'Contrôle technique',
  tailgate: 'Contrôle hayon',
};

export type DeadlineTone = 'overdue' | 'soon' | 'ok';

const dayNumber = (iso: string) =>
  Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

/** État d'une échéance (ancienne appli) : dépassée, dans les 30 jours, ou OK. */
export function deadlineStatus(
  dueDate: string | null | undefined,
  today: string,
): { label: string; tone: DeadlineTone; days: number } | null {
  if (!dueDate) return null;
  const days = dayNumber(dueDate) - dayNumber(today);
  if (days < 0) return { label: `Dépassé (${-days} j)`, tone: 'overdue', days };
  if (days <= 30) return { label: `Dans ${days} j`, tone: 'soon', days };
  return { label: 'OK', tone: 'ok', days };
}

export const DEADLINE_TONE_CLASS: Record<DeadlineTone, string> = {
  overdue: 'text-destructive',
  soon: 'text-warning',
  ok: 'text-success',
};

/** Pastille de la maquette pour une échéance. */
export const DEADLINE_BADGE_CLASS: Record<DeadlineTone, string> = {
  overdue: 's-bad',
  soon: 's-warn',
  ok: 's-ok',
};

// ---------------------------------------------------------------- Kilométrage

export interface MileagePoint {
  date: string;
  mileage: number;
}

/** Relevés de kilométrage des passages, du plus ancien au plus récent, et moyenne annuelle. */
export function mileageHistory(orders: { created_at: string; mileage: number | null }[]) {
  const points: MileagePoint[] = orders
    .flatMap((order) => (order.mileage ? [{ date: order.created_at, mileage: order.mileage }] : []))
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = points[0];
  const last = points[points.length - 1];
  const years = first && last ? (Date.parse(last.date) - Date.parse(first.date)) / 31_557_600_000 : 0;
  const perYear = first && last && years > 0 ? Math.round((last.mileage - first.mileage) / years) : null;
  return { points, perYear };
}

/** Jours depuis la dernière visite (alerte au-delà de 180 jours, comme l'ancienne appli). */
export function daysSince(iso: string | null | undefined, now = new Date()): number | null {
  return iso ? Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000) : null;
}

// ---------------------------------------------------------------- Formulaires

/** Nombre facultatif, plafonné (remise en %). */
const cappedDecimal = (label: string, max: number) =>
  decimalField().refine((value) => (decimalValue(value) ?? 0) <= max, `${label} : ${max} au maximum`);

export interface ClientPhone {
  label: string;
  phone: string;
}

/** Autres numéros enregistrés (colonne JSON) : seulement les entrées complètes. */
export function otherPhones(value: unknown): ClientPhone[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return [];
    const { label, phone } = entry as Record<string, unknown>;
    return typeof label === 'string' && typeof phone === 'string' ? [{ label, phone }] : [];
  });
}

export const MAX_OTHER_PHONES = 10;

export const clientSchema = z.object({
  name: z.string().trim().min(1, 'Indique le nom du client').max(120),
  email: z.union([z.literal(''), z.string().trim().email('E-mail invalide')]),
  contact_name: z.string().trim().max(120),
  phone: z.string().trim().max(30),
  other_phones: z
    .array(
      z.object({
        label: z.string().trim().min(1, 'Indique à qui est ce numéro').max(60),
        phone: z.string().trim().min(1, 'Indique le numéro').max(30, '30 caractères au maximum'),
      }),
    )
    .max(MAX_OTHER_PHONES),
  billing_address: z.string().trim().max(300),
  siren: z
    .string()
    .refine(
      (value) => /^(\d{9}|\d{14})?$/.test(value.replace(/\s/g, '')),
      'SIREN : 9 chiffres (ou SIRET : 14)',
    ),
  discount_percent: cappedDecimal('Remise', 100),
  hourly_rate: decimalField(),
  notes: z.string().max(2000),
});
export type ClientValues = z.infer<typeof clientSchema>;

export const clientToForm = (client: ClientOverview): ClientValues => ({
  name: client.name,
  email: client.email ?? '',
  contact_name: client.contact_name ?? '',
  phone: client.phone ?? '',
  other_phones: otherPhones(client.other_phones),
  billing_address: client.billing_address ?? '',
  siren: client.siren ?? '',
  discount_percent: decimalText(client.discount_percent),
  hourly_rate: decimalText(client.hourly_rate),
  notes: client.notes ?? '',
});

/** Champs enregistrés ; la remise et le taux horaire ne sont envoyés que par la direction. */
export function clientFromForm(values: ClientValues, withPricing: boolean): TablesUpdate<'clients'> {
  const text = (value: string) => value.trim() || null;
  return {
    name: values.name.trim(),
    email: text(values.email),
    contact_name: text(values.contact_name),
    phone: text(values.phone),
    other_phones: values.other_phones.map(({ label, phone }) => ({
      label: label.trim(),
      phone: phone.trim(),
    })),
    billing_address: text(values.billing_address),
    siren: text(values.siren.replace(/\s/g, '')),
    notes: text(values.notes),
    ...(withPricing
      ? {
          discount_percent: decimalValue(values.discount_percent),
          hourly_rate: decimalValue(values.hourly_rate),
        }
      : {}),
  };
}

export const vehicleSchema = z.object({
  plate: z.string().refine((value) => normalizeKey(value).length >= 2, 'Indique l’immatriculation'),
  vehicle_type: z.enum(['pl', 'vul', 'remorque']),
  brand: z.string().trim().max(60),
  model: z.string().trim().max(60),
  vin: z.string().trim().max(30),
  first_registration_date: z.string(),
  ct_due_date: z.string(),
  tailgate_due_date: z.string(),
  notes: z.string().max(2000),
});
export type VehicleValues = z.infer<typeof vehicleSchema>;

export const vehicleToForm = (vehicle: VehicleOverview): VehicleValues => ({
  plate: vehicle.plate,
  vehicle_type: vehicle.vehicle_type,
  brand: vehicle.brand ?? '',
  model: vehicle.model ?? '',
  vin: vehicle.vin ?? '',
  first_registration_date: vehicle.first_registration_date ?? '',
  ct_due_date: vehicle.ct_due_date ?? '',
  tailgate_due_date: vehicle.tailgate_due_date ?? '',
  notes: vehicle.notes ?? '',
});

export function vehicleFromForm(values: VehicleValues): TablesUpdate<'vehicles'> {
  const text = (value: string) => value.trim() || null;
  return {
    plate: formatPlate(values.plate).trim(),
    vehicle_type: values.vehicle_type,
    brand: text(values.brand),
    model: text(values.model),
    vin: text(values.vin.toUpperCase()),
    first_registration_date: values.first_registration_date || null,
    ct_due_date: values.ct_due_date || null,
    tailgate_due_date: values.tailgate_due_date || null,
    notes: text(values.notes),
  };
}
