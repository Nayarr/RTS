import { technicianOffLabel } from '@/features/planning/domain';
import type { RepairOrderOverview } from '@/features/repair-orders/api';
import { OPEN_STATUSES } from '@/features/repair-orders/constants';
import type { BoardOrder, WorkshopBoard } from './api';

/** L'appareil affiche l'écran atelier au démarrage (comme l'ancienne appli). */
const TV_FLAG = 'rts_tv';

export function isTvMode(): boolean {
  try {
    return localStorage.getItem(TV_FLAG) === '1';
  } catch {
    return false;
  }
}

export function setTvMode(on: boolean) {
  try {
    if (on) localStorage.setItem(TV_FLAG, '1');
    else localStorage.removeItem(TV_FLAG);
  } catch {
    // Stockage indisponible : le mode télé ne sera simplement pas mémorisé.
  }
}

export interface BoardColumn {
  id: string;
  name: string;
  color: string | null;
  /** « Maladie », « Repos »… ; les OR ne sont alors pas affichés. */
  offLabel: string | null;
  cards: BoardOrder[];
}

const hour = (time: string | null) => time?.slice(0, 5) ?? null;

/** Une colonne par technicien : badgeage en cours d'abord, puis par heure prévue ; 4 cartes au plus. */
export function boardColumns(board: WorkshopBoard): BoardColumn[] {
  return board.technicians.map((technician) => {
    const offLabel = technicianOffLabel(technician, board.today, board.leaves, board.rest_reference_monday);
    const cards = board.orders
      .filter((order) => order.technician_id === technician.id)
      .sort(
        (a, b) =>
          Number(b.running) - Number(a.running) ||
          (hour(a.planned_start) ?? '99').localeCompare(hour(b.planned_start) ?? '99'),
      )
      .slice(0, 4);
    return { id: technician.id, name: technician.name, color: technician.color, offLabel, cards };
  });
}

/** « ● En cours — 14:00→16:00 — 📦 attente pièces » */
export function cardMeta(order: BoardOrder): string {
  const planned = hour(order.planned_start);
  return [
    order.running ? '● En cours' : 'À faire',
    planned ? `${planned}${order.planned_end ? `→${hour(order.planned_end)}` : ''}` : null,
    order.parts_pending ? '📦 attente pièces' : null,
  ]
    .filter(Boolean)
    .join(' — ');
}

/** « 10:30 AB-123-CD (Transports Dupont) • … » */
export const expectedVehicles = (board: WorkshopBoard) =>
  board.appointments
    .map((appointment) =>
      [
        hour(appointment.start_time),
        appointment.plate,
        appointment.client_name && `(${appointment.client_name})`,
      ]
        .filter(Boolean)
        .join(' '),
    )
    .join(' • ');

/** OR des véhicules à l'atelier (assignés ou en cours), triés par technicien. */
export const workshopOrders = (orders: RepairOrderOverview[]) =>
  orders
    .filter((order) => OPEN_STATUSES.includes(order.status))
    .sort((a, b) => (a.technician_name ?? '').localeCompare(b.technician_name ?? '', 'fr'));
