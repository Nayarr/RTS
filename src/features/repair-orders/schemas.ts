import { z } from 'zod';
import { emptyNewClient, newClientSchema, type NewClientValues } from '@/features/customers/domain';
import type { NewRepairOrderInput } from './api';
import { normalizeKey } from './constants';

const time = z.union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure invalide')]);

/** Nouvel OR (bureau) : mêmes règles que l'ancienne appli et que la base. */
export const newRepairOrderSchema = z
  .object({
    plate: z.string().refine((value) => normalizeKey(value).length >= 2, 'Indique l’immatriculation'),
    client_name: z.string().trim().max(120),
    requested_work: z.string().trim().min(1, 'Indique la tâche à faire').max(2000),
    vehicle_type: z.enum(['pl', 'vul', 'remorque']),
    mileage: z.string().regex(/^\d{0,7}$/, 'Kilométrage en chiffres'),
    planned_date: z.string(),
    planned_start: time,
    planned_end: time,
    technician_id: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.planned_end && !values.planned_start) {
      ctx.addIssue({ code: 'custom', path: ['planned_start'], message: 'Indique l’heure de début' });
    }
    if (values.planned_end && values.planned_start && values.planned_end <= values.planned_start) {
      ctx.addIssue({
        code: 'custom',
        path: ['planned_end'],
        message: 'L’heure de fin doit être après le début',
      });
    }
  });
export type NewRepairOrderValues = z.infer<typeof newRepairOrderSchema>;

export const todayIso = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

export const newRepairOrderDefaults = (): NewRepairOrderValues => ({
  plate: '',
  client_name: '',
  requested_work: '',
  vehicle_type: 'pl',
  mileage: '',
  planned_date: todayIso(),
  planned_start: '',
  planned_end: '',
  technician_id: '',
});

export const toNewRepairOrderInput = (
  values: NewRepairOrderValues,
  signatureFileId: string | null,
): NewRepairOrderInput => ({
  plate: values.plate.trim(),
  vehicle_type: values.vehicle_type,
  client_name: values.client_name.trim(),
  requested_work: values.requested_work.trim(),
  mileage: values.mileage ? Number(values.mileage) : null,
  technician_id: values.technician_id || null,
  planned_date: values.planned_date || null,
  planned_start: values.planned_start || null,
  planned_end: values.planned_start ? values.planned_end || null : null,
  signature_file_id: signatureFileId,
});

/** Informations modifiables par le bureau sur la fiche OR. */
export const editRepairOrderSchema = z
  .object({
    requested_work: z.string().trim().min(1, 'Indique la tâche à faire').max(2000),
    vehicle_type: z.enum(['pl', 'vul', 'remorque']),
    mileage: z.string().regex(/^\d{0,7}$/, 'Kilométrage en chiffres'),
    planned_date: z.string(),
    planned_start: time,
    planned_end: time,
    technician_id: z.string(),
    status: z.enum(['assigned', 'in_progress', 'work_done', 'quote_pending', 'to_invoice', 'invoiced']),
  })
  .superRefine((values, ctx) => {
    if (values.planned_end && values.planned_start && values.planned_end <= values.planned_start) {
      ctx.addIssue({
        code: 'custom',
        path: ['planned_end'],
        message: 'L’heure de fin doit être après le début',
      });
    }
  });
export type EditRepairOrderValues = z.infer<typeof editRepairOrderSchema>;

/**
 * Client pas encore en base, créé avec l'OR : fiche complète obligatoire (coordonnées pour
 * l'envoi par e-mail, la signature à distance et la facture).
 */
export const orNewClientSchema = newClientSchema.superRefine((values, ctx) => {
  const require = (path: keyof NewClientValues, message: string) =>
    ctx.addIssue({ code: 'custom', path: [path], message });
  if (values.kind === 'individual' && !values.civility) require('civility', 'Choisis la civilité');
  if (values.kind === 'pro' && !values.siret.trim()) require('siret', 'Indique le SIRET');
  if (!values.phone.trim()) require('phone', 'Indique le téléphone');
  if (!values.email.trim()) require('email', 'Indique l’e-mail');
  if (!values.billing_address.trim()) require('billing_address', 'Indique l’adresse');
});

/**
 * Fiche du nouveau client préremplie avec le nom saisi dans l'OR : raison sociale d'un pro,
 * ou « Prénom Nom » d'un particulier (premier mot = prénom).
 */
export function orNewClientDefaults(kind: 'pro' | 'individual', clientName: string): NewClientValues {
  const name = clientName.trim().replace(/\s+/g, ' ');
  const [first = '', ...rest] = name.split(' ');
  return {
    ...emptyNewClient(kind),
    name: kind === 'pro' ? name : '',
    first_name: kind === 'individual' && rest.length ? first : '',
    last_name: kind === 'individual' ? (rest.length ? rest.join(' ') : first) : '',
  };
}
