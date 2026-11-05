import { z } from 'zod';
import { normalizeKey } from '@/features/repair-orders/constants';
import { checkPlannedSlot, todayIso } from '@/features/repair-orders/schemas';
import type { Appointment, AppointmentInput } from './api';
import { shortTime } from './domain';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure invalide');

/** Rendez-vous : mêmes règles que l'ancienne appli et que la base. */
export const appointmentSchema = z
  .object({
    client_name: z.string().trim().max(120),
    plate: z.string().trim().max(20),
    vehicle_type: z.enum(['pl', 'vul', 'remorque']),
    scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indique la date'),
    start_time: time,
    end_time: z.union([z.literal(''), time]),
    end_date: z.string(),
    reason: z.string().trim().max(500),
    technician_id: z.string(),
  })
  .superRefine((values, ctx) => {
    if (!values.client_name && !normalizeKey(values.plate)) {
      ctx.addIssue({
        code: 'custom',
        path: ['client_name'],
        message: 'Indique au moins le client ou l’immatriculation',
      });
    }
    checkPlannedSlot(
      ctx,
      {
        date: values.scheduled_date,
        start: values.start_time,
        end: values.end_time,
        endDate: values.end_date,
      },
      { endDate: 'end_date', start: 'start_time', end: 'end_time' },
    );
  });
export type AppointmentValues = z.infer<typeof appointmentSchema>;

/** Valeurs proposées pour un nouveau rendez-vous (case du planning, fiche véhicule…). */
export interface AppointmentPreset {
  date?: string;
  technician_id?: string;
  client_name?: string;
  plate?: string;
  vehicle_type?: Appointment['vehicle_type'];
  reason?: string;
  maintenance_contract_id?: string;
}

export const appointmentToForm = (
  appointment: Appointment | null,
  preset: AppointmentPreset = {},
): AppointmentValues => ({
  client_name: appointment?.client_name ?? preset.client_name ?? '',
  plate: appointment?.plate ?? preset.plate ?? '',
  vehicle_type: appointment?.vehicle_type ?? preset.vehicle_type ?? 'pl',
  scheduled_date: appointment?.scheduled_date ?? preset.date ?? todayIso(),
  start_time: shortTime(appointment?.start_time) || '09:00',
  end_time: appointment ? shortTime(appointment.end_time) : '10:00',
  end_date: appointment?.end_date ?? '',
  reason: appointment?.reason ?? preset.reason ?? '',
  technician_id: appointment?.technician_id ?? preset.technician_id ?? '',
});

export const appointmentFromForm = (values: AppointmentValues): AppointmentInput => ({
  client_name: values.client_name.trim(),
  plate: values.plate.trim(),
  vehicle_type: values.vehicle_type,
  scheduled_date: values.scheduled_date,
  start_time: values.start_time,
  end_time: values.end_time || null,
  end_date: values.end_date || null,
  reason: values.reason.trim(),
  technician_id: values.technician_id || null,
});

/** OR placé au planning (date de début proposée par la case cliquée). */
export const assignOrderSchema = z
  .object({
    repair_order_id: z.string().min(1, 'Choisis un OR'),
    technician_id: z.string().min(1, 'Choisis un technicien'),
    planned_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indique la date'),
    planned_start: time,
    planned_end_date: z.string(),
    planned_end: time,
  })
  .superRefine((values, ctx) => {
    checkPlannedSlot(
      ctx,
      {
        date: values.planned_date,
        start: values.planned_start,
        end: values.planned_end,
        endDate: values.planned_end_date,
      },
      { endDate: 'planned_end_date', start: 'planned_start', end: 'planned_end' },
    );
  });
export type AssignOrderValues = z.infer<typeof assignOrderSchema>;
