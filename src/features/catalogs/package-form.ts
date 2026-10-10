import { z } from 'zod';
import { triggerFieldLabel } from '@/features/repair-orders/inspection';
import { decimalField, decimalText, decimalValue } from '@/lib/numbers';
import type { Enums } from '@/types/database';
import type { PackageInput, ServicePackage } from './api';

export type LaborCategory = Enums<'labor_category'>;

/** Catégories de taux horaire (comme les Réglages) ; « Toutes » = même prix pour tout véhicule. */
export const PACKAGE_CATEGORIES: { value: LaborCategory | ''; label: string }[] = [
  { value: 'pl', label: 'PL' },
  { value: 'vul', label: 'VUL' },
  { value: 'remorque', label: 'Remorque' },
  { value: 'tolerie', label: 'Tôlerie / carrosserie' },
  { value: '', label: 'Toutes catégories (même prix quel que soit le véhicule)' },
];

export const categoryLabel = (category: LaborCategory | null) =>
  category
    ? (PACKAGE_CATEGORIES.find((item) => item.value === category)?.label ?? category)
    : 'Toutes catégories';

export const wearFieldLabel = triggerFieldLabel;

/** Mots-clés saisis séparés par des virgules : chaque groupe doit apparaître en entier dans la ligne de travaux. */
export const parseKeywords = (value: string) => [
  ...new Set(
    value
      .split(',')
      .map((keyword) => keyword.trim().replace(/\s+/g, ' '))
      .filter(Boolean),
  ),
];

export const packageSchema = z.object({
  name: z.string().trim().min(1, 'Indique le nom du forfait').max(150),
  category: z.enum(['pl', 'vul', 'remorque', 'tolerie', '']),
  standard_hours: decimalField({ required: true }),
  price: decimalField(),
  keywords: z.string().max(500),
  trigger_fields: z.array(z.string()),
  details: z.string().max(4000),
});
export type PackageValues = z.infer<typeof packageSchema>;

export const packageToForm = (pkg: ServicePackage | null): PackageValues => ({
  name: pkg?.name ?? '',
  category: pkg ? (pkg.category ?? '') : 'pl',
  standard_hours: decimalText(pkg?.standard_hours),
  price: decimalText(pkg?.price),
  keywords: pkg?.keywords.join(', ') ?? '',
  trigger_fields: pkg?.trigger_fields ?? [],
  details: pkg?.details ?? '',
});

export const packageFromForm = (values: PackageValues): PackageInput => ({
  name: values.name.trim(),
  category: values.category || null,
  standard_hours: decimalValue(values.standard_hours) ?? 0,
  price: decimalValue(values.price),
  keywords: parseKeywords(values.keywords),
  trigger_fields: values.trigger_fields,
  details: values.details.trim() || null,
});
