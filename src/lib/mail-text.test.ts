import { describe, expect, it } from 'vitest';
import { clientMessage } from '@/features/repair-orders/client-messages';
import { portalMessage } from '@/features/customers/portal';
import { invoiceShareMessage } from '@/features/invoices/domain';
import { quoteShareMessage } from '@/features/quotes/domain';
import { rentalContractMessage, rentalSignatureMessage } from '@/features/rentals/rental-messages';
import { signatureShareMessage } from '@/features/signature/domain';
import { bodyWithoutLink, splitSignature } from './mail-text';

const LINK = 'https://atelier.rapidtruckservice.fr/d/abc';
const company = {
  legal_name: 'RAPID TRUCK SERVICE',
  address_line: '19 rue Gaston Monmousseau',
  postal_code: '95190',
  city: 'Goussainville',
  email: 'atelier@rapidtruckservice.fr',
};

describe('texte modifiable : le lien devient un bouton', () => {
  it('devis : la phrase qui annonçait le lien se termine par un point', () => {
    const body = bodyWithoutLink(
      quoteShareMessage({ number: 'DV00004', plate: 'GF-844-UA' }, LINK, company).body,
      LINK,
    );
    expect(body).not.toContain(LINK);
    expect(body).toContain("Vous pouvez le consulter et l'accepter en ligne en le signant.\n\nCordialement,");
  });

  it('devis disponible (OR) : « ici : lien » disparaît', () => {
    const body = bodyWithoutLink(
      clientMessage('quote_available', { plate: 'FG-218-KL', quoteLink: LINK }, company).body,
      LINK,
    );
    expect(body).toContain(
      'Le devis pour votre véhicule FG-218-KL est disponible.\nVous pouvez le consulter',
    );
  });

  it('signature, facture, relance, espace client, contrats : plus de lien ni de deux-points orphelin', () => {
    const bodies = [
      signatureShareMessage({ number: 'OR00490', plate: 'FG-218-KL' }, LINK, company).body,
      portalMessage(LINK, company).body,
      rentalSignatureMessage(
        {
          number: 'LC-2026-0042',
          kind: 'rental',
          plate: 'GE-781-UV',
          departure_at: '2026-10-05T07:30:00Z',
          planned_return_at: '2026-10-07T16:00:00Z',
        },
        LINK,
        company,
      ).body,
      rentalContractMessage(
        {
          number: 'LC-2026-0042',
          kind: 'rental',
          plate: 'GE-781-UV',
          departure_at: '2026-10-05T07:30:00Z',
          planned_return_at: '2026-10-07T16:00:00Z',
        },
        LINK,
        company,
      ).body,
    ];
    const invoice = {
      number: 'F12361',
      issued_at: '2026-09-27',
      due_date: '2026-10-27',
      vehicle_label: 'GR-258-LD',
      total_ttc: 828,
      balance_due: 828,
    };
    bodies.push(
      invoiceShareMessage(invoice, LINK, company, false).body,
      invoiceShareMessage(invoice, LINK, company, true).body,
    );
    for (const body of bodies) {
      const text = bodyWithoutLink(body, LINK);
      expect(text).not.toContain(LINK);
      expect(text).not.toMatch(/:\s*\n|:\s*$/);
      expect(text).not.toMatch(/\n{3,}/);
      expect(text.startsWith('Bonjour,')).toBe(true);
    }
  });

  it('message sans lien : inchangé', () => {
    const body = clientMessage('vehicle_ready', { plate: 'FG-218-KL', quoteLink: null }, company).body;
    expect(bodyWithoutLink(body, undefined)).toBe(body);
    expect(bodyWithoutLink(body, LINK)).toBe(body);
  });

  it('signature séparée du message pour placer le bouton entre les deux', () => {
    expect(splitSignature('Bonjour,\n\nTexte.\n\nCordialement,\nRTS')).toEqual([
      'Bonjour,\n\nTexte.',
      'Cordialement,\nRTS',
    ]);
    expect(splitSignature('Bonjour')).toEqual(['Bonjour', '']);
  });
});
