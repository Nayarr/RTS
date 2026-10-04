import { describe, expect, it } from 'vitest';
import { rentalContractMessage, rentalSignatureMessage } from './rental-messages';

const company = {
  legal_name: 'RAPID TRUCK SERVICE',
  address_line: '19 rue Gaston Monmousseau',
  postal_code: '95190',
  city: 'Goussainville',
  email: 'atelier@rapidtruckservice.fr',
};
const rental = {
  number: 'LC-2026-0007',
  kind: 'rental' as const,
  plate: 'GE-781-UV',
  departure_at: '2026-10-05T07:30:00Z',
  planned_return_at: '2026-10-07T16:00:00Z',
};
const LINK = 'https://app.cylindre.fr/d/abc';

describe('messages de la location', () => {
  it('signature à distance : contrat, véhicule, période, lien valable 7 jours, signé par l’atelier', () => {
    const message = rentalSignatureMessage(rental, LINK, company);
    expect(message.subject).toBe('Contrat de location LC-2026-0007 à signer · RAPID TRUCK SERVICE');
    expect(message.body).toContain('contrat de location LC-2026-0007 pour le véhicule GE-781-UV');
    expect(message.body).toMatch(/du lun\. 05\/10 09:30 au mer\. 07\/10 18:00/);
    expect(message.body).toContain(`${LINK}\n\nLe lien est valable 7 jours.`);
    expect(message.body).toMatch(
      /Cordialement,\nRAPID TRUCK SERVICE\n19 rue Gaston Monmousseau, 95190 Goussainville\natelier@/,
    );
    expect(message.sms).toContain(LINK);
    expect(message.sms).not.toContain('\n');
  });

  it('envoi du contrat : prêt nommé « bon de prêt », lien de consultation', () => {
    const message = rentalContractMessage({ ...rental, kind: 'loan', number: 'PR-2026-0003' }, LINK, {
      ...company,
      email: null,
    });
    expect(message.subject).toBe('Votre bon de prêt PR-2026-0003 · RAPID TRUCK SERVICE');
    expect(message.body).toContain('consulter, l’imprimer ou l’enregistrer en PDF');
    expect(message.body).toContain(LINK);
    expect(message.body.endsWith('Goussainville')).toBe(true);
    expect(message.sms).toBe(
      `Votre bon de prêt PR-2026-0003 RAPID TRUCK SERVICE (véhicule GE-781-UV) : ${LINK}`,
    );
  });
});
