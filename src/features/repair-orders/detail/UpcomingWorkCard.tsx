import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { SendLinkDialog } from '@/components/SendLinkDialog';
import { Button } from '@/components/ui/button';
import { fetchClientContact, updateClientContact } from '@/features/documents/client-contact';
import { fetchSettings } from '@/features/settings/api';
import type { ContactValues, SendLinkMessage } from '@/lib/send-links';
import type { RepairOrderOverview } from '../api';
import { fetchSentClientMessages, recordClientMessage } from '../client-messages';
import { repairOrderKey, repairOrdersKey } from '../hooks';
import { todayIso } from '../schemas';
import { upcomingWork, upcomingWorkMessage, type UpcomingItem } from '../upcoming-work';
import { fetchUpcomingInput } from '../upcoming-work-api';

interface Prepared {
  message: SendLinkMessage;
  senderEmail: string | null;
  contact: ContactValues;
}

const badge = (item: UpcomingItem) => {
  if (item.days === null) return null;
  if (item.days < 0) return { text: 'Dépassé', className: 's-bad' };
  return { text: `Dans ${item.days} j`, className: 's-warn' };
};

/**
 * « Profitez de l'immobilisation » : échéances du véhicule à proposer au client pendant qu'il est à
 * l'atelier, et mail modèle (nom du client et prestations) relu et modifiable avant l'envoi.
 */
export function UpcomingWorkCard({ order }: { order: RepairOrderOverview }) {
  const queryClient = useQueryClient();
  const atWorkshop = !['to_invoice', 'invoiced'].includes(order.status);
  const upcoming = useQuery({
    queryKey: [...repairOrderKey(order.id), 'upcoming-work'],
    queryFn: async () => upcomingWork(await fetchUpcomingInput(order), todayIso()),
    enabled: atWorkshop,
  });
  const sent = useQuery({
    queryKey: [...repairOrderKey(order.id), 'client-messages'],
    queryFn: () => fetchSentClientMessages(order.id),
    enabled: atWorkshop,
  });
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const items = upcoming.data ?? [];

  const prepare = useMutation({
    mutationFn: async () => {
      const [settings, contact] = await Promise.all([
        fetchSettings(),
        order.client_id ? fetchClientContact(order.client_id) : Promise.resolve({ email: null, phone: null }),
      ]);
      setPrepared({
        message: upcomingWorkMessage(
          { clientName: order.client_name, plate: order.plate, items },
          settings.company,
        ),
        senderEmail: settings.company.email,
        contact: { email: contact.email ?? '', phone: contact.phone ?? '' },
      });
    },
    onError: () => toast.error('Mail impossible à préparer'),
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

  if (!atWorkshop || items.length === 0) return null;
  const alreadySent = (sent.data ?? []).some((message) => message.message_type === 'upcoming_work');

  return (
    <section data-slot="card" className="card" aria-labelledby="ro-upcoming-work">
      <div className="card-h">
        <h2 className="h2" id="ro-upcoming-work">
          Profitez de l’immobilisation
        </h2>
      </div>
      <div className="card-b col gap-3">
        <p className="hint">Échéances du véhicule à proposer au client pendant qu’il est à l’atelier.</p>
        <ul className="col gap-2" aria-label="Échéances à proposer">
          {items.map((item) => {
            const status = badge(item);
            return (
              <li key={item.kind} className="row top gap-2.5">
                <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="col min-w-0 flex-1 gap-0.5">
                  <span className="row flex-wrap gap-2">
                    <b>{item.label}</b>
                    {status && <span className={`badge ${status.className}`}>{status.text}</span>}
                  </span>
                  <span className="hint">{item.detail}</span>
                </div>
              </li>
            );
          })}
        </ul>
        <Button
          variant={alreadySent ? 'outline' : 'default'}
          className="w-full justify-between"
          disabled={prepare.isPending}
          onClick={() => prepare.mutate()}
        >
          <span className="row gap-2">
            <Mail /> Proposer au client
          </span>
          {alreadySent && (
            <span aria-hidden className="hint">
              <Check className="mr-1 inline size-3.5" />
              déjà envoyé
            </span>
          )}
        </Button>
      </div>

      {prepared && (
        <SendLinkDialog
          title="Profitez de l’immobilisation"
          intro="Mail préparé avec les échéances du véhicule : relis-le et modifie-le avant l’envoi."
          message={prepared.message}
          senderEmail={prepared.senderEmail}
          mailCategory="workshop"
          contact={prepared.contact}
          onContactSave={saveContact}
          onSend={(channel, contact, providerMessageId) =>
            record.mutate({
              repairOrderId: order.id,
              type: 'upcoming_work',
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
