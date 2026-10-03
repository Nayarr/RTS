import type { SendLinkMessage } from '@/lib/send-links';
import type { RentalKind } from './rental-api';
import { shortDateTime } from './rental-domain';

interface ShareCompany {
  legal_name: string;
  address_line: string;
  postal_code: string;
  city: string;
  email: string | null;
}

interface ShareRental {
  number: string;
  kind: RentalKind;
  plate: string;
  departure_at: string;
  planned_return_at: string;
}

const signatureOf = (company: ShareCompany) =>
  [company.legal_name, `${company.address_line}, ${company.postal_code} ${company.city}`, company.email]
    .filter(Boolean)
    .join('\n');

const documentName = (rental: ShareRental) =>
  rental.kind === 'loan' ? `bon de prêt ${rental.number}` : `contrat de location ${rental.number}`;

const periodText = (rental: ShareRental) =>
  `du ${shortDateTime(rental.departure_at)} au ${shortDateTime(rental.planned_return_at)}`;

/** Message au client absent : lien pour relire et signer le contrat en ligne (valable 7 jours). */
export function rentalSignatureMessage(
  rental: ShareRental,
  link: string,
  company: ShareCompany,
): SendLinkMessage {
  const name = documentName(rental);
  return {
    subject: `${name.charAt(0).toUpperCase()}${name.slice(1)} à signer — ${company.legal_name}`,
    body:
      `Bonjour,\n\nVoici votre ${name} pour le véhicule ${rental.plate}, ${periodText(rental)}.\n` +
      `Vous pouvez le relire et le signer en ligne, sans créer de compte :\n\n${link}\n\n` +
      `Le lien est valable 7 jours. Les clés vous seront remises après l’état des lieux de départ.\n\n` +
      `Cordialement,\n${signatureOf(company)}`,
    sms: `Bonjour, merci de signer votre ${name} ${company.legal_name} (véhicule ${rental.plate}) : ${link}`,
  };
}

/** Envoi du contrat au client : lien de consultation, imprimable ou enregistrable en PDF. */
export function rentalContractMessage(
  rental: ShareRental,
  link: string,
  company: ShareCompany,
): SendLinkMessage {
  const name = documentName(rental);
  return {
    subject: `Votre ${name} — ${company.legal_name}`,
    body:
      `Bonjour,\n\nVous trouverez ci-dessous le lien vers votre ${name} pour le véhicule ${rental.plate}, ` +
      `${periodText(rental)}. Vous pouvez le consulter, l’imprimer ou l’enregistrer en PDF :\n\n${link}\n\n` +
      `Cordialement,\n${signatureOf(company)}`,
    sms: `Votre ${name} ${company.legal_name} (véhicule ${rental.plate}) : ${link}`,
  };
}
