import { z } from 'zod';
import type { AppSettings, CompanySettings, LaborRate } from './api';
import { bankValue, bicField, formatIban, ibanField } from '@/lib/iban';
import { formatSiret, siretField, siretValue } from '@/lib/siret';

const digits = (value: string) => value.replace(/\s/g, '');
const optionalText = z.string().trim().max(200);
const toNull = (value: string) => (value === '' ? null : value);

const number = (message: string) => z.number({ error: message }).refine(Number.isFinite, message);
const money = number('Montant attendu').min(0, 'Montant positif attendu');

// ---------------------------------------------------------------- Entreprise

export const companySchema = z.object({
  legal_name: z.string().trim().min(1, 'Indique la raison sociale').max(120),
  legal_form: optionalText,
  share_capital: optionalText,
  address_line: z.string().trim().min(1, 'Indique l’adresse').max(200),
  postal_code: z
    .string()
    .trim()
    .regex(/^\d{5}$/, 'Code postal à 5 chiffres'),
  city: z.string().trim().min(1, 'Indique la ville').max(100),
  email: z.union([z.literal(''), z.email('Adresse e-mail invalide')]),
  phone: optionalText,
  siret: siretField,
  vat_number: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || /^[A-Z]{2}[0-9A-Z]{2,13}$/.test(digits(v).toUpperCase()),
      'N° de TVA invalide',
    ),
  rcs: optionalText,
  /** RIB imprimé sur les factures (règlement par virement). */
  iban: ibanField,
  bic: bicField,
});
export type CompanyValues = z.infer<typeof companySchema>;

export const companyToForm = (c: CompanySettings): CompanyValues => ({
  legal_name: c.legal_name,
  legal_form: c.legal_form ?? '',
  share_capital: c.share_capital ?? '',
  address_line: c.address_line,
  postal_code: c.postal_code,
  city: c.city,
  email: c.email ?? '',
  phone: c.phone ?? '',
  siret: formatSiret(c.siret),
  vat_number: c.vat_number ?? '',
  rcs: c.rcs ?? '',
  iban: formatIban(c.iban),
  bic: c.bic ?? '',
});

export const companyFromForm = (v: CompanyValues) => ({
  ...v,
  legal_form: toNull(v.legal_form),
  share_capital: toNull(v.share_capital),
  email: toNull(v.email.toLowerCase()),
  phone: toNull(v.phone),
  siret: siretValue(v.siret),
  vat_number: toNull(digits(v.vat_number).toUpperCase()),
  rcs: toNull(v.rcs),
  iban: bankValue(v.iban),
  bic: bankValue(v.bic),
});

// ---------------------------------------------------------------- Facturation

export const billingSchema = z.object({
  default_vat_rate: number('Taux attendu').min(0, 'Taux entre 0 et 100').max(100, 'Taux entre 0 et 100'),
  payment_terms_days: number('Nombre de jours attendu')
    .int('Nombre entier')
    .min(0)
    .max(365, '365 jours maximum'),
  quote_validity_days: number('Nombre de jours attendu')
    .int('Nombre entier')
    .min(1, '1 jour minimum')
    .max(365),
  /** Une mention par ligne. */
  invoice_legal_mentions: z.string().max(5000),
  /** Montant HT de la ligne « Fournitures et recyclage » ; vide = aucune ligne. */
  supplies_fee_ht: z
    .string()
    .regex(/^\s*(\d{1,6}([.,]\d{1,2})?)?\s*$/, 'Montant en euros (ex : 15 ou 12,50)'),
  /** Mentions d'une facture sans TVA : autoliquidation (Union européenne), exonération (hors Union). */
  vat_exempt_mention_eu: z.string().trim().min(1, 'Indique la mention').max(500),
  vat_exempt_mention_other: z.string().trim().min(1, 'Indique la mention').max(500),
});
export type BillingValues = z.infer<typeof billingSchema>;

