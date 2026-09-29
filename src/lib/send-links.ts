export interface ContactValues {
  email: string;
  phone: string;
}

export interface SendLinkMessage {
  subject: string;
  body: string;
  sms: string;
}

/**
 * Liens d'envoi : messagerie de l'ordinateur, Gmail, Outlook web, SMS (depuis un téléphone).
 * senderEmail : compte Gmail de l'atelier, ouvert directement si plusieurs comptes sont connectés.
 */
export function sendLinks(message: SendLinkMessage, contact: ContactValues, senderEmail?: string | null) {
  const email = contact.email.trim();
  const phone = contact.phone.replace(/[^\d+]/g, '');
  const query = (params: Record<string, string>) =>
    new URLSearchParams(params).toString().replace(/\+/g, '%20');
  return {
    mailto: `mailto:${encodeURIComponent(email).replace(/%40/g, '@')}?${query({ subject: message.subject, body: message.body })}`,
    gmail: `https://mail.google.com/mail/?${query({
      ...(senderEmail?.trim() ? { authuser: senderEmail.trim() } : {}),
      view: 'cm',
      fs: '1',
      to: email,
      su: message.subject,
      body: message.body,
    })}`,
    outlook: `https://outlook.office.com/mail/deeplink/compose?${query({ to: email, subject: message.subject, body: message.body })}`,
    sms: `sms:${phone}?${query({ body: message.sms })}`,
  };
}
