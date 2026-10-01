import { useState } from 'react';
import { BellRing, Send } from 'lucide-react';
import { toast } from 'sonner';
import { SendLinkDialog } from '@/components/SendLinkDialog';
import { Button } from '@/components/ui/button';
import {
  fetchClientContact,
  publicDocumentUrl,
  updateClientContact,
} from '@/features/documents/client-contact';
import { fetchSettings } from '@/features/settings/api';
import type { ContactValues, SendLinkMessage } from '@/lib/send-links';
import { recordInvoiceReminder, shareInvoice, type InvoiceOverview } from './api';
import { invoiceShareMessage, isOverdue } from './domain';
import { useInvoiceMutation } from './hooks';

interface Prepared {
  reminder: boolean;
  link: string;
  message: SendLinkMessage;
  senderEmail: string | null;
  contact: ContactValues;
}

/** « Envoyer au client » et « Relancer » : lien de consultation, message prêt pour e-mail ou SMS. */
export function ShareInvoiceButtons({ invoice }: { invoice: InvoiceOverview }) {
  const [prepared, setPrepared] = useState<Prepared | null>(null);

  const prepare = useInvoiceMutation(
    async (reminder: boolean) => {
      const token = await shareInvoice(invoice.id);
      if (reminder) await recordInvoiceReminder(invoice.id);
      const [settings, contact] = await Promise.all([fetchSettings(), fetchClientContact(invoice.client_id)]);
      const link = publicDocumentUrl(token);
      setPrepared({
        reminder,
        link,
        message: invoiceShareMessage(invoice, link, settings.company, reminder),
        senderEmail: settings.company.email,
        contact: { email: contact.email ?? '', phone: contact.phone ?? '' },
      });
    },
    (_data, reminder) => (reminder ? 'Relance enregistrée' : 'Lien de la facture prêt'),
  );

  const saveContact = (contact: ContactValues) => {
    updateClientContact(invoice.client_id, {
      email: contact.email.trim() || null,
      phone: contact.phone.trim() || null,
    }).then(
      () => toast.success('Coordonnées du client enregistrées'),
      () => toast.error('Coordonnées non enregistrées'),
    );
  };

  return (
    <>
      <Button
        variant="outline"
        className="w-full"
        disabled={prepare.isPending}
        onClick={() => prepare.mutate(false)}
      >
        <Send /> Envoyer au client
      </Button>
      {isOverdue(invoice) && (
        <Button
          variant="outline"
          className="w-full text-destructive"
          disabled={prepare.isPending}
          onClick={() => prepare.mutate(true)}
        >
          <BellRing /> Relancer
        </Button>
      )}
      {prepared && (
        <SendLinkDialog
          title={`${prepared.reminder ? 'Relancer' : 'Envoyer'} la facture ${invoice.number ?? ''}`}
          intro={
            prepared.reminder
              ? 'Un message de relance poli est pré-rédigé avec le montant restant dû et la date d’échéance.'
              : 'Le client pourra consulter et imprimer sa facture en ligne.'
          }
          link={prepared.link}
          message={prepared.message}
          senderEmail={prepared.senderEmail}
          contact={prepared.contact}
          onContactSave={saveContact}
          onClose={() => setPrepared(null)}
        />
      )}
    </>
  );
}
