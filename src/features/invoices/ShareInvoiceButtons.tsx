import { useEffect, useRef, useState } from 'react';
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
import { fetchMailSettings, sendMail } from '@/lib/mail';
import { bodyWithoutLink } from '@/lib/mail-text';
import type { ContactValues, SendLinkMessage } from '@/lib/send-links';
import { recordInvoiceReminder, shareInvoice, type InvoiceOverview } from './api';
import { invoiceShareMessage, isOverdue } from './domain';
import { invoicePdfFile } from './invoice-attachment';
import { useInvoiceMutation } from './hooks';

interface Prepared {
  reminder: boolean;
  link: string;
  message: SendLinkMessage;
  senderEmail: string | null;
  contact: ContactValues;
}

const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * « Envoyer au client » et « Relancer » : lien de consultation, message prêt pour e-mail ou SMS.
 * `autoSend` (facture qui vient d'être émise) : envoyée tout de suite par l'appli, PDF joint,
 * si l'envoi par l'appli est activé et l'e-mail du client connu ; sinon la fenêtre d'envoi s'ouvre.
 */
export function ShareInvoiceButtons({
  invoice,
  autoSend = false,
  onAutoSendDone,
}: {
  invoice: InvoiceOverview;
  autoSend?: boolean;
  onAutoSendDone?: () => void;
}) {
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [sending, setSending] = useState(autoSend);
  const started = useRef(false);

  useEffect(() => {
    if (!autoSend || started.current) return;
    started.current = true;
    void (async () => {
      try {
        const token = await shareInvoice(invoice.id);
        const [settings, contact, mail] = await Promise.all([
          fetchSettings(),
          fetchClientContact(invoice.client_id),
          fetchMailSettings(),
        ]);
        const link = publicDocumentUrl(token);
        const message = invoiceShareMessage(invoice, link, settings.company, false);
        const email = contact.email?.trim() ?? '';
        if (mail.enabled && VALID_EMAIL.test(email)) {
          await sendMail({
            category: 'billing',
            to: email,
            subject: message.subject,
            text: bodyWithoutLink(message.body, link),
            link: { label: 'Consulter la facture', url: link },
            attachments: [await invoicePdfFile(invoice.id)],
            idempotencyKey: `invoice-auto-${invoice.id}`,
          });
          toast.success(`Facture ${invoice.number ?? ''} envoyée à ${email}`);
        } else {
          // Pas d'envoi par l'appli ou e-mail inconnu : message prêt, à envoyer en un clic
          setPrepared({
            reminder: false,
            link,
            message,
            senderEmail: settings.company.email,
            contact: { email, phone: contact.phone ?? '' },
          });
        }
      } catch (error) {
        toast.error(
          error instanceof Error && error.message
            ? `Facture non envoyée : ${error.message}`
            : 'Facture non envoyée : utilise « Envoyer au client »',
        );
      } finally {
        setSending(false);
        onAutoSendDone?.();
      }
    })();
  }, [autoSend, invoice, onAutoSendDone]);

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
        disabled={prepare.isPending || sending}
        onClick={() => prepare.mutate(false)}
      >
        <Send /> {sending ? 'Envoi de la facture…' : 'Envoyer au client'}
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
          linkLabel="Consulter la facture"
          message={prepared.message}
          senderEmail={prepared.senderEmail}
          mailCategory="billing"
          contact={prepared.contact}
          onContactSave={saveContact}
          attachments={{
            label: `la facture ${invoice.number ?? ''} (PDF)`,
            load: async () => [await invoicePdfFile(invoice.id)],
          }}
          onClose={() => setPrepared(null)}
        />
      )}
    </>
  );
}
