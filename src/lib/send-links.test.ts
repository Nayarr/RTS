import { describe, expect, it } from 'vitest';
import { quoteShareMessage } from '@/features/quotes/domain';
import { sendLinks } from './send-links';

const company = {
  legal_name: 'RAPID TRUCK SERVICE',
  address_line: '19 rue Gaston Monmousseau',
  postal_code: '95190',
  city: 'Goussainville',
  email: 'atelier@rapidtruckservice.fr',
};

describe('envoi d’un lien au client', () => {
  it('message du devis repris de l’ancienne appli', () => {
    const message = quoteShareMessage(
      { number: 'DV00012', plate: 'GH-512-RT' },
      'https://app/d/abc',
      company,
    );
    expect(message.subject).toBe('Devis DV00012 · RAPID TRUCK SERVICE');
    expect(message.body).toContain('votre devis DV00012 pour le véhicule GH-512-RT.');
    expect(message.body).toContain('https://app/d/abc');
    expect(
      message.body.endsWith(
        'Cordialement,\nRAPID TRUCK SERVICE\n19 rue Gaston Monmousseau, 95190 Goussainville\natelier@rapidtruckservice.fr',
      ),
    ).toBe(true);
    expect(message.sms).toBe(
      'Bonjour, voici votre devis DV00012 RAPID TRUCK SERVICE pour le véhicule GH-512-RT : https://app/d/abc',
    );
  });

  it('liens e-mail, Gmail, Outlook et SMS encodés (espaces, accents, retours à la ligne)', () => {
    const links = sendLinks(
      { subject: 'Devis DV1 · RTS', body: 'Bonjour,\nà bientôt', sms: 'Votre devis : https://app/d/x' },
      { email: ' client@exemple.fr ', phone: '06 12 34 56 78' },
    );
    expect(links.mailto).toBe(
      'mailto:client@exemple.fr?subject=Devis%20DV1%20%C2%B7%20RTS&body=Bonjour%2C%0A%C3%A0%20bient%C3%B4t',
    );
    expect(links.gmail).toContain(
      'https://mail.google.com/mail/?view=cm&fs=1&to=client%40exemple.fr&su=Devis%20DV1',
    );
    expect(links.outlook).toContain(
      'https://outlook.office.com/mail/deeplink/compose?to=client%40exemple.fr',
    );
    expect(links.sms).toBe('sms:0612345678?body=Votre%20devis%20%3A%20https%3A%2F%2Fapp%2Fd%2Fx');
  });

  it('Gmail s’ouvre sur le compte de l’atelier (comme l’ancienne appli)', () => {
    const message = { subject: 'Devis', body: 'Bonjour', sms: 'Bonjour' };
    const contact = { email: 'client@exemple.fr', phone: '' };
    expect(sendLinks(message, contact, ' atelier@rapidtruckservice.fr ').gmail).toMatch(
      /^https:\/\/mail\.google\.com\/mail\/\?authuser=atelier%40rapidtruckservice\.fr&view=cm&fs=1&to=client%40exemple\.fr/,
    );
    expect(sendLinks(message, contact, null).gmail).not.toContain('authuser');
    expect(sendLinks(message, contact, '').gmail).not.toContain('authuser');
  });
});
