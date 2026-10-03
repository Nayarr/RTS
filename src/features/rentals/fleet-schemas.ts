import { z } from 'zod';
import { decimalField, decimalText, decimalValue } from '@/lib/numbers';
import type { FleetCategory, FleetVehicle, FleetVehicleInput } from './fleet-api';
import { hasEngine, LICENSE_CATEGORIES } from './fleet-domain';

const integer = (message = 'Nombre entier attendu') => z.string().regex(/^\s*\d{0,7}\s*$/, message);
const intValue = (value: string) => (value.trim() ? Number(value.trim()) : null);
const optionalDate = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Date invalide');

export const FUEL_TYPES = ['Gazole', 'Essence', 'Électrique', 'Hybride', 'GNV'] as const;

export const fleetVehicleSchema = z.object({
  category: z.enum(['tractor', 'trailer', 'van', 'car']),
  plate: z.string().trim().min(2, 'Indique l’immatriculation').max(20),
  brand: z.string().trim().min(1, 'Indique la marque').max(60),
  model: z.string().trim().min(1, 'Indique le modèle').max(80),
  vin: z
    .string()
    .transform((value) => value.replace(/[\s-]/g, '').toUpperCase())
    .refine(
      (value) => value === '' || /^[A-HJ-NPR-Z0-9]{17}$/.test(value),
      'VIN : 17 caractères sans I, O ni Q',
    ),
  first_registration: optionalDate,
  mileage: integer(),
  fuel_type: z.string(),
  tank_liters: integer(),
  license_category: z.enum(LICENSE_CATEGORIES),
  loanable: z.boolean(),
  daily_rate: decimalField({ required: true }),
  km_included_per_day: integer(),
  extra_km_price: decimalField(),
  deposit: decimalField({ required: true }),
  weekend_rate: decimalField(),
  week_rate: decimalField(),
  month_rate: decimalField(),
  franchise: decimalField(),
  fuel_price_per_liter: decimalField({ required: true }),
  cleaning_fee: decimalField({ required: true }),
  late_fee_per_hour: decimalField({ required: true }),
  ct_due_date: optionalDate,
  insurance_due_date: optionalDate,
  next_service_km: integer(),
  photo_file_id: z.string().nullable(),
  notes: z.string().max(2000),
});
export type FleetVehicleValues = z.input<typeof fleetVehicleSchema>;
export type FleetVehicleOutput = z.output<typeof fleetVehicleSchema>;

export const emptyFleetVehicle = (category: FleetCategory = 'van'): FleetVehicleValues => ({
  category,
  plate: '',
  brand: '',
  model: '',
  vin: '',
  first_registration: '',
  mileage: '',
  fuel_type: 'Gazole',
  tank_liters: '',
  license_category: category === 'tractor' ? 'CE' : 'B',
  loanable: true,
  daily_rate: '',
  km_included_per_day: '',
  extra_km_price: '',
  deposit: '',
  weekend_rate: '',
  week_rate: '',
  month_rate: '',
  franchise: '',
  fuel_price_per_liter: '2,20',
  cleaning_fee: '45',
  late_fee_per_hour: '20',
  ct_due_date: '',
  insurance_due_date: '',
  next_service_km: '',
  photo_file_id: null,
  notes: '',
});

const text = (value: number | null | undefined) =>
  value === null || value === undefined ? '' : String(value);

export const fleetVehicleToForm = (vehicle: FleetVehicle): FleetVehicleValues => ({
  category: vehicle.category,
  plate: vehicle.plate,
  brand: vehicle.brand,
  model: vehicle.model,
  vin: vehicle.vin ?? '',
  first_registration: vehicle.first_registration ?? '',
  mileage: text(vehicle.mileage),
  fuel_type: vehicle.fuel_type ?? '',
  tank_liters: text(vehicle.tank_liters),
  license_category: vehicle.license_category as FleetVehicleValues['license_category'],
  loanable: vehicle.loanable,
  daily_rate: decimalText(vehicle.daily_rate),
  km_included_per_day: text(vehicle.km_included_per_day),
  extra_km_price: decimalText(vehicle.extra_km_price),
  deposit: decimalText(vehicle.deposit),
  weekend_rate: decimalText(vehicle.weekend_rate),
  week_rate: decimalText(vehicle.week_rate),
  month_rate: decimalText(vehicle.month_rate),
  franchise: decimalText(vehicle.franchise),
  fuel_price_per_liter: decimalText(vehicle.fuel_price_per_liter),
  cleaning_fee: decimalText(vehicle.cleaning_fee),
  late_fee_per_hour: decimalText(vehicle.late_fee_per_hour),
  ct_due_date: vehicle.ct_due_date ?? '',
  insurance_due_date: vehicle.insurance_due_date ?? '',
  next_service_km: text(vehicle.next_service_km),
  photo_file_id: vehicle.photo_file_id,
  notes: vehicle.notes ?? '',
});

/** Valeurs du formulaire → colonnes ; une remorque n'a ni kilométrage, ni carburant, ni vidange. */
export function fleetVehicleFromForm(values: FleetVehicleOutput): FleetVehicleInput {
  const engine = hasEngine(values.category);
  return {
    category: values.category,
    plate: values.plate.trim().toUpperCase(),
    brand: values.brand.trim(),
    model: values.model.trim(),
    vin: values.vin || null,
    first_registration: values.first_registration || null,
    mileage: engine ? intValue(values.mileage) : null,
    fuel_type: engine ? values.fuel_type || null : null,
    tank_liters: engine ? intValue(values.tank_liters) : null,
    license_category: values.license_category,
    loanable: values.loanable,
    daily_rate: decimalValue(values.daily_rate) ?? 0,
    km_included_per_day: engine ? intValue(values.km_included_per_day) : null,
    extra_km_price: engine ? decimalValue(values.extra_km_price) : null,
    deposit: decimalValue(values.deposit) ?? 0,
    weekend_rate: decimalValue(values.weekend_rate),
    week_rate: decimalValue(values.week_rate),
    month_rate: decimalValue(values.month_rate),
    franchise: decimalValue(values.franchise),
    fuel_price_per_liter: decimalValue(values.fuel_price_per_liter) ?? 0,
    cleaning_fee: decimalValue(values.cleaning_fee) ?? 0,
    late_fee_per_hour: decimalValue(values.late_fee_per_hour) ?? 0,
    ct_due_date: values.ct_due_date || null,
    insurance_due_date: values.insurance_due_date || null,
    next_service_km: engine ? intValue(values.next_service_km) : null,
    photo_file_id: values.photo_file_id,
    notes: values.notes.trim() || null,
  };
}
