import type { FleetVehicle } from './fleet-api';
import { hasEngine, vehicleTitle } from './fleet-domain';
import type {
  InvoiceLineDraft,
  PhotoSlot,
  Rental,
  RentalInspection,
  RentalKind,
  RentalOverview,
  RentalStatus,
} from './rental-api';

/** Valeur renseignée (ni null ni undefined). */
export const present = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;

export const KIND_LABELS: Record<RentalKind, string> = { rental: 'Location', loan: 'Prêt' };

const STATUS: Record<RentalStatus, { label: string; tone: string }> = {
  reserved: { label: 'Réservée', tone: 's-blue' },
  active: { label: 'En cours', tone: 's-green' },
  returned: { label: 'À facturer', tone: 's-invoice' },
  closed: { label: 'Clôturée', tone: 's-grey' },
  cancelled: { label: 'Annulée', tone: 's-grey' },
};

/** Statut affiché : « En retard » pour un véhicule sorti au-delà du retour prévu. */
export function rentalStatus(rental: Pick<RentalOverview, 'status' | 'is_late' | 'kind'>) {
  if (rental.status === 'active' && rental.is_late) return { label: 'En retard', tone: 's-bad' };
  const status = STATUS[rental.status];
  if (rental.kind === 'loan' && rental.status === 'reserved') return { label: 'Prévu', tone: status.tone };
  return status;
}

export const RENTAL_STEPS = [
  'Client et véhicule',
  'Permis',
  'Tarifs et caution',
  'État des lieux',
  'Contrat et signature',
];

export const SIDE_SLOTS: { slot: Exclude<PhotoSlot, 'dashboard' | 'closeup'>; label: string }[] = [
  { slot: 'front', label: 'Avant' },
  { slot: 'back', label: 'Arrière' },
  { slot: 'left', label: 'Côté gauche' },
  { slot: 'right', label: 'Côté droit' },
];

export const RATE_PERIODS = [
  { value: 'day', label: 'Jour', unit: 'jour', units: 'jours' },
  { value: 'weekend', label: 'Week-end', unit: 'week-end', units: 'week-ends' },
  { value: 'week', label: 'Semaine', unit: 'semaine', units: 'semaines' },
  { value: 'month', label: 'Mois', unit: 'mois', units: 'mois' },
] as const;
export type RatePeriod = (typeof RATE_PERIODS)[number]['value'];

export const DEPOSIT_MODES = [
  { value: 'card_hold', label: 'Empreinte de carte bancaire' },
  { value: 'cheque', label: 'Chèque' },
  { value: 'cash', label: 'Espèces' },
  { value: 'transfer', label: 'Virement' },
] as const;

/** Équipements remis avec le véhicule (cochés au départ, vérifiés au retour). */
export const DEFAULT_EQUIPMENT = [
  'Carte grise (copie)',
  'Attestation d’assurance',
  'Gilet et triangle',
  'Sangles',
  '2 clés',
];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Jours facturés : chaque tranche de 24 h commencée (1 jour minimum). */
export function rentalDays(departure: string, plannedReturn: string): number {
  const span = Date.parse(plannedReturn) - Date.parse(departure);
  if (!Number.isFinite(span) || span <= 0) return 1;
  return Math.max(1, Math.ceil(span / DAY - 1 / 24)); // 1 h de tolérance
}

/** Nombre de périodes pour le tarif choisi (week-end : 1 ; semaine : 7 jours ; mois : 30 jours). */
export function periodsFor(period: RatePeriod, days: number): number {
  if (period === 'week') return Math.max(1, Math.ceil(days / 7));
  if (period === 'month') return Math.max(1, Math.ceil(days / 30));
  if (period === 'weekend') return 1;
  return days;
}

/** Prix de la grille du véhicule pour la période, sinon prix du jour. */
export function vehicleRate(vehicle: FleetVehicle, period: RatePeriod): number {
  const rate =
    period === 'weekend'
      ? vehicle.weekend_rate
      : period === 'week'
        ? vehicle.week_rate
        : period === 'month'
          ? vehicle.month_rate
          : vehicle.daily_rate;
  return rate ?? vehicle.daily_rate;
}

export const round2 = (value: number) => Math.round(value * 100) / 100;

/** Montant de location HT (avant frais du retour). */
export const rentalBase = (rental: Pick<Rental, 'unit_price' | 'periods' | 'discount_percent'>) =>
  round2(rental.unit_price * rental.periods * (1 - rental.discount_percent / 100));

export interface ReturnFees {
  distance: number | null;
  extraKm: number;
  missingEighths: number;
  missingLiters: number;
  lateHours: number;
}

/** Écarts constatés au retour : km en plus, carburant manquant, heures de retard (1 h de tolérance). */
export function returnFees(
  rental: Pick<Rental, 'km_included' | 'planned_return_at'>,
  vehicle: Pick<FleetVehicle, 'tank_liters' | 'category'>,
  departure: Pick<RentalInspection, 'mileage' | 'fuel_eighths'> | undefined,
  back: Pick<RentalInspection, 'mileage' | 'fuel_eighths'> | undefined,
  returnedAt: string,
): ReturnFees {
  const engine = hasEngine(vehicle.category);
  const distance =
    engine && present(departure?.mileage) && present(back?.mileage) ? back.mileage - departure.mileage : null;
  const extraKm =
    distance !== null && present(rental.km_included) ? Math.max(0, distance - rental.km_included) : 0;
  const missingEighths =
    engine && present(departure?.fuel_eighths) && present(back?.fuel_eighths)
      ? Math.max(0, departure.fuel_eighths - back.fuel_eighths)
      : 0;
  const missingLiters = vehicle.tank_liters ? Math.round((vehicle.tank_liters * missingEighths) / 8) : 0;
  const lateMs = Date.parse(returnedAt) - Date.parse(rental.planned_return_at);
  const lateHours = lateMs > HOUR ? Math.ceil(lateMs / HOUR) : 0;
  return { distance, extraKm, missingEighths, missingLiters, lateHours };
}

