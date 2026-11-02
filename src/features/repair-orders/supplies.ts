import { z } from 'zod';
import type { Part } from '@/features/catalogs/api';
import { decimalField, decimalText, decimalValue } from '@/lib/numbers';
import type { RoLine } from './api';
import { todayIso } from './schemas';
import type {
  PartLineInput,
  PartOrderStatus,
  Subcontract,
  SubcontractInput,
  SubcontractStatus,
} from './supplies-api';

/** Couleurs de l'ancienne appli. */
export const PART_ORDER_META: Record<PartOrderStatus, { label: string; color: string }> = {
  to_order: { label: 'À commander', color: '#B5453A' },
  ordered: { label: 'Commandée', color: '#C98A00' },
  received: { label: 'Reçue', color: '#2A6B52' },
};

export const SUBCONTRACT_META: Record<SubcontractStatus, { label: string; color: string }> = {
  sent: { label: 'Chez le prestataire', color: '#C98A00' },
  returned: { label: 'Revenu', color: '#2A6B52' },
};

export const isLateSubcontract = (subcontract: Subcontract, today = todayIso()) =>
  subcontract.status === 'sent' &&
  subcontract.expected_return_on !== null &&
  subcontract.expected_return_on < today;

const optionalText = z.string().trim().max(120);
const orNull = (value: string) => value.trim() || null;

// ---------------------------------------------------------------- Pièces

export const partLineSchema = z.object({
  description: z.string().trim().min(1, 'Indique la désignation').max(500),
  quantity: decimalField({ required: true, positive: true }),
  unit_price: decimalField(),
  purchase_price: decimalField(),
  shipping_cost: decimalField(),
  supplier_name: optionalText,
  brand: optionalText,
  /** Référence véhicule : gardée sur la pièce de la base, pas sur la ligne de l'OR. */
  vehicle_ref: optionalText,
  manufacturer_ref: optionalText,
  oem_ref: optionalText,
  part_id: z.string(),
  order_status: z.enum(['to_order', 'ordered', 'received']),
});
export type PartLineValues = z.infer<typeof partLineSchema>;

export const partLineToForm = (line: RoLine | null, supplierName: string | null): PartLineValues => ({
  description: line?.description ?? '',
  quantity: decimalText(line?.quantity ?? 1),
  unit_price: decimalText(line?.unit_price),
  purchase_price: decimalText(line?.purchase_price),
  shipping_cost: decimalText(line?.shipping_cost),
  supplier_name: supplierName ?? '',
  brand: line?.brand ?? '',
  vehicle_ref: '',
  manufacturer_ref: line?.manufacturer_ref ?? '',
  oem_ref: line?.oem_ref ?? '',
  part_id: line?.part_id ?? '',
  order_status: line?.order_status ?? 'to_order',
});

/** Pièce du catalogue → champs du formulaire (la quantité et le suivi sont conservés). */
export const partFromCatalog = (part: Part, current: PartLineValues): PartLineValues => ({
  ...current,
  description: part.designation,
  unit_price: decimalText(part.sale_price),
  purchase_price: decimalText(part.purchase_price),
  supplier_name: part.supplier_name ?? '',
  brand: part.brand ?? '',
  vehicle_ref: part.vehicle_ref ?? '',
  manufacturer_ref: part.manufacturer_ref ?? '',
  oem_ref: part.oem_ref ?? '',
  part_id: part.id,
});

export const partLineFromForm = (v: PartLineValues): PartLineInput => ({
  description: v.description.trim(),
  quantity: decimalValue(v.quantity) ?? 1,
  unit_price: decimalValue(v.unit_price),
  purchase_price: decimalValue(v.purchase_price),
  shipping_cost: decimalValue(v.shipping_cost),
  supplier_name: v.supplier_name.trim(),
  brand: orNull(v.brand),
  manufacturer_ref: orNull(v.manufacturer_ref),
  oem_ref: orNull(v.oem_ref),
  part_id: v.part_id || null,
  order_status: v.order_status,
});

/** Total de vente HT d'une pièce (quantité × prix unitaire). */
export const partLineTotal = (line: RoLine) => (line.unit_price ?? 0) * line.quantity;

// ---------------------------------------------------------------- Sous-traitance

export const subcontractSchema = z
  .object({
    service: z.string().trim().min(1, 'Indique la prestation').max(200),
    supplier_name: z.string().trim().min(1, 'Indique le prestataire').max(120),
    cost_ht: decimalField({ required: true }),
    margin_percent: decimalField({ required: true }),
    sent_on: z.string().min(1, 'Indique la date d’envoi'),
    expected_return_on: z.string(),
    status: z.enum(['sent', 'returned']),
  })
  .superRefine((values, ctx) => {
    if (values.expected_return_on && values.expected_return_on < values.sent_on) {
      ctx.addIssue({
        code: 'custom',
        path: ['expected_return_on'],
        message: 'Le retour ne peut pas précéder l’envoi',
      });
    }
  });
export type SubcontractValues = z.infer<typeof subcontractSchema>;

export const subcontractToForm = (s: Subcontract | null): SubcontractValues => ({
  service: s?.service ?? '',
  supplier_name: s?.supplier_name ?? '',
  cost_ht: decimalText(s?.cost_ht),
  margin_percent: decimalText(s?.margin_percent ?? 20),
  sent_on: s?.sent_on ?? todayIso(),
  expected_return_on: s?.expected_return_on ?? '',
  status: s?.status ?? 'sent',
});

/** Date de retour posée quand le travail revient (conservée si déjà connue). */
export const subcontractFromForm = (v: SubcontractValues, current: Subcontract | null): SubcontractInput => ({
  service: v.service.trim(),
  supplier_name: v.supplier_name.trim(),
  cost_ht: decimalValue(v.cost_ht) ?? 0,
  margin_percent: decimalValue(v.margin_percent) ?? 0,
  sent_on: v.sent_on,
  expected_return_on: v.expected_return_on || null,
  status: v.status,
  returned_on: v.status === 'returned' ? (current?.returned_on ?? todayIso()) : null,
});

/** Prix de revente HT calculé comme la base (coût × (1 + marge)). */
export const resalePrice = (cost: number | null, margin: number | null) =>
  cost === null || margin === null || Number.isNaN(cost) || Number.isNaN(margin)
    ? null
    : Math.round(cost * (1 + margin / 100) * 100) / 100;

// ---------------------------------------------------------------- Consommables

export const consumableUseSchema = z.object({
  consumable_id: z.string().min(1, 'Choisis le produit'),
  quantity: decimalField({ required: true, positive: true }),
});
export type ConsumableUseValues = z.infer<typeof consumableUseSchema>;
