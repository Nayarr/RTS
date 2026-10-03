import { Car, Container, Truck, Bus, type LucideIcon } from 'lucide-react';
import type { FleetCategory, FleetDocumentKind, FleetVehicle } from './fleet-api';

export const CATEGORY_META: Record<
  FleetCategory,
  { label: string; plural: string; hint: string; icon: LucideIcon }
> = {
  tractor: { label: 'Tracteur PL', plural: 'Tracteurs PL', hint: 'permis C / CE', icon: Truck },
  trailer: { label: 'Remorque / semi', plural: 'Semi-remorques', hint: 'sans moteur ni km', icon: Container },
  van: { label: 'Utilitaire', plural: 'Utilitaires', hint: 'permis B · 3,5 t', icon: Bus },
  car: { label: 'Voiture', plural: 'Voitures', hint: 'permis B', icon: Car },
};
export const CATEGORIES = Object.keys(CATEGORY_META) as FleetCategory[];

/** Une remorque n'a ni moteur ni compteur : pas de kilométrage ni de carburant. */
export const hasEngine = (category: FleetCategory) => category !== 'trailer';

export const LICENSE_CATEGORIES = ['B', 'BE', 'C1', 'C', 'CE'] as const;

/** Documents de la boîte à gants, dans l'ordre d'affichage (aucun n'est obligatoire). */
export const GLOVE_BOX: { kind: FleetDocumentKind; label: string }[] = [
  { kind: 'registration', label: 'Carte grise' },
  { kind: 'insurance', label: 'Attestation d’assurance' },
  { kind: 'technical_inspection', label: 'Procès-verbal de contrôle technique' },
  { kind: 'accident_report', label: 'Constat amiable vierge' },
  { kind: 'maintenance_book', label: 'Carnet d’entretien' },
  { kind: 'fuel_card', label: 'Carte carburant' },
];

const DAY = 86_400_000;
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

const frDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Ce qui empêche de louer ou prêter le véhicule à une date (mêmes règles que la base), sinon null. */
export function blockReason(vehicle: FleetVehicle, on: string): string | null {
  if (!vehicle.is_active) return 'Véhicule retiré de la flotte';
  if (vehicle.in_maintenance) return 'Véhicule en entretien';
  if (vehicle.insurance_due_date && vehicle.insurance_due_date < on) {
    return `Assurance expirée le ${frDate(vehicle.insurance_due_date)}`;
  }
  if (vehicle.ct_due_date && vehicle.ct_due_date < on) {
    return `Contrôle technique expiré le ${frDate(vehicle.ct_due_date)}`;
  }
  return null;
}

/** Disponibilité affichée sur la carte du véhicule (statut et couleur du badge). */
export function fleetStatus(vehicle: FleetVehicle, today: string): { label: string; tone: string } {
  if (vehicle.in_maintenance) return { label: 'En entretien', tone: 's-warn' };
  if (blockReason(vehicle, today)) return { label: 'Bloqué', tone: 's-bad' };
  return { label: 'Disponible', tone: 's-ok' };
}

export type DeadlineState = 'ok' | 'soon' | 'late';
export interface FleetDeadline {
  label: string;
  /** Date (JJ/MM/AAAA) ou seuil (« à 50 000 km »). */
  when: string;
  state: DeadlineState;
  /** « Dans 15 jours », « Expirée depuis 5 jours », « Dans 1 790 km »… */
  text: string;
}

const SOON_DAYS = 30;
const SOON_KM = 2_000;
const km = (value: number) => `${value.toLocaleString('fr-FR')} km`;

function dateDeadline(label: string, iso: string, today: string, expired: string): FleetDeadline {
  const days = daysBetween(today, iso);
  const plural = (n: number) => `${n} jour${n > 1 ? 's' : ''}`;
  if (days < 0)
    return { label, when: frDate(iso), state: 'late', text: `${expired} depuis ${plural(-days)}` };
  if (days <= SOON_DAYS) {
    return {
      label,
      when: frDate(iso),
      state: 'soon',
      text: days === 0 ? 'Aujourd’hui' : `Dans ${plural(days)}`,
    };
  }
  return { label, when: frDate(iso), state: 'ok', text: 'OK' };
}

/** Échéances du véhicule : contrôle technique, assurance, vidange (au kilométrage). */
export function fleetDeadlines(vehicle: FleetVehicle, today: string): FleetDeadline[] {
  const list: FleetDeadline[] = [];
  if (vehicle.ct_due_date)
    list.push(dateDeadline('Contrôle technique', vehicle.ct_due_date, today, 'Expiré'));
  if (vehicle.insurance_due_date) {
    list.push(dateDeadline('Assurance', vehicle.insurance_due_date, today, 'Expirée'));
  }
  if (vehicle.next_service_km !== null && hasEngine(vehicle.category)) {
    const left = vehicle.next_service_km - (vehicle.mileage ?? 0);
    list.push({
      label: 'Vidange',
      when: `à ${km(vehicle.next_service_km)}`,
      state: left < 0 ? 'late' : left <= SOON_KM ? 'soon' : 'ok',
      text: left < 0 ? `Dépassée de ${km(-left)}` : left <= SOON_KM ? `Dans ${km(left)}` : 'OK',
    });
  }
  return list;
}

/** Échéance la plus urgente à signaler (expirée d'abord), sinon null. */
export function worstDeadline(vehicle: FleetVehicle, today: string): FleetDeadline | null {
  const list = fleetDeadlines(vehicle, today).filter((deadline) => deadline.state !== 'ok');
  return list.find((deadline) => deadline.state === 'late') ?? list[0] ?? null;
}

export interface FleetDeadlineRow {
  vehicle: FleetVehicle;
  deadline: FleetDeadline;
}

/** Échéances de la flotte à traiter (expirées d'abord, puis à venir), véhicules retirés exclus. */
export function fleetDeadlineRows(fleet: FleetVehicle[], today: string): FleetDeadlineRow[] {
  return fleet
    .filter((vehicle) => vehicle.is_active)
    .flatMap((vehicle) =>
      fleetDeadlines(vehicle, today)
        .filter((deadline) => deadline.state !== 'ok')
        .map((deadline) => ({ vehicle, deadline })),
    )
    .sort((a, b) => Number(b.deadline.state === 'late') - Number(a.deadline.state === 'late'));
}

export const DEADLINE_BADGE: Record<DeadlineState, string> = { ok: 's-ok', soon: 's-warn', late: 's-bad' };

export const vehicleTitle = (vehicle: Pick<FleetVehicle, 'brand' | 'model'>) =>
  `${vehicle.brand} ${vehicle.model}`;
