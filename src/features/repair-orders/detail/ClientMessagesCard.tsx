import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { SendLinkDialog } from '@/components/SendLinkDialog';
import { Button } from '@/components/ui/button';
import {
  fetchClientContact,
  publicDocumentUrl,
  updateClientContact,
} from '@/features/documents/client-contact';
import { useRepairOrderQuotes } from '@/features/quotes/hooks';
import { fetchSettings } from '@/features/settings/api';
import type { ContactValues, SendLinkMessage } from '@/lib/send-links';
import type { RepairOrderOverview } from '../api';
import {
  CLIENT_MESSAGE_LABELS,
  CLIENT_MESSAGE_TYPES,
  clientMessage,
  fetchSentClientMessages,
  recordClientMessage,
  suggestedMessage,
  type ClientMessageType,
} from '../client-messages';
import { repairOrderKey, repairOrdersKey } from '../hooks';

interface Prepared {
  type: ClientMessageType;
  message: SendLinkMessage;
  senderEmail: string | null;
  contact: ContactValues;
}

/** « Informer le client » : messages pré-rédigés, envoyés par la messagerie de l'atelier. */
export function ClientMessagesCard({ order }: { order: RepairOrderOverview }) {
  const queryClient = useQueryClient();
  const sent = useQuery({
    queryKey: [...repairOrderKey(order.id), 'client-messages'],
    queryFn: () => fetchSentClientMessages(order.id),
  });
  const quotes = useRepairOrderQuotes(order.id);
  const sentQuote = [...(quotes.data ?? [])].reverse().find((quote) => quote.status === 'sent');
  const suggestion = suggestedMessage(order.status, Boolean(sentQuote), sent.data ?? []);
  const [prepared, setPrepared] = useState<Prepared | null>(null);

  const prepare = useMutation({
    mutationFn: async (type: ClientMessageType) => {
      const [settings, contact] = await Promise.all([
        fetchSettings(),
        order.client_id ? fetchClientContact(order.client_id) : Promise.resolve({ email: null, phone: null }),
      ]);
      const quoteLink = sentQuote?.public_token ? publicDocumentUrl(sentQuote.public_token) : null;
      setPrepared({
        type,
        message: clientMessage(type, { plate: order.plate, quoteLink }, settings.company),
        senderEmail: settings.company.email,
        contact: { email: contact.email ?? '', phone: contact.phone ?? '' },
      });
    },
    onError: () => toast.error('Message impossible à préparer'),
  });

  const record = useMutation({
    mutationFn: (input: Parameters<typeof recordClientMessage>[0]) => recordClientMessage(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: repairOrdersKey }),
    onError: () => toast.error('Envoi non enregistré dans l’historique'),
  });

  const saveContact = (contact: ContactValues) => {
    if (!order.client_id) return;
    updateClientContact(order.client_id, {
      email: contact.email.trim() || null,
      phone: contact.phone.trim() || null,
    }).then(
      () => toast.success('Coordonnées du client enregistrées'),
      () => toast.error('Coordonnées non enregistrées'),
    );
  };

  const isSent = (type: ClientMessageType) =>
    (sent.data ?? []).some((message) => message.message_type === type);

  return (
    <section data-slot="card" className="card" aria-labelledby="ro-client-messages">
      <div className="card-h">
        <h2 className="h2" id="ro-client-messages">
          Informer le client
        </h2>
      </div>
      <div className="card-b col gap-2">
        {CLIENT_MESSAGE_TYPES.map((type) => (
          <Button
            key={type}
            variant={type === suggestion ? 'default' : 'outline'}
            className="w-full justify-between"
            aria-label={`${CLIENT_MESSAGE_LABELS[type]}${isSent(type) ? ' (déjà envoyé)' : ''}`}
            disabled={prepare.isPending}
            onClick={() => prepare.mutate(type)}
          >
            <span className="row gap-2">
              <MessageSquare />
              {CLIENT_MESSAGE_LABELS[type]}
            </span>
            {isSent(type) && (
              <span aria-hidden className={type === suggestion ? 'text-[12.5px] opacity-80' : 'hint'}>
                <Check className="mr-1 inline size-3.5" />
                déjà envoyé
              </span>
            )}
          </Button>
        ))}
        {suggestion && (
          <p className="hint">Suggestion : « {CLIENT_MESSAGE_LABELS[suggestion]} » (en vert).</p>
        )}
      </div>

      {prepared && (
        <SendLinkDialog
          title={CLIENT_MESSAGE_LABELS[prepared.type]}
          intro="Message pré-rédigé, à envoyer au client."
          message={prepared.message}
          senderEmail={prepared.senderEmail}
          contact={prepared.contact}
          onContactSave={saveContact}
          onSend={(channel, contact, providerMessageId) =>
            record.mutate({
              repairOrderId: order.id,
              type: prepared.type,
              channel,
              recipient: (channel === 'email' ? contact.email : contact.phone).trim() || null,
              message: prepared.message,
              providerMessageId,
            })
          }
          onClose={() => setPrepared(null)}
        />
      )}
    </section>
  );
}
