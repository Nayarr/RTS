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

/** OR créé sans technicien : « Non assigné » au lieu de « Assigné ». */
export const UNASSIGNED_META = { label: 'Non assigné', color: '#B45309' };

export const STATUS_ORDER: RepairOrderStatus[] = [
  'assigned',
  'in_progress',
  'work_done',
  'quote_pending',
  'to_invoice',
  'invoiced',
];

/**
 * Catégorie des listes et du tableau de bord : un OR « assigned » sans technicien est à part ;
 * « Devis envoyé » : devis en attente de la réponse du client ; « Facture envoyée » : facture partie.
 */
export type RepairOrderCategory = RepairOrderStatus | 'unassigned' | 'quote_sent' | 'invoice_sent';

export const CATEGORY_META: Record<RepairOrderCategory, { label: string; color: string }> = {
  unassigned: UNASSIGNED_META,
  ...STATUS_META,
  quote_sent: { label: 'Devis envoyé', color: '#8A4FB5' },
  invoice_sent: { label: 'Facture envoyée', color: '#2F6F8F' },
};

export const CATEGORY_ORDER: RepairOrderCategory[] = [
  'unassigned',
  'assigned',
  'in_progress',
  'work_done',
  'quote_pending',
  'quote_sent',
  'to_invoice',
  'invoiced',
  'invoice_sent',
];

/** Catégories des OR encore à traiter (compteurs du menu et du tableau de bord). */
export const OPEN_CATEGORIES = CATEGORY_ORDER.filter(
  (category) => category !== 'invoiced' && category !== 'invoice_sent',
);

export const orderCategory = (order: {
  status: RepairOrderStatus;
  /** Absent : OR considéré comme assigné. */
  technician_id?: string | null;
  quote_sent?: boolean | null;
  invoice_sent?: boolean | null;
}): RepairOrderCategory => {
  if (order.status === 'assigned' && order.technician_id === null) return 'unassigned';
  if (order.status === 'quote_pending' && order.quote_sent) return 'quote_sent';
  if (order.status === 'invoiced' && order.invoice_sent) return 'invoice_sent';
  return order.status;
};

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

/** Durée en heures et minutes, avec son unité : 540 s → « 9 min », 5400 s → « 1h30 », 7200 s → « 2h ». */
export function formatShortDuration(totalSeconds: number | null | undefined): string {
  const minutesTotal = Math.max(0, Math.round((totalSeconds ?? 0) / 60));
  const hours = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours}h` : `${hours}h${String(minutes).padStart(2, '0')}`;
}

/** Heures décimales lisibles : 1.5 → « 1,5 h ». */
export const formatHours = (hours: number | null | undefined) =>
  `${(hours ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} h`;

export const formatDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '-';

export const formatDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';
