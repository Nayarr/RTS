// Textes de la relance automatique des impayés : un e-mail par client, ton gradué selon le niveau.

export interface ReminderInvoice {
  invoice_id: string;
  number: string | null;
  issued_at: string | null;
  due_date: string | null;
  vehicle_label: string | null;
  balance_due: number;
  token: string | null;
}

/** Relance préparée par la base (prepare_overdue_reminders). */
export interface ReminderItem {
  client_id: string;
  client_name: string;
  to: string;
  /** 1 : cordiale ; 2 : ferme ; 3 : dernier rappel. */
  level: 1 | 2 | 3;
  balance: number;
  invoices: ReminderInvoice[];
}

export interface ReminderContext {
  companyName: string;
  phone: string | null;
  email: string | null;
  /** Adresse de l'appli (lien de chaque facture). */
  appUrl: string | null;
}

const euro = (value: number) =>
  `${
    new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .format(value)
      .replace(/ | /g, ' ')
  } €`;

/** « 2026-11-09 » ou un horodatage → « 09/11/2026 ». */
export function frDate(value: string | null): string {
  if (!value) return '';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

const SUBJECTS: Record<ReminderItem['level'], (several: boolean, ref: string) => string> = {
  1: (several, ref) => (several ? 'Relance · Factures en attente de règlement' : `Relance · Facture ${ref}`),
  2: (several, ref) =>
    several ? '2e relance · Factures toujours impayées' : `2e relance · Facture ${ref} toujours impayée`,
  3: (several, ref) =>
    several ? 'Dernier rappel avant recouvrement · Factures impayées' : `Dernier rappel · Facture ${ref}`,
};

const INTRO: Record<ReminderItem['level'], (several: boolean) => string> = {
  1: (several) =>
    `Sauf erreur de notre part, ${
      several
        ? 'les factures suivantes restent impayées après leur échéance'
        : 'la facture suivante reste impayée après son échéance'
    } :`,
  2: (several) =>
    `Malgré notre précédente relance, ${
      several ? 'les factures suivantes restent impayées' : 'la facture suivante reste impayée'
    } :`,
  3: (several) =>
    `Malgré nos relances, ${
      several ? 'les factures suivantes restent impayées' : 'la facture suivante reste impayée'
    }. Il s'agit de notre dernier rappel avant l'engagement d'une procédure de recouvrement :`,
};

const REQUEST: Record<ReminderItem['level'], string> = {
  1: 'Merci de bien vouloir procéder au règlement dans les meilleurs délais.',
  2: 'Nous vous remercions de procéder au règlement sous 8 jours.',
  3: 'Sans règlement de votre part sous 8 jours, nous serons contraints d’engager une procédure de recouvrement.',
};

/** E-mail de relance d'un client : objet et texte. */
export function buildReminderMail(item: ReminderItem, context: ReminderContext) {
  const several = item.invoices.length > 1;
  const lines = item.invoices
    .map((invoice) => {
      const link = context.appUrl && invoice.token
        ? `\n  ${context.appUrl.replace(/\/$/, '')}/d/${invoice.token}`
        : '';
      return (
        `- Facture ${invoice.number ?? ''} du ${frDate(invoice.issued_at)}` +
        `${invoice.vehicle_label ? ` (véhicule ${invoice.vehicle_label})` : ''}, échue le ${
          frDate(invoice.due_date)
        } : ` +
        `${euro(invoice.balance_due)} TTC${link}`
      );
    })
    .join('\n');
  const contact = [context.phone, context.email].filter(Boolean).join(' · ');
  const ref = item.invoices[0]?.number ?? '';
  return {
    subject: `${SUBJECTS[item.level](several, ref)} · ${context.companyName}`.trim(),
    text: `Bonjour,\n\n${INTRO[item.level](several)}\n\n${lines}\n\n` +
      `Total restant dû : ${euro(item.balance)} TTC.\n\n${REQUEST[item.level]} ` +
      'Si le paiement a été effectué entre-temps, merci de ne pas tenir compte de ce message.' +
      `${contact ? `\n\nPour toute question : ${contact}.` : ''}\n\nCordialement,\n${context.companyName}`,
  };
}
