import { z } from 'zod';
import { decimalField, decimalText, decimalValue } from '@/lib/numbers';
import type { PartCore, PartCoreInput, PartCoreStatus } from './api';

export const PART_CORE_META: Record<PartCoreStatus, { label: string; color: string }> = {
  to_return: { label: 'À renvoyer', color: '#B5453A' },
  returned: { label: 'Renvoyée', color: '#C98A00' },
  refunded: { label: 'Remboursée', color: '#2A6B52' },
  refused: { label: 'Refusée', color: '#6B7280' },
};
export const PART_CORE_STATUSES = Object.keys(PART_CORE_META) as PartCoreStatus[];

/** Beaucoup de fournisseurs ne remboursent plus la consigne passé ce délai. */
export const CORE_LATE_DAYS = 30;

/** En cours : consigne pas encore remboursée ni refusée. */
export const isOpenCore = (core: Pick<PartCore, 'status'>) =>
  core.status === 'to_return' || core.status === 'returned';

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.floor(Date.parse(iso.slice(0, 10)) / DAY_MS);

/** Jours d'attente : depuis la déclaration tant qu'elle est au garage, depuis le renvoi ensuite. */
export function coreWaitingDays(
  core: Pick<PartCore, 'status' | 'created_at' | 'returned_on'>,
  today: string,
) {
  if (!isOpenCore(core)) return null;
  const since = core.status === 'returned' && core.returned_on ? core.returned_on : core.created_at;
  return Math.max(0, dayNumber(today) - dayNumber(since));
}

/** Ancienne pièce encore au garage depuis plus de 30 jours. */
export const isLateCore = (core: Pick<PartCore, 'status' | 'created_at' | 'returned_on'>, today: string) =>
  core.status === 'to_return' && (coreWaitingDays(core, today) ?? 0) > CORE_LATE_DAYS;

export type CoreFilter = 'open' | 'all' | PartCoreStatus;

export const CORE_FILTERS: { value: CoreFilter; label: string }[] = [
  { value: 'open', label: 'En cours' },
  ...PART_CORE_STATUSES.map((status) => ({ value: status, label: PART_CORE_META[status].label })),
  { value: 'all', label: 'Toutes' },
];

export const matchesCoreFilter = (core: PartCore, filter: CoreFilter) =>
  filter === 'all' ? true : filter === 'open' ? isOpenCore(core) : core.status === filter;

/** Regroupement par fournisseur (sans fournisseur en dernier), avec le total des consignes. */
export function groupBySupplier(cores: PartCore[]) {
  const groups = new Map<string, PartCore[]>();
  for (const core of cores) {
    const key = core.supplier_name ?? '';
    groups.set(key, [...(groups.get(key) ?? []), core]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'fr')))
    .map(([supplier, items]) => ({
      supplier,
      items,
      total: items.reduce((sum, core) => sum + (core.amount_ht ?? 0), 0),
    }));
}

/** À renvoyer, argent en attente chez les fournisseurs, en retard. */
export function coreStats(cores: PartCore[], today: string) {
  const open = cores.filter(isOpenCore);
  return {
    toReturn: cores.filter((core) => core.status === 'to_return').length,
    pendingAmount: open.reduce((sum, core) => sum + (core.amount_ht ?? 0), 0),
    late: cores.filter((core) => isLateCore(core, today)).length,
  };
}

// ---------------------------------------------------------------- Formulaire de suivi

export const partCoreSchema = z
  .object({
    supplier_name: z.string().trim().max(150),
    amount_ht: decimalField(),
    status: z.enum(['to_return', 'returned', 'refunded', 'refused']),
    returned_on: z.string(),
    refunded_on: z.string(),
    refunded_amount_ht: decimalField(),
    notes: z.string().trim().max(1000),
  })
  .superRefine((values, ctx) => {
    if (values.returned_on && values.refunded_on && values.refunded_on < values.returned_on) {
      ctx.addIssue({
        code: 'custom',
        path: ['refunded_on'],
        message: 'Le remboursement ne peut pas précéder le renvoi',
      });
    }
  });
export type PartCoreValues = z.infer<typeof partCoreSchema>;

export const partCoreToForm = (core: PartCore): PartCoreValues => ({
  supplier_name: core.supplier_name ?? '',
  amount_ht: decimalText(core.amount_ht),
  status: core.status,
  returned_on: core.returned_on ?? '',
  refunded_on: core.refunded_on ?? '',
  refunded_amount_ht: decimalText(core.refunded_amount_ht),
  notes: core.notes ?? '',
});

/** Dates et avoir effacés quand le statut ne les concerne pas (la base fait de même). */
export const partCoreFromForm = (values: PartCoreValues): PartCoreInput => {
  const sent = values.status !== 'to_return';
  const refunded = values.status === 'refunded';
  return {
    supplier_name: values.supplier_name,
    amount_ht: decimalValue(values.amount_ht),
    status: values.status,
    returned_on: sent ? values.returned_on || null : null,
    refunded_on: refunded ? values.refunded_on || null : null,
    refunded_amount_ht: refunded ? decimalValue(values.refunded_amount_ht) : null,
    notes: values.notes || null,
  };
};
