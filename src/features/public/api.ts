import { invokeFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';

export interface PublicCompany {
  legal_name: string;
  address_line: string;
  postal_code: string;
  city: string;
  email: string | null;
  phone: string | null;
  siret: string | null;
}

/** Adresse de l'atelier sur une ligne. */
export function companyAddress(company: PublicCompany) {
  return `${company.address_line}, ${company.postal_code} ${company.city}`;
}

export interface PublicQuoteLine {
  section: 'done' | 'planned';
  line_type: 'labor' | 'package' | 'part' | 'text';
  description: string;
  unit_price: number | null;
  quantity: number;
  discount_percent: number;
  net_ht: number;
}

export interface PublicQuote {
  type: 'quote';
  company: PublicCompany;
  number: string | null;
  issued_at: string | null;
  valid_until: string | null;
  status: 'draft' | 'in_progress' | 'sent' | 'accepted' | 'refused';
  accepted_by_name: string | null;
  accepted_at: string | null;
  client_name: string | null;
  vehicle_plate: string | null;
  lines: PublicQuoteLine[];
  totals: { total_ht: number; total_vat: number; total_ttc: number };
}

export interface PublicInvoiceLine {
  line_type: string;
  description: string;
  unit_price: number | null;
  quantity: number;
  discount_percent: number;
  vat_rate: number;
  net_ht: number;
}

export interface PublicInvoice {
  type: 'invoice';
  company: PublicCompany;
  number: string;
  issued_at: string;
  service_date: string | null;
  due_date: string;
  client_name: string;
  client_address: string | null;
  vehicle_label: string | null;
  mileage: number | null;
  lines: PublicInvoiceLine[];
  totals: { total_ht: number; total_vat: number; total_ttc: number };
  balance_due: number | null;
  legal_mentions: string[] | null;
}

export interface PublicPortal {
  type: 'portal';
  company: PublicCompany;
  client_name: string;
  generated_at: string;
  vehicles: {
    plate: string;
    in_workshop: boolean;
    status_label: string;
    since: string | null;
    ct_due_date: string | null;
    tailgate_due_date: string | null;
  }[];
  quotes: { number: string | null; vehicle_plate: string | null; token: string }[];
  invoices: {
    number: string;
    issued_at: string;
    vehicle_label: string | null;
    total_ttc: number;
    balance_due: number;
    payment_status: 'paid' | 'pending' | 'partial' | 'overdue';
    token: string;
  }[];
}

/** Demande de signature d'un OR (client absent, lien e-mail). */
export interface PublicSignature {
  type: 'signature';
  company: PublicCompany;
  number: string;
  status: 'pending' | 'signed' | 'cancelled' | 'expired';
  expires_at: string;
  signed_at: string | null;
  signer_name: string | null;
  client_name: string | null;
  vehicle_plate: string | null;
  requested_work: string;
  planned_date: string | null;
  mileage: number | null;
}

/** Contrat de location ou bon de prêt vu par le client (jamais le permis ni les photos). */
interface PublicRentalBase {
  company: PublicCompany;
  number: string;
  kind: 'rental' | 'loan';
  rental_status: 'reserved' | 'active' | 'returned' | 'closed' | 'cancelled';
  created_at: string;
  client_name: string;
  vehicle: { plate: string; brand: string; model: string; category: string } | null;
  departure_at: string;
  planned_return_at: string;
  returned_at: string | null;
  conditions: {
    billable: boolean;
    rate_period: 'day' | 'weekend' | 'week' | 'month';
    unit_price: number;
    periods: number;
    discount_percent: number;
    km_included: number | null;
    extra_km_price: number | null;
    fuel_price_per_liter: number | null;
    cleaning_fee: number | null;
    late_fee_per_hour: number | null;
    deposit: number;
    deposit_mode: 'card_hold' | 'cheque' | 'cash' | 'transfer' | null;
    franchise: number | null;
    vat_rate: number;
  };
  departure_inspection: { mileage: number | null; fuel_eighths: number | null } | null;
  departure_damages: string[];
  signed_at: string | null;
  signer_name: string | null;
}

/** Contrat envoyé au client (lien de consultation). */
export interface PublicRental extends PublicRentalBase {
  type: 'rental';
}

/** Contrat à signer à distance (lien valable 7 jours). */
export interface PublicRentalSignature extends PublicRentalBase {
  type: 'rental_signature';
  status: 'pending' | 'signed' | 'cancelled' | 'expired';
  expires_at: string;
}

export type PublicDocument =
  PublicQuote | PublicInvoice | PublicPortal | PublicSignature | PublicRental | PublicRentalSignature;

/** Document ouvert par le client avec le lien reçu (sans compte). null si le lien est inconnu. */
export async function fetchPublicDocument(token: string): Promise<PublicDocument | null> {
  const { data, error } = await supabase.rpc('public_get_document', { p_token: token });
  if (error) throw error;
  return data as PublicDocument | null;
}

export type QuoteResponse = {
  token: string;
  accept: boolean;
  signer_name: string;
  signature: string | null;
};

export async function respondToQuote(response: QuoteResponse) {
  return invokeFunction<{ status: 'accepted' | 'refused' }>('quote-response', response);
}
