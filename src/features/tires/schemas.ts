import { z } from 'zod';
import { decimalField, decimalText, decimalValue } from '@/lib/numbers';
import type { AddTiresInput, TireLot, TireLotUpdate } from './api';
import { isTireSize, type TireCategory } from './domain';

const text = z.string().trim().max(120);
const orNull = (value: string) => value.trim() || null;

/** Nombre entier de pneus (vide accepté si facultatif). */
export const countField = (required: boolean) =>
  z
    .string()
    .trim()
    .refine((value) => (required ? value !== '' : true), 'Champ obligatoire')
    .refine((value) => value === '' || /^\d{1,4}$/.test(value), 'Nombre de pneus attendu (ex : 4)');

export const tireSchema = z.object({
  category: z.enum(['pl', 'vul']),
  condition: z.enum(['neuf', 'rechape', 'occasion']),
  profile: z.enum(['avant', 'arriere', 'remorque', 'toutes']),
  size: z.string().refine(isTireSize, 'Dimension incomplète : tape par exemple 31580225'),
  brand: z.string().trim().min(1, 'Indique la marque').max(60),
  model: text,
  load_index: text,
  quantity: countField(false),
  min_qty: countField(false),
  location: text,
  dot: text,
  purchase_price: decimalField(),
  sale_price: decimalField(),
  supplier_name: text,
});
export type TireValues = z.infer<typeof tireSchema>;

export const emptyTire = (category: TireCategory = 'pl'): TireValues => ({
  category,
  condition: 'neuf',
  profile: category === 'vul' ? 'toutes' : 'avant',
  size: '',
  brand: '',
  model: '',
  load_index: '',
  quantity: '',
  min_qty: '',
  location: '',
  dot: '',
  purchase_price: '',
  sale_price: '',
  supplier_name: '',
});

export const tireToForm = (lot: TireLot): TireValues => ({
  category: lot.category,
  condition: lot.condition,
  profile: lot.profile,
  size: lot.size,
  brand: lot.brand_name,
  model: lot.model,
  load_index: lot.load_index ?? '',
  quantity: '',
  min_qty: '',
  location: lot.location ?? '',
  dot: lot.dot ?? '',
  purchase_price: decimalText(lot.purchase_price),
  sale_price: decimalText(lot.sale_price),
  supplier_name: lot.supplier_name ?? '',
});

const count = (value: string) => (value.trim() === '' ? null : Number(value));

export const addTiresFromForm = (values: TireValues, supplierId: string | null): AddTiresInput => ({
  category: values.category,
  size: values.size,
  profile: values.profile,
  brand: values.brand.trim(),
  model: values.model.trim(),
  condition: values.condition,
  quantity: count(values.quantity) ?? 0,
  purchase_price: decimalValue(values.purchase_price),
  sale_price: decimalValue(values.sale_price),
  supplier_id: supplierId,
  load_index: orNull(values.load_index),
  location: orNull(values.location),
  dot: orNull(values.dot),
  min_qty: count(values.min_qty),
});

export const lotUpdateFromForm = (
  values: TireValues,
  brandId: string,
  supplierId: string | null,
): TireLotUpdate => ({
  brand_id: brandId,
  model: values.model.trim(),
  condition: values.condition,
  load_index: orNull(values.load_index),
  location: orNull(values.location),
  dot: orNull(values.dot),
  supplier_id: supplierId,
  purchase_price: decimalValue(values.purchase_price),
  sale_price: decimalValue(values.sale_price),
});

/** Arrivage d'un lot : quantité reçue, prix d'achat, fournisseur, bon de livraison. */
export const receiveSchema = z.object({
  quantity: countField(true).refine((value) => Number(value) > 0, 'Doit être supérieur à 0'),
  purchase_price: decimalField(),
  supplier_name: text,
  reference: text,
});
export type ReceiveValues = z.infer<typeof receiveSchema>;

/** Sortie (pneus retirés) ou inventaire (stock compté), toujours avec un motif. */
export const correctionSchema = z.object({
  mode: z.enum(['exit', 'count']),
  quantity: countField(true),
  note: z.string().trim().min(1, 'Indique le motif').max(200),
});
export type CorrectionValues = z.infer<typeof correctionSchema>;