export const billingToForm = (c: CompanySettings): BillingValues => ({
  default_vat_rate: c.default_vat_rate,
  payment_terms_days: c.payment_terms_days,
  quote_validity_days: c.quote_validity_days,
  invoice_legal_mentions: c.invoice_legal_mentions.join('\n'),
  supplies_fee_ht: c.supplies_fee_ht === null ? '' : String(c.supplies_fee_ht).replace('.', ','),
  vat_exempt_mention_eu: c.vat_exempt_mention_eu,
  vat_exempt_mention_other: c.vat_exempt_mention_other,
});

export const billingFromForm = (v: BillingValues) => ({
  ...v,
  supplies_fee_ht: v.supplies_fee_ht.trim() ? Number(v.supplies_fee_ht.trim().replace(',', '.')) : null,
  invoice_legal_mentions: v.invoice_legal_mentions
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean),
});

// ---------------------------------------------------------------- Taux horaires

export const laborRatesSchema = z.object({
  rates: z.array(
    z.object({
      id: z.string(),
      category: z.enum(['pl', 'vul', 'remorque', 'tolerie']).nullable(),
      label: z.string().trim().min(1, 'Indique le libellé').max(40),
      labor_line_label: z.string().trim().min(1, 'Indique le libellé sur les documents').max(120),
      hourly_rate: money,
    }),
  ),
});
export type LaborRatesValues = z.infer<typeof laborRatesSchema>;

export const laborRatesToForm = (rates: LaborRate[]): LaborRatesValues => ({
  rates: rates.map(({ id, category, label, labor_line_label, hourly_rate }) => ({
    id,
    category,
    label,
    labor_line_label,
    hourly_rate,
  })),
});

// ---------------------------------------------------------------- Atelier

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure invalide');
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hours = number('Nombre d’heures attendu').min(0).max(24, '24 h maximum');
const km = number('Distance attendue').min(0.1, 'Distance positive attendue').max(1000);
const wholeMinutes = number('Minutes attendues').int('Nombre entier de minutes').min(0);

/** Début d'adresse e-mail (avant le @, le domaine est commun). */
const mailLocal = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/, 'Début d’adresse seul, ex. facturation');

/** Voix Azure proposées (mêmes que la fonction « tts »), Ximena par défaut. */
const TTS_VOICES = [
  'es-ES-XimenaMultilingualNeural',
  'fr-FR-DeniseNeural',
  'fr-FR-HenriNeural',
  'fr-FR-VivienneMultilingualNeural',
  'fr-FR-RemyMultilingualNeural',
  'fr-FR-EloiseNeural',
] as const;

export const workshopSchema = z
  .object({
    workday_start: time,
    lunch_start: time,
    friday_lunch_start: time,
    lunch_end: time,
    workday_end: time,
    overtime_start: time,
    expected_arrival: time,
    late_tolerance: time,
    daily_hours: hours,
    friday_hours: hours,
    roadside_flat_fee: money,
    roadside_zone2_price: money,
    roadside_zone3_price: money,
    roadside_zone1_max_km: km,
    roadside_zone2_max_km: km,
    roadside_zone3_max_km: km,
    roadside_zone1_max_minutes: wholeMinutes,
    roadside_zone2_max_minutes: wholeMinutes,
    roadside_zone3_max_minutes: wholeMinutes,
    roadside_tolerance_minutes: wholeMinutes.max(60, '60 min au plus'),
    roadside_travel_hourly_rate: money,
    clock_photo_retention_months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
    label_scan_enabled: z.boolean(),
    agent_enabled: z.boolean(),
    agent_memo: z.string().max(4000, '4 000 caractères au plus'),
    tts_provider: z.enum(['browser', 'azure']),
    tts_voice: z.enum(TTS_VOICES),
    tts_monthly_limit: z
      .number('Nombre de caractères attendu')
      .int('Nombre entier')
      .min(0, 'Au moins 0')
      .max(500000, '500 000 au plus (niveau gratuit)'),
    mail_send_enabled: z.boolean(),
    auto_mails_enabled: z.boolean(),
    mail_domain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^(([a-z0-9]([a-z0-9-]*[a-z0-9])?.)+[a-z]{2,})?$/, 'Domaine seul, ex. rapidtruckservice.fr'),
    mail_billing_local: mailLocal,
    mail_workshop_local: mailLocal,
    mail_signature_local: mailLocal,
  })
  .superRefine((v, ctx) => {
    const order: [keyof typeof v, keyof typeof v, string][] = [
      ['workday_start', 'lunch_start', 'La pause doit commencer après l’ouverture'],
      ['lunch_start', 'lunch_end', 'La pause doit finir après son début'],
      ['lunch_end', 'workday_end', 'La fermeture doit suivre la pause'],
      ['workday_end', 'overtime_start', 'Les heures sup. commencent après la fermeture'],
      ['expected_arrival', 'late_tolerance', 'La tolérance doit suivre l’heure d’arrivée'],
    ];
    for (const [before, after, message] of order) {
      if (minutes(String(v[after])) < minutes(String(v[before])))
        ctx.addIssue({ code: 'custom', path: [after], message });
    }
    // Dépannage : zones de plus en plus loin
    if (v.roadside_zone2_max_km <= v.roadside_zone1_max_km)
      ctx.addIssue({ code: 'custom', path: ['roadside_zone2_max_km'], message: 'Au-delà de la zone 1' });
    if (v.roadside_zone3_max_km <= v.roadside_zone2_max_km)
      ctx.addIssue({ code: 'custom', path: ['roadside_zone3_max_km'], message: 'Au-delà de la zone 2' });
  });