export interface ProposedLine extends InvoiceLineDraft {
  key: string;
  detail: string;
  /** Proposée cochée (sinon à décider au comptoir). */
  checked: boolean;
}

const frDateTime = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace(' ', ' à ');

/** Lignes proposées pour la facture du retour (modifiables et décochables au comptoir). */
export function proposedLines(
  rental: Pick<
    Rental,
    | 'unit_price'
    | 'periods'
    | 'discount_percent'
    | 'rate_period'
    | 'departure_at'
    | 'extra_km_price'
    | 'fuel_price_per_liter'
    | 'late_fee_per_hour'
    | 'cleaning_fee'
    | 'km_included'
    | 'kind'
    | 'billable'
  >,
  vehicle: Pick<FleetVehicle, 'plate' | 'brand' | 'model'>,
  fees: ReturnFees,
  returnedAt: string,
  clean: boolean | null,
): ProposedLine[] {
  if (rental.kind === 'loan' && !rental.billable) return [];
  const period = RATE_PERIODS.find((entry) => entry.value === rental.rate_period) ?? RATE_PERIODS[0];
  const unitPrice = round2(rental.unit_price * (1 - rental.discount_percent / 100));
  const lines: ProposedLine[] = [
    {
      key: 'base',
      description: `${rental.kind === 'loan' ? 'Prêt' : 'Location'} ${vehicleTitle(vehicle)} · ${vehicle.plate}`,
      detail: `du ${frDateTime(rental.departure_at)} au ${frDateTime(returnedAt)} · ${rental.periods} ${
        rental.periods > 1 ? period.units : period.unit
      }`,
      quantity: rental.periods,
      unit_price: unitPrice,
      checked: true,
    },
  ];
  if (fees.extraKm > 0 && rental.extra_km_price) {
    lines.push({
      key: 'km',
      description: 'Kilomètres supplémentaires',
      detail: `${fees.distance ?? 0} km parcourus · ${rental.km_included ?? 0} km inclus`,
      quantity: fees.extraKm,
      unit_price: rental.extra_km_price,
      checked: true,
    });
  }
  if (fees.missingLiters > 0 && rental.fuel_price_per_liter) {
    lines.push({
      key: 'fuel',
      description: 'Carburant manquant',
      detail: `rendu avec ${fees.missingEighths}/8 de moins · ≈ ${fees.missingLiters} L`,
      quantity: fees.missingLiters,
      unit_price: rental.fuel_price_per_liter,
      checked: true,
    });
  }
  if (fees.lateHours > 0 && rental.late_fee_per_hour) {
    lines.push({
      key: 'late',
      description: 'Retard de restitution',
      detail: `${fees.lateHours} h après le retour prévu`,
      quantity: fees.lateHours,
      unit_price: rental.late_fee_per_hour,
      checked: true,
    });
  }
  if (rental.cleaning_fee) {
    lines.push({
      key: 'cleaning',
      description: 'Forfait nettoyage',
      detail: clean === false ? 'véhicule rendu sale' : 'non appliqué si le véhicule est rendu propre',
      quantity: 1,
      unit_price: rental.cleaning_fee,
      checked: clean === false,
    });
  }
  return lines;
}

export const lineTotal = (line: InvoiceLineDraft) => round2(line.quantity * line.unit_price);

/** Fuseau de l'atelier : « AAAA-MM-JJ » et « HH:MM » à Paris → instant ISO. */
export function parisInstant(date: string, time: string): string {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(guess);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  const [h = 0, m = 0] = time.split(':').map(Number);
  let offset = (hour * 60 + minute - (h * 60 + m)) * 60_000;
  if (offset > 12 * HOUR) offset -= DAY;
  if (offset < -12 * HOUR) offset += DAY;
  return new Date(guess.getTime() - offset).toISOString();
}

/** Instant ISO → { date, time } à Paris (champs de formulaire). */
export function parisParts(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

/** « lun. 05/10 · 09:30 » à Paris. */
export function shortDateTime(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Véhicule libre sur la période (hors contrat en cours de modification). */
export function vehicleFree(
  vehicleId: string,
  busy: Pick<Rental, 'id' | 'fleet_vehicle_id' | 'departure_at' | 'planned_return_at'>[],
  from: string,
  to: string,
  ignoreId?: string,
) {
  const start = Date.parse(from);
  const end = Date.parse(to);
  return !busy.some(
    (period) =>
      period.fleet_vehicle_id === vehicleId &&
      period.id !== ignoreId &&
      Date.parse(period.departure_at) < end &&
      Date.parse(period.planned_return_at) > start,
  );
}

export const FUEL_LABELS = ['vide', '1/8', '1/4', '3/8', '1/2', '5/8', '3/4', '7/8', 'plein'];
export const fuelLabel = (eighths: number | null | undefined) =>
  !present(eighths) ? '—' : `${FUEL_LABELS[eighths]} (${eighths}/8)`;
