import { z } from 'zod';
import { formatPlate, normalizeKey } from '@/features/repair-orders/constants';
import { decimalField, decimalText, decimalValue } from '@/lib/numbers';
import type { TablesInsert, TablesUpdate } from '@/types/database';
import type { ClientOverview, VehicleOverview } from './api';
import { formatSiret, siretField, siretValue } from '@/lib/siret';
import { monthEnd } from '@/lib/month';

// ---------------------------------------------------------------- Échéances

export type DeadlineKind = 'ct' | 'tailgate' | 'antipollution';

export const DEADLINE_LABELS: Record<DeadlineKind, string> = {
  ct: 'Contrôle technique',
  tailgate: 'Contrôle hayon',
  antipollution: 'Contrôle antipollution',
};

export type DeadlineTone = 'overdue' | 'soon' | 'ok';

const dayNumber = (iso: string) =>
  Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

/** État d'une échéance (ancienne appli) : dépassée, dans les 30 jours, ou OK. */
/** Échéance du hayon (mois seulement) : comptée jusqu'à la fin du mois. */
export const tailgateDueEnd = (month: string | null | undefined) => (month ? monthEnd(month) : null);

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

const identityFields = {
  kind: z.enum(['pro', 'individual']),
  civility: z.enum(['', 'M.', 'Mme']),
  first_name: z.string().trim().max(60),
  last_name: z.string().trim().max(60),
  birth_date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Date invalide'),
  birth_place: z.string().trim().max(100),
};

/** Pro : raison sociale obligatoire ; particulier : nom et prénom. */
function requireIdentity(
  values: { kind: 'pro' | 'individual'; name: string; first_name: string; last_name: string },
  ctx: z.RefinementCtx,
) {
  if (values.kind === 'pro' && !values.name.trim()) {
    ctx.addIssue({ code: 'custom', path: ['name'], message: 'Indique le nom du client' });
  }
  if (values.kind === 'individual') {
    if (!values.last_name.trim())
      ctx.addIssue({ code: 'custom', path: ['last_name'], message: 'Indique le nom' });
    if (!values.first_name.trim()) {
      ctx.addIssue({ code: 'custom', path: ['first_name'], message: 'Indique le prénom' });
    }
  }
}

export const clientSchema = z
  .object({
    ...identityFields,
    name: z.string().trim().max(120),
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
    siret: siretField,
    discount_percent: cappedDecimal('Remise', 100),
    hourly_rate: decimalField(),
    notes: z.string().max(2000),
  })
  .superRefine(requireIdentity);
export type ClientValues = z.infer<typeof clientSchema>;

export const clientToForm = (client: ClientOverview): ClientValues => ({
  kind: client.kind ?? 'pro',
  civility: client.civility === 'M.' || client.civility === 'Mme' ? client.civility : '',
  first_name: client.first_name ?? '',
  last_name: client.last_name ?? '',
  birth_date: client.birth_date ?? '',
  birth_place: client.birth_place ?? '',
  name: client.name,
  email: client.email ?? '',
  contact_name: client.contact_name ?? '',
  phone: client.phone ?? '',
  other_phones: otherPhones(client.other_phones),
  billing_address: client.billing_address ?? '',
  siret: formatSiret(client.siret),
  discount_percent: decimalText(client.discount_percent),
  hourly_rate: decimalText(client.hourly_rate),
  notes: client.notes ?? '',
});

/** Champs enregistrés ; la remise et le taux horaire ne sont envoyés que par la direction. */
export function clientFromForm(values: ClientValues, withPricing: boolean): TablesUpdate<'clients'> {
  const text = (value: string) => value.trim() || null;
  return {
    ...identityFromForm(values),
    email: text(values.email),
    contact_name: text(values.contact_name),
    phone: text(values.phone),
    other_phones: values.other_phones.map(({ label, phone }) => ({
      label: label.trim(),
      phone: phone.trim(),
    })),
    billing_address: text(values.billing_address),
    siret: siretValue(values.siret),
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
  antipollution_due_date: z.string(),
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
  antipollution_due_date: vehicle.antipollution_due_date ?? '',
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
    // Utilitaires seulement (contrôle antipollution un an avant le contrôle technique)
    antipollution_due_date: values.vehicle_type === 'vul' ? values.antipollution_due_date || null : null,
    notes: text(values.notes),
  };
}

type IdentityValues = Pick<
  ClientValues,
  'kind' | 'civility' | 'first_name' | 'last_name' | 'birth_date' | 'birth_place' | 'name'
>;

/** Identité enregistrée : un particulier n'a pas de raison sociale (nom affiché « Prénom Nom » par la base). */
function identityFromForm(values: IdentityValues): TablesUpdate<'clients'> {
  const text = (value: string) => value.trim() || null;
  if (values.kind === 'pro') {
    return {
      kind: 'pro',
      name: values.name.trim(),
      civility: null,
      first_name: null,
      last_name: null,
      birth_date: null,
      birth_place: null,
    };
  }
  return {
    kind: 'individual',
    name: `${values.first_name.trim()} ${values.last_name.trim()}`,
    civility: values.civility || null,
    first_name: values.first_name.trim(),
    last_name: values.last_name.trim(),
    birth_date: values.birth_date || null,
    birth_place: text(values.birth_place),
  };
}

// ---------------------------------------------------------------- Nouveau client

export const newClientSchema = z
  .object({
    ...identityFields,
    name: z.string().trim().max(120),
    contact_name: z.string().trim().max(120),
    siret: siretField,
    phone: z.string().trim().max(30),
    email: z.union([z.literal(''), z.string().trim().email('E-mail invalide')]),
    billing_address: z.string().trim().max(300),
    notes: z.string().max(2000),
  })
  .superRefine(requireIdentity);
export type NewClientValues = z.infer<typeof newClientSchema>;

export const emptyNewClient = (kind: 'pro' | 'individual'): NewClientValues => ({
  kind,
  civility: '',
  first_name: '',
  last_name: '',
  birth_date: '',
  birth_place: '',
  name: '',
  contact_name: '',
  siret: '',
  phone: '',
  email: '',
  billing_address: '',
  notes: '',
});

export function newClientFromForm(values: NewClientValues): TablesInsert<'clients'> {
  const text = (value: string) => value.trim() || null;
  const identity = identityFromForm(values);
  return {
    ...identity,
    name: identity.name ?? values.name.trim(),
    contact_name: values.kind === 'pro' ? text(values.contact_name) : null,
    siret: values.kind === 'pro' ? siretValue(values.siret) : null,
    phone: text(values.phone),
    email: text(values.email),
    billing_address: text(values.billing_address),
    notes: text(values.notes),
  };
}

export const CLIENT_KIND_LABELS = { pro: 'Pro', individual: 'Particulier' } as const;
