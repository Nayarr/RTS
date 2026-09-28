import { z } from 'zod';
import { decimalField, decimalText, decimalValue } from '@/lib/numbers';
import type { WarrantyClaim, WarrantyInput, WarrantyStatus } from './api';

/** Mêmes libellés et couleurs que l'ancienne appli. */
export const WARRANTY_META: Record<WarrantyStatus, { label: string; color: string }> = {
  to_return: { label: 'À retourner', color: '#B5453A' },
  sent: { label: 'Envoyée au fournisseur', color: '#C98A00' },
  accepted: { label: 'Acceptée', color: '#4750B5' },
  refused: { label: 'Refusée', color: '#6B7280' },
  refunded: { label: 'Remboursée / échangée', color: '#2A6B52' },
};
export const WARRANTY_STATUSES = Object.keys(WARRANTY_META) as WarrantyStatus[];

/** En cours : le fournisseur n'a encore ni remboursé ni refusé. */
const OPEN_STATUSES: WarrantyStatus[] = ['to_return', 'sent', 'accepted'];
export const isOpenClaim = (claim: Pick<WarrantyClaim, 'status'>) => OPEN_STATUSES.includes(claim.status);

export type WarrantyFilter = 'open' | 'all' | WarrantyStatus;

export const WARRANTY_FILTERS: { value: WarrantyFilter; label: string }[] = [
  { value: 'open', label: 'En cours' },
  { value: 'all', label: 'Tous' },
  ...WARRANTY_STATUSES.map((status) => ({ value: status, label: WARRANTY_META[status].label })),
];

export const matchesWarrantyFilter = (claim: WarrantyClaim, filter: WarrantyFilter) =>
  filter === 'all' ? true : filter === 'open' ? isOpenClaim(claim) : claim.status === filter;

/** Retours en cours, montant en attente, fournisseurs / marques les plus concernés (5 au plus). */
export function warrantyStats(claims: WarrantyClaim[]) {
  const open = claims.filter(isOpenClaim);
  const counts = new Map<string, number>();
  for (const claim of claims) {
    const key = `${claim.supplier_name ?? '—'}${claim.brand ? ` / ${claim.brand}` : ''}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return {
    openCount: open.length,
    pendingAmount: open.reduce((sum, claim) => sum + (claim.amount_ht ?? 0), 0),
    bySupplier: [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count })),
  };
}

export const warrantySchema = z.object({
  part_name: z.string().trim().min(1, 'Indique la pièce').max(200),
  brand: z.string().trim().max(100),
  supplier_name: z.string().trim().max(150),
  reference: z.string().trim().max(100),
  amount_ht: decimalField(),
  reason: z.string().trim().max(500),
  status: z.enum(['to_return', 'sent', 'accepted', 'refused', 'refunded']),
  notes: z.string().trim().max(1000),
});
export type WarrantyValues = z.infer<typeof warrantySchema>;

/** Préremplissage depuis une pièce d'OR (« Retour »). */
export type WarrantyPreset = Partial<
  Pick<WarrantyInput, 'part_name' | 'brand' | 'supplier_name' | 'reference' | 'amount_ht'>
>;

export const warrantyToForm = (claim: WarrantyClaim | null, preset: WarrantyPreset = {}): WarrantyValues => ({
  part_name: claim?.part_name ?? preset.part_name ?? '',
  brand: (claim ? claim.brand : preset.brand) ?? '',
  supplier_name: (claim ? claim.supplier_name : preset.supplier_name) ?? '',
  reference: (claim ? claim.reference : preset.reference) ?? '',
  amount_ht: decimalText(claim ? claim.amount_ht : preset.amount_ht),
  reason: claim?.reason ?? '',
  status: claim?.status ?? 'to_return',
  notes: claim?.notes ?? '',
});

const orNull = (value: string) => value || null;

export const warrantyFromForm = (values: WarrantyValues): WarrantyInput => ({
  part_name: values.part_name,
  brand: orNull(values.brand),
  supplier_name: values.supplier_name,
  reference: orNull(values.reference),
  amount_ht: decimalValue(values.amount_ht),
  reason: orNull(values.reason),
  status: values.status,
  notes: orNull(values.notes),
});
