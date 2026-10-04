import { nextPositionOf } from '@/features/documents/lines';
import type { QuoteLine, QuoteStatus } from './api';

export const QUOTE_STATUS_META: Record<QuoteStatus, { label: string; color: string }> = {
  draft: { label: 'À faire', color: '#6B7280' },
  in_progress: { label: 'En cours', color: '#C98A00' },
  sent: { label: 'Envoyé', color: '#4750B5' },
  accepted: { label: 'Accepté', color: '#2A6B52' },
  refused: { label: 'Refusé', color: '#B5453A' },
};

export const QUOTE_STATUS_ORDER: QuoteStatus[] = ['draft', 'in_progress', 'sent', 'accepted', 'refused'];

export { computeTotals, lineNet, packageFitsVehicle, packagesFor } from '@/features/documents/lines';

/** « Travaux déjà effectués » imprimés sur le devis : seulement ceux qui ont un prix (comme l'ancienne appli). */
export const pricedDoneLines = (lines: QuoteLine[]) =>
  lines.filter((line) => line.section === 'done' && line.line_type !== 'text' && (line.unit_price ?? 0) > 0);

export const nextPosition = (lines: QuoteLine[], section: QuoteLine['section']) =>
  nextPositionOf(lines.filter((line) => line.section === section));

/** Un devis accepté est figé ; un devis rattaché ou transformé ne se modifie plus non plus. */
export const isQuoteLocked = (quote: { status: QuoteStatus; merged_into_repair_order_id: string | null }) =>
  quote.status === 'accepted' || quote.merged_into_repair_order_id !== null;

interface ShareCompany {
  legal_name: string;
  address_line: string;
  postal_code: string;
  city: string;
  email: string | null;
}

/** Message d'envoi du lien à signer (texte de l'ancienne appli). */
export function quoteShareMessage(
  quote: { number: string | null; plate: string | null },
  link: string,
  company: ShareCompany,
) {
  const signature = [
    company.legal_name,
    `${company.address_line}, ${company.postal_code} ${company.city}`,
    company.email,
  ]
    .filter(Boolean)
    .join('\n');
  const vehicle = quote.plate ? ` pour le véhicule ${quote.plate}` : '';
  return {
    subject: `Devis ${quote.number ?? ''} · ${company.legal_name}`,
    body:
      `Bonjour,\n\nVeuillez trouver ci-dessous le lien vers votre devis ${quote.number ?? ''}${vehicle}. ` +
      `Vous pouvez le consulter et l'accepter en ligne en le signant :\n\n${link}\n\nCordialement,\n${signature}`,
    sms: `Bonjour, voici votre devis ${quote.number ?? ''} ${company.legal_name}${vehicle} : ${link}`,
  };
}
