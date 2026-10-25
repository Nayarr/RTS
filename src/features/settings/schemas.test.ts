import { describe, expect, it } from 'vitest';
import { pickDirty } from '@/lib/forms';
import {
  billingFromForm,
  billingSchema,
  companyFromForm,
  companySchema,
  workshopSchema,
  type CompanyValues,
  type WorkshopValues,
} from './schemas';

const messages = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message) ?? [];

const company: CompanyValues = {
  legal_name: 'RAPID TRUCK SERVICE',
  legal_form: 'SASU',
  share_capital: '181 726 €',
  address_line: '19 rue Gaston Monmousseau',
  postal_code: '95190',
  city: 'Goussainville',
  email: 'Atelier@RapidTruckService.fr',
  phone: '',
  siret: '984 989 137 00018',
  vat_number: 'fr 66 984989137',
  rcs: 'RCS Pontoise',
  iban: 'fr14 2004 1010 0505 0001 3m02 606',
  bic: 'bnpafrpp',
};

describe('pickDirty', () => {
  it('ne garde que les champs modifiés', () => {
    expect(pickDirty({ phone: '01', city: 'Goussainville', rcs: null }, { phone: true, rcs: false })).toEqual(
      {
        phone: '01',
      },
    );
    expect(pickDirty({ phone: '01' }, undefined)).toEqual({});
  });
});

describe('companySchema', () => {
  it('accepte les identifiants saisis avec des espaces', () => {
    expect(companySchema.safeParse(company).success).toBe(true);
  });

  it('contrôle SIRET (longueur et clé), code postal et TVA', () => {
    const result = companySchema.safeParse({
      ...company,
      siret: '984 989 137',
      postal_code: '9519',
      vat_number: '66-98',
    });
    expect(messages(result)).toEqual(
      expect.arrayContaining(['SIRET à 14 chiffres', 'Code postal à 5 chiffres', 'N° de TVA invalide']),
    );
  });

  it('champs facultatifs vides → null ; e-mail et TVA normalisés', () => {
    expect(companyFromForm(company)).toMatchObject({
      phone: null,
      email: 'atelier@rapidtruckservice.fr',
      vat_number: 'FR66984989137',
      siret: '98498913700018',
    });
    expect(messages(companySchema.safeParse({ ...company, siret: '984 989 137 00019' }))).toContain(
      'SIRET invalide : vérifie les chiffres',
    );
  });
});

describe('billingSchema', () => {
  it('une mention légale par ligne, lignes vides ignorées', () => {
    const values = {
      default_vat_rate: 20,
      payment_terms_days: 30,
      quote_validity_days: 30,
      invoice_legal_mentions: ' Pas d’escompte. \n\nTVA sur les encaissements.\n',
      supplies_fee_ht: '',
    };
    expect(billingSchema.safeParse(values).success).toBe(true);
    expect(billingFromForm(values).supplies_fee_ht).toBeNull();
    expect(billingFromForm({ ...values, supplies_fee_ht: ' 12,50 ' }).supplies_fee_ht).toBe(12.5);
    expect(messages(billingSchema.safeParse({ ...values, supplies_fee_ht: '15 €' }))).toEqual([
      'Montant en euros (ex : 15 ou 12,50)',
    ]);
    expect(billingFromForm(values).invoice_legal_mentions).toEqual([
      'Pas d’escompte.',
      'TVA sur les encaissements.',
    ]);
  });

  it('refuse un taux de TVA hors limites ou un champ vide', () => {
    const result = billingSchema.safeParse({
      default_vat_rate: 120,
      payment_terms_days: Number.NaN,
      quote_validity_days: 0,
      invoice_legal_mentions: '',
      supplies_fee_ht: '',
    });
    expect(messages(result)).toEqual(
      expect.arrayContaining(['Taux entre 0 et 100', 'Nombre de jours attendu', '1 jour minimum']),
    );
  });
});

describe('workshopSchema', () => {
  const workshop: WorkshopValues = {
    workday_start: '09:00',
    lunch_start: '13:00',
    friday_lunch_start: '12:30',
    lunch_end: '14:00',
    workday_end: '18:00',
    overtime_start: '18:30',
    expected_arrival: '09:00',
    late_tolerance: '09:05',
    daily_hours: 8,
    friday_hours: 7.5,
    roadside_flat_fee: 60,
    roadside_price_per_km: 1.5,
    roadside_travel_hourly_rate: 90,
    clock_photo_retention_months: 3,
    label_scan_enabled: false,
    agent_enabled: false,
    agent_memo: '',
    mail_send_enabled: false,
    auto_mails_enabled: true,
    mail_domain: '',
    mail_billing_local: 'facturation',
    mail_workshop_local: 'atelier',
    mail_signature_local: 'signature',
    tts_provider: 'browser' as const,
    tts_voice: 'fr-FR-DeniseNeural' as const,
    tts_monthly_limit: 480000,
  };

  it('accepte les horaires actuels de l’atelier', () => {
    expect(workshopSchema.safeParse(workshop).success).toBe(true);
  });

  it('domaine et adresses d’envoi : en minuscules, domaine seul, début d’adresse seul', () => {
    const ok = workshopSchema.safeParse({
      ...workshop,
      mail_domain: ' RapidTruckService.fr ',
      mail_billing_local: 'Facturation',
    });
    expect(ok.success && [ok.data.mail_domain, ok.data.mail_billing_local]).toEqual([
      'rapidtruckservice.fr',
      'facturation',
    ]);
    expect(messages(workshopSchema.safeParse({ ...workshop, mail_domain: 'https://rts.fr' }))).toEqual([
      'Domaine seul, ex. rapidtruckservice.fr',
    ]);
    expect(
      messages(workshopSchema.safeParse({ ...workshop, mail_signature_local: 'signature@rts.fr' })),
    ).toEqual(['Début d’adresse seul, ex. facturation']);
  });

  it('refuse des horaires incohérents', () => {
    const result = workshopSchema.safeParse({ ...workshop, lunch_end: '12:00', late_tolerance: '08:55' });
    expect(messages(result)).toEqual(
      expect.arrayContaining([
        'La pause doit finir après son début',
        'La tolérance doit suivre l’heure d’arrivée',
      ]),
    );
  });
});
