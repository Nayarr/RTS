// Relance des échéances depuis la page Échéances : un mail par client pour tous ses véhicules en
// situation irrégulière (contrôle dépassé ou dans les 30 jours), jamais deux fois en 3 mois.
import type { SendLinkMessage } from '@/lib/send-links';
import { monthLabel } from '@/lib/month';
import type { VehicleDeadline } from './api';
import { DEADLINE_LABELS, type DeadlineKind } from './domain';

export interface ReminderItem {
  vehicleId: string;
  plate: string;
  kind: DeadlineKind;
  dueDate: string;
}

export interface ReminderClient {
  clientId: string;
  clientName: string;
  email: string | null;
  items: ReminderItem[];
}

const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const frenchDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Échéance relançable : véhicule d'un client, pas relancé depuis moins de 3 mois. */
export const canRemind = (deadline: VehicleDeadline) =>
  Boolean(deadline.client_id && deadline.vehicle_id && deadline.due_date && !deadline.reminded_at);

/** Échéances à relancer regroupées par client (ordre alphabétique), avec l'e-mail de sa fiche. */
export function remindersByClient(deadlines: VehicleDeadline[]): ReminderClient[] {
  const groups = new Map<string, ReminderClient>();
  for (const deadline of deadlines.filter(canRemind)) {
    const clientId = deadline.client_id!;
    const email = deadline.client_email?.trim() ?? '';
    const group = groups.get(clientId) ?? {
      clientId,
      clientName: deadline.client_name ?? 'Client',
      email: VALID_EMAIL.test(email) ? email : null,
      items: [],
    };
    group.items.push({
      vehicleId: deadline.vehicle_id!,
      plate: deadline.plate ?? '',
      kind: (deadline.kind ?? 'ct') as DeadlineKind,
      dueDate: deadline.due_date!,
    });
    groups.set(clientId, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => a.plate.localeCompare(b.plate) || a.dueDate.localeCompare(b.dueDate)),
    }))
    .sort((a, b) => a.clientName.localeCompare(b.clientName));
}

/** « AB-123-CD : contrôle technique dépassé depuis le 12/10/2026 » */
export function reminderLine(item: ReminderItem, today: string): string {
  const label = `${item.plate} : ${DEADLINE_LABELS[item.kind].toLowerCase()}`;
  // Hayon : valable jusqu'à la fin du mois de l'étiquette
  if (item.kind === 'tailgate') {
    const month = monthLabel(item.dueDate);
    return item.dueDate < today ? `${label} dépassé (${month})` : `${label} à faire avant fin ${month}`;
  }
  const date = frenchDate(item.dueDate);
  return item.dueDate < today ? `${label} dépassé depuis le ${date}` : `${label} à faire avant le ${date}`;
}

/** Mail de relance d'un client : la liste de ses véhicules et la façon de prendre rendez-vous. */
export function deadlineReminderMessage(
  group: ReminderClient,
  today: string,
  company: { legal_name: string; email: string | null; phone: string | null },
): SendLinkMessage {
  const lines = group.items.map((item) => `- ${reminderLine(item, today)}`).join('\n');
  const signature = [company.legal_name, company.phone, company.email].filter(Boolean).join('\n');
  const several = group.items.length > 1;
  return {
    subject: `Contrôles de vos véhicules à prévoir · ${company.legal_name}`,
    body:
      `Bonjour,\n\nSauf erreur de notre part, ${several ? 'les contrôles suivants de vos véhicules sont' : 'le contrôle suivant de votre véhicule est'} ` +
      `à faire :\n\n${lines}\n\nNous pouvons nous en charger : répondez à ce mail ou appelez-nous pour ` +
      `prendre rendez-vous.\n\nCordialement,\n${signature}`,
    sms: `${company.legal_name} : ${several ? 'des contrôles de vos véhicules sont' : 'un contrôle de votre véhicule est'} à faire. Appelez-nous pour prendre rendez-vous.`,
  };
}
