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

export type PublicDocument = PublicQuote | PublicInvoice | { type: 'portal' };

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
