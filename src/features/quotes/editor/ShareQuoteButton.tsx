import { useState } from 'react';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { SendLinkDialog } from '@/components/SendLinkDialog';
import type { ContactValues, SendLinkMessage } from '@/lib/send-links';
import { Button } from '@/components/ui/button';
import { fetchSettings } from '@/features/settings/api';
import {
  fetchClientContact,
  fetchQuote,
  publicDocumentUrl,
  shareQuote,
  updateClientContact,
  type QuoteOverview,
} from '../api';
import { quoteShareMessage } from '../domain';
import { useQuoteMutation } from '../hooks';

interface Prepared {
  number: string | null;
  link: string;
  message: SendLinkMessage;
  senderEmail: string | null;
  contact: ContactValues;
}

/** « Envoyer au client » : lien à signer en ligne, message prêt pour e-mail ou SMS. */
export function ShareQuoteButton({ quote, disabled }: { quote: QuoteOverview; disabled: boolean }) {
  const [prepared, setPrepared] = useState<Prepared | null>(null);

  const share = useQuoteMutation(async () => {
    const token = await shareQuote(quote.id);
    const [settings, contact] = await Promise.all([
      fetchSettings(),
      quote.client_id ? fetchClientContact(quote.client_id) : Promise.resolve({ email: null, phone: null }),
    ]);
    // Numéro attribué à l'envoi : repris dans le message.
    const number = (await fetchQuote(quote.id))?.quote.number ?? quote.number;
    const link = publicDocumentUrl(token);
    setPrepared({
      number,
      link,
      message: quoteShareMessage({ number, plate: quote.plate }, link, settings.company),
      senderEmail: settings.company.email,
      contact: { email: contact.email ?? '', phone: contact.phone ?? '' },
    });
  }, null);

  const saveContact = (contact: ContactValues) => {
    if (!quote.client_id) return;
    updateClientContact(quote.client_id, {
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
        disabled={disabled || share.isPending}
        onClick={() => share.mutate(undefined)}
      >
        <Send /> Envoyer au client (lien à signer)
      </Button>
      {prepared && (
        <SendLinkDialog
          title={`Devis ${prepared.number ?? ''} prêt à envoyer`}
          intro="Le client pourra consulter le devis et l’accepter en signant, sans compte."
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
