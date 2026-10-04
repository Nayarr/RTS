import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Mail, Tablet } from 'lucide-react';
import { toast } from 'sonner';
import { SendLinkDialog } from '@/components/SendLinkDialog';
import { Button } from '@/components/ui/button';
import {
  fetchClientContact,
  publicDocumentUrl,
  updateClientContact,
} from '@/features/documents/client-contact';
import type { RepairOrderOverview } from '@/features/repair-orders/api';
import { formatDate } from '@/features/repair-orders/constants';
import { repairOrderKey } from '@/features/repair-orders/hooks';
import { fetchSettings } from '@/features/settings/api';
import type { ContactValues, SendLinkMessage } from '@/lib/send-links';
import {
  cancelSignatureRequest,
  fetchSignatureRequest,
  requestSignature,
  signatureRequestKey,
  type SignatureChannel,
} from './api';
import { remainingPercent, signatureShareMessage } from './domain';
import { useCountdown } from './use-countdown';

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Demande impossible';

interface Prepared {
  link: string;
  message: SendLinkMessage;
  senderEmail: string | null;
  contact: ContactValues;
}

/**
 * Signature du client pas encore enregistrée : la demander sur la borne (client sur place,
 * 1 minute) ou par lien e-mail (client absent), et suivre la demande en direct.
 * `autoRequest` : demande lancée dès l'ouverture (choisie à la création de l'OR).
 */
export function SignatureRequestPanel({
  order,
  autoRequest,
}: {
  order: RepairOrderOverview;
  autoRequest?: SignatureChannel | null;
}) {
  const queryClient = useQueryClient();
  const key = signatureRequestKey(order.id);
  const request = useQuery({
    queryKey: key,
    queryFn: () => fetchSignatureRequest(order.id),
    // Borne : suivi toutes les 2 s tant que le client n'a pas signé
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' && query.state.data.channel === 'kiosk' ? 2000 : false,
  });
  const current = request.data;
  const kioskPending = current?.status === 'pending' && current.channel === 'kiosk';
  const seconds = useCountdown(current?.seconds_left ?? 0, request.dataUpdatedAt, kioskPending);
  const [prepared, setPrepared] = useState<Prepared | null>(null);

  // Signée : l'OR est rechargé pour afficher la signature.
  const signed = current?.status === 'signed';
  useEffect(() => {
    if (signed) {
      toast.success('Signature du client reçue');
      void queryClient.invalidateQueries({ queryKey: repairOrderKey(order.id) });
    }
  }, [signed, order.id, queryClient]);

  const ask = useMutation({
    mutationFn: async (channel: SignatureChannel) => {
      const created = await requestSignature(order.id, channel);
      if (channel === 'email' && created.token) {
        const [settings, contact] = await Promise.all([
          fetchSettings(),
          order.client_id
            ? fetchClientContact(order.client_id)
            : Promise.resolve({ email: null, phone: null }),
        ]);
        const link = publicDocumentUrl(created.token);
        setPrepared({
          link,
          message: signatureShareMessage(
            { number: order.number, plate: order.plate },
            link,
            settings.company,
          ),
          senderEmail: settings.company.email,
          contact: { email: contact.email ?? '', phone: contact.phone ?? '' },
        });
      }
      return created;
    },
    onSuccess: (created) => {
      queryClient.setQueryData(key, created);
      if (created.channel === 'kiosk') toast.success('Demande affichée sur la borne pendant 1 minute');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const cancel = useMutation({
    mutationFn: (requestId: string) => cancelSignatureRequest(requestId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  // Choix fait à la création de l'OR : demande lancée une seule fois.
  const autoSent = useRef(false);
  useEffect(() => {
    if (!autoRequest || autoSent.current || !request.isSuccess) return;
    autoSent.current = true;
    ask.mutate(autoRequest);
  }, [autoRequest, request.isSuccess, ask]);

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

  const emailPending = current?.status === 'pending' && current.channel === 'email';
  const kioskExpired = current?.status === 'expired' && current.channel === 'kiosk';

  return (
    <div className="col w-[250px] gap-2" aria-label="Signature du client">
      {kioskPending && seconds > 0 ? (
        <div className="col gap-1.5" role="status">
          <span className="row min-h-11 gap-1.5 text-[13px] font-semibold">
            <Tablet className="i xs" /> En attente sur la borne… {seconds} s
          </span>
          <div className="h-1.5 overflow-hidden rounded bg-muted">
            <i
              className="block h-full rounded bg-primary transition-[width] duration-300 ease-linear"
              style={{ width: `${remainingPercent(seconds)}%` }}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(current.id)}
          >
            Annuler la demande
          </Button>
        </div>
      ) : (
        <>
          <p className="row min-h-11 gap-1.5 text-[13px] font-semibold text-destructive">
            <AlertTriangle className="i xs" />
            {kioskExpired || (kioskPending && seconds === 0)
              ? 'Pas signé sur la borne dans la minute.'
              : 'Aucune signature client enregistrée.'}
          </p>
          {emailPending && (
            <span className="hint">
              Lien de signature envoyé, valable jusqu’au {formatDate(current.expires_at)}.
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="justify-start"
            disabled={ask.isPending}
            onClick={() => ask.mutate('kiosk')}
          >
            <Tablet /> {kioskExpired ? 'Relancer sur la borne' : 'Faire signer sur la borne'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="justify-start"
            disabled={ask.isPending}
            onClick={() => ask.mutate('email')}
          >
            <Mail /> {emailPending ? 'Renvoyer le lien de signature' : 'Demander par e-mail'}
          </Button>
        </>
      )}
      {prepared && (
        <SendLinkDialog
          title={`OR ${order.number} : signature à distance`}
          intro="Le client consulte l’ordre de réparation et le signe en ligne, sans compte. Le lien est valable 7 jours."
          link={prepared.link}
          linkLabel="Consulter et signer l’OR"
          message={prepared.message}
          senderEmail={prepared.senderEmail}
          mailCategory="signature"
          contact={prepared.contact}
          onContactSave={saveContact}
          onClose={() => setPrepared(null)}
        />
      )}
    </div>
  );
}
