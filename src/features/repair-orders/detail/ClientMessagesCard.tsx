import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { SendLinkDialog } from '@/components/SendLinkDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl font-bold">Informer le client</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-col gap-2">
          {CLIENT_MESSAGE_TYPES.map((type) => (
            <Button
              key={type}
              variant={type === suggestion ? 'default' : 'outline'}
              className="justify-start"
              disabled={prepare.isPending}
              onClick={() => prepare.mutate(type)}
            >
              {isSent(type) && <Check />}
              {CLIENT_MESSAGE_LABELS[type]}
              {isSent(type) && <span className="sr-only"> (déjà envoyé)</span>}
            </Button>
          ))}
        </div>
        {suggestion && (
          <p className="text-sm text-muted-foreground">
            Suggestion : « {CLIENT_MESSAGE_LABELS[suggestion]} » (en vert).
          </p>
        )}
      </CardContent>

      {prepared && (
        <SendLinkDialog
          title={CLIENT_MESSAGE_LABELS[prepared.type]}
          intro="Message pré-rédigé, à envoyer au client."
          message={prepared.message}
          senderEmail={prepared.senderEmail}
          contact={prepared.contact}
          onContactSave={saveContact}
          onSend={(channel, contact) =>
            record.mutate({
              repairOrderId: order.id,
              type: prepared.type,
              channel,
              recipient: (channel === 'email' ? contact.email : contact.phone).trim() || null,
              message: prepared.message,
            })
          }
          onClose={() => setPrepared(null)}
        />
      )}
    </Card>
  );
}
