import { z } from 'zod';
import type { AppointmentPreset } from '@/features/planning/schemas';
import { addDays } from '@/features/planning/domain';
import { formatPlate, normalizeKey } from '@/features/repair-orders/constants';
import { todayIso } from '@/features/repair-orders/schemas';
import { decimalField, decimalText, decimalValue } from '@/lib/numbers';
import type { Contract, ContractInput, ContractVehicle } from './api';

/** « tous les 6 mois ou 30 000 km — 250,00 € HT / mois » */
export function contractTerms(
  contract: Pick<Contract, 'frequency_months' | 'frequency_km' | 'monthly_price_ht'>,
) {
  const frequency = [
    contract.frequency_months ? `tous les ${contract.frequency_months} mois` : null,
    contract.frequency_km
      ? `${contract.frequency_months ? '' : 'tous les '}${contract.frequency_km.toLocaleString('fr-FR')} km`
      : null,
  ]
    .filter(Boolean)
    .join(' ou ');
  const price = contract.monthly_price_ht
    ? `${contract.monthly_price_ht.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} HT / mois`
    : null;
  return [frequency, price].filter(Boolean).join(' — ');
}

export type VehicleServiceState = 'due' | 'planned' | 'up_to_date';

export const vehicleServiceState = (vehicle: ContractVehicle): VehicleServiceState =>
  vehicle.appointment_planned ? 'planned' : vehicle.service_due ? 'due' : 'up_to_date';

/** Rendez-vous d'entretien prérempli (comme l'ancienne appli : dans 2 jours). */
export const serviceAppointmentPreset = (
  contract: Contract,
  vehicle: ContractVehicle,
): AppointmentPreset => ({
  client_name: contract.client_name,
  plate: vehicle.plate,
  vehicle_type: vehicle.vehicle_type,
  reason: `Entretien contrat : ${contract.service_description || 'entretien'}`,
  date: addDays(todayIso(), 2),
  maintenance_contract_id: contract.id,
});

/** Plaques saisies séparées par des virgules, des points-virgules ou des retours à la ligne. */
export const parsePlates = (value: string) => [
  ...new Set(
    value
      .split(/[,;\n]/)
      .map((plate) => formatPlate(plate.trim()))
      .filter((plate) => normalizeKey(plate)),
  ),
];

const wholeNumber = z.string().regex(/^\d{0,7}$/, 'Nombre entier attendu');

export const contractSchema = z
  .object({
    client_name: z.string().trim().min(1, 'Indique le client').max(120),
    service_description: z.string().trim().max(300),
    plates: z.string().refine((value) => parsePlates(value).length > 0, 'Indique au moins un véhicule'),
    frequency_months: wholeNumber,
    frequency_km: wholeNumber,
    monthly_price_ht: decimalField(),
    starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indique la date de début'),
  })
  .refine((values) => Number(values.frequency_months) > 0 || Number(values.frequency_km) > 0, {
    path: ['frequency_months'],
    message: 'Indique une fréquence (mois ou km)',
  });
export type ContractValues = z.infer<typeof contractSchema>;

export const contractToForm = (contract: Contract | null): ContractValues => ({
  client_name: contract?.client_name ?? '',
  service_description: contract?.service_description ?? '',
  plates: contract?.vehicles.map((vehicle) => vehicle.plate).join(', ') ?? '',
  frequency_months: contract?.frequency_months ? String(contract.frequency_months) : '',
  frequency_km: contract?.frequency_km ? String(contract.frequency_km) : '',
  monthly_price_ht: decimalText(contract?.monthly_price_ht),
  starts_on: contract?.starts_on ?? todayIso(),
});

export const contractFromForm = (values: ContractValues): ContractInput => ({
  client_name: values.client_name.trim(),
  service_description: values.service_description.trim(),
  plates: parsePlates(values.plates),
  frequency_months: Number(values.frequency_months) || null,
  frequency_km: Number(values.frequency_km) || null,
  monthly_price_ht: decimalValue(values.monthly_price_ht),
  starts_on: values.starts_on,
});
