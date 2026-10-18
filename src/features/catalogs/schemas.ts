import { z } from 'zod';
import { decimalField, decimalText, decimalValue } from '@/lib/numbers';
import type { Consumable, ConsumableInput, Part, PartInput } from './api';
import { marginPercent } from '@/lib/margin';

const optionalText = z.string().trim().max(120);
const orNull = (value: string) => value.trim() || null;

// ---------------------------------------------------------------- Consommables

export const consumableSchema = z.object({
  name: z.string().trim().min(1, 'Indique le nom').max(120),
  unit: z.string().trim().min(1, 'Indique l’unité').max(10),
  sale_price: decimalField({ required: true }),
  purchase_price: decimalField({ required: true }),
  alert_threshold: decimalField(),
  initial_stock: decimalField(),
});
export type ConsumableValues = z.infer<typeof consumableSchema>;

export const consumableToForm = (c: Consumable | null): ConsumableValues => ({
  name: c?.name ?? '',
  unit: c?.unit ?? 'L',
  sale_price: decimalText(c?.sale_price),
  purchase_price: decimalText(c?.purchase_price),
  alert_threshold: decimalText(c?.alert_threshold),
  initial_stock: '',
});

export const consumableFromForm = (v: ConsumableValues): ConsumableInput => ({
  name: v.name.trim(),
  unit: v.unit.trim(),
  sale_price: decimalValue(v.sale_price) ?? 0,
  purchase_price: decimalValue(v.purchase_price) ?? 0,
  alert_threshold: decimalValue(v.alert_threshold),
});

/** Réapprovisionnement (quantité reçue) ou inventaire (stock compté). */
export const stockSchema = (positive: boolean) =>
  z.object({ quantity: decimalField({ required: true, positive }), note: optionalText });
export type StockValues = z.infer<ReturnType<typeof stockSchema>>;

export const isLowStock = (c: Consumable) => c.alert_threshold !== null && c.stock_qty <= c.alert_threshold;

// ---------------------------------------------------------------- Pièces

export type MarginKind = 'amount' | 'percent';

export const partSchema = z.object({
  designation: z.string().trim().min(1, 'Indique la désignation').max(200),
  vehicle_ref: optionalText,
  manufacturer_ref: optionalText,
  brand: optionalText,
  oem_ref: optionalText,
  supplier_name: optionalText,
  purchase_price: decimalField(),
  shipping_cost: decimalField(),
  margin_kind: z.enum(['amount', 'percent']),
  margin_value: decimalField(),
  sale_price: decimalField(),
});
export type PartValues = z.infer<typeof partSchema>;

export const partToForm = (p: Part | null): PartValues => ({
  designation: p?.designation ?? '',
  vehicle_ref: p?.vehicle_ref ?? '',
  manufacturer_ref: p?.manufacturer_ref ?? '',
  brand: p?.brand ?? '',
  oem_ref: p?.oem_ref ?? '',
  supplier_name: p?.supplier_name ?? '',
  purchase_price: decimalText(p?.purchase_price),
  shipping_cost: decimalText(p?.shipping_cost),
  margin_kind: p?.margin_kind ?? 'percent',
  margin_value: decimalText(p?.margin_value),
  sale_price: decimalText(p?.sale_price),
});

export const partFromForm = (v: PartValues): PartInput => ({
  designation: v.designation.trim(),
  vehicle_ref: orNull(v.vehicle_ref),
  manufacturer_ref: orNull(v.manufacturer_ref),
  brand: orNull(v.brand),
  oem_ref: orNull(v.oem_ref),
  supplier_name: v.supplier_name.trim(),
  purchase_price: decimalValue(v.purchase_price),
  shipping_cost: decimalValue(v.shipping_cost),
  // Marge sur le prix d'achat, calculée depuis les deux prix saisis
  margin_kind: 'percent',
  margin_value: marginPercent(decimalValue(v.purchase_price), decimalValue(v.sale_price)),
  sale_price: decimalValue(v.sale_price),
});