export type WorkshopValues = z.infer<typeof workshopSchema>;

const hhmm = (t: string) => t.slice(0, 5);
const VOICE_VALUES: readonly string[] = TTS_VOICES;

export const workshopToForm = (a: AppSettings): WorkshopValues => ({
  workday_start: hhmm(a.workday_start),
  lunch_start: hhmm(a.lunch_start),
  friday_lunch_start: hhmm(a.friday_lunch_start),
  lunch_end: hhmm(a.lunch_end),
  workday_end: hhmm(a.workday_end),
  overtime_start: hhmm(a.overtime_start),
  expected_arrival: hhmm(a.expected_arrival),
  late_tolerance: hhmm(a.late_tolerance),
  daily_hours: a.daily_hours,
  friday_hours: a.friday_hours,
  roadside_flat_fee: a.roadside_flat_fee,
  roadside_zone2_price: a.roadside_zone2_price,
  roadside_zone3_price: a.roadside_zone3_price,
  roadside_zone1_max_km: a.roadside_zone1_max_km,
  roadside_zone2_max_km: a.roadside_zone2_max_km,
  roadside_zone3_max_km: a.roadside_zone3_max_km,
  roadside_zone1_max_minutes: a.roadside_zone1_max_minutes,
  roadside_zone2_max_minutes: a.roadside_zone2_max_minutes,
  roadside_zone3_max_minutes: a.roadside_zone3_max_minutes,
  roadside_tolerance_minutes: a.roadside_tolerance_minutes,
  roadside_travel_hourly_rate: a.roadside_travel_hourly_rate,
  clock_photo_retention_months:
    a.clock_photo_retention_months as WorkshopValues['clock_photo_retention_months'],
  label_scan_enabled: a.label_scan_enabled,
  agent_enabled: a.agent_enabled,
  agent_memo: a.agent_memo,
  tts_provider: a.tts_provider === 'azure' ? 'azure' : 'browser',
  tts_voice: (VOICE_VALUES.includes(a.tts_voice)
    ? a.tts_voice
    : 'es-ES-XimenaMultilingualNeural') as WorkshopValues['tts_voice'],
  tts_monthly_limit: a.tts_monthly_limit,
  mail_send_enabled: a.mail_send_enabled,
  auto_mails_enabled: a.auto_mails_enabled,
  mail_domain: a.mail_domain ?? '',
  mail_billing_local: a.mail_billing_local,
  mail_workshop_local: a.mail_workshop_local,
  mail_signature_local: a.mail_signature_local,
});
