import type { Database } from '@/types/database';

export type RepairOrderStatus = Database['public']['Enums']['repair_order_status'];
export type VehicleType = Database['public']['Enums']['vehicle_type'];

/** Libellés et couleurs des statuts (repris de l'ancienne appli). */
export const STATUS_META: Record<RepairOrderStatus, { label: string; color: string }> = {
  assigned: { label: 'Assigné', color: '#6B7280' },
  in_progress: { label: 'En cours', color: '#C98A00' },
  work_done: { label: 'Terminé atelier', color: '#2A6B52' },
  quote_pending: { label: 'Devis à faire', color: '#E8551E' },
  to_invoice: { label: 'Facture à faire', color: '#4750B5' },
  invoiced: { label: 'Facturé', color: '#1F4D3D' },
};

export const STATUS_ORDER: RepairOrderStatus[] = [
  'assigned',
  'in_progress',
  'work_done',
  'quote_pending',
  'to_invoice',
  'invoiced',
];

/** Statuts pendant lesquels le technicien assigné peut encore travailler sur l'OR. */
export const OPEN_STATUSES: RepairOrderStatus[] = ['assigned', 'in_progress'];

export const VEHICLE_TYPES: Record<VehicleType, string> = { pl: 'PL', vul: 'VUL', remorque: 'Remorque' };

/** Même normalisation que la base (normalize_key) : « ab-123 cd » → « AB123CD ». */
export const normalizeKey = (value: string) => value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/**
 * Mise en forme d'une plaque pendant la saisie : format SIV « AB-123-CD » quand la saisie
 * y correspond, sinon laissée telle quelle en majuscules (anciennes plaques, plaques étrangères).
 */
export function formatPlate(value: string): string {
  const clean = normalizeKey(value);
  const siv = /^([A-Z]{1,2})(\d{0,3})([A-Z]{0,2})$/.exec(clean);
  if (!siv || (siv[3] && siv[2]?.length !== 3) || (siv[2] && siv[1]?.length !== 2)) {
    return value.toUpperCase().replace(/\s+/g, ' ').trimStart();
  }
  return [siv[1], siv[2], siv[3]].filter(Boolean).join('-');
}

/** Durée lisible : « 2h 05min », « 45 min ». */
export function formatDuration(totalSeconds: number | null | undefined): string {
  const seconds = Math.max(0, Math.round(totalSeconds ?? 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}min` : `${minutes} min`;
}

/** Heures décimales lisibles : 1.5 → « 1,5 h ». */
export const formatHours = (hours: number | null | undefined) =>
  `${(hours ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} h`;

export const formatDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

export const formatDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
