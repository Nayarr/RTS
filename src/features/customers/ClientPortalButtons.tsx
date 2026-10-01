import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SendLinkDialog } from '@/components/SendLinkDialog';
import { Button } from '@/components/ui/button';
import {
  fetchClientContact,
  publicDocumentUrl,
  updateClientContact,
} from '@/features/documents/client-contact';
import { fetchSettings } from '@/features/settings/api';
import type { ContactValues, SendLinkMessage } from '@/lib/send-links';
import {
  hasClientPortal,
  portalMessage,
  recordPortalMessage,
  resetClientPortal,
  shareClientPortal,
} from './portal';

interface Prepared {
  link: string;
  message: SendLinkMessage;
  senderEmail: string | null;
  contact: ContactValues;
}

/** « Espace client en ligne » : lien personnel et permanent envoyé au client ; changement du lien. */
export function ClientPortalButtons({ clientId, clientName }: { clientId: string; clientName: string }) {
  const queryClient = useQueryClient();
  const portalKey = ['clients', clientId, 'portal'];
  const exists = useQuery({ queryKey: portalKey, queryFn: () => hasClientPortal(clientId) });
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const open = async (token: string) => {
    const [settings, contact] = await Promise.all([fetchSettings(), fetchClientContact(clientId)]);
    const link = publicDocumentUrl(token);
    setPrepared({
      link,
      message: portalMessage(link, settings.company),
      senderEmail: settings.company.email,
      contact: { email: contact.email ?? '', phone: contact.phone ?? '' },
    });
    await queryClient.invalidateQueries({ queryKey: portalKey });
  };

  const share = useMutation({
    mutationFn: async () => open(await shareClientPortal(clientId)),
    onError: () => toast.error('Échec de la préparation de l’espace client'),
  });
  const reset = useMutation({
    mutationFn: async () => open(await resetClientPortal(clientId)),
    onSuccess: () => {
      setConfirmReset(false);
      toast.success('Nouveau lien créé : l’ancien ne fonctionne plus');
    },
    onError: () => toast.error('Changement du lien impossible'),
  });
  const record = useMutation({
    mutationFn: (input: Parameters<typeof recordPortalMessage>[0]) => recordPortalMessage(input),
    onError: () => toast.error('Envoi non enregistré'),
  });

  const saveContact = (contact: ContactValues) =>
    updateClientContact(clientId, {
      email: contact.email.trim() || null,
      phone: contact.phone.trim() || null,
    }).then(
      () => toast.success('Coordonnées du client enregistrées'),
      () => toast.error('Coordonnées non enregistrées'),
    );

  return (
    <>
      <Button className="w-full" disabled={share.isPending} onClick={() => share.mutate()}>
        <Send /> Envoyer le lien au client
      </Button>
      {exists.data && (
        <Button
          variant="outline"
          className="w-full"
          disabled={reset.isPending}
          onClick={() => setConfirmReset(true)}
        >
          <RefreshCw /> Changer le lien
        </Button>
      )}

      {prepared && (
        <SendLinkDialog
          title={`Espace client — ${clientName}`}
          intro="Lien personnel et permanent vers l’espace de ce client : véhicules à l’atelier, devis à signer, factures et échéances. Il est toujours à jour."
          link={prepared.link}
          message={prepared.message}
          senderEmail={prepared.senderEmail}
          contact={prepared.contact}
          onContactSave={(contact) => void saveContact(contact)}
          onSend={(channel, contact) =>
            record.mutate({
              clientId,
              channel,
              recipient: (channel === 'email' ? contact.email : contact.phone).trim() || null,
              message: prepared.message,
            })
          }
          onClose={() => setPrepared(null)}
        />
      )}
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Changer le lien de l’espace client ?"
        description="L’ancien lien cessera aussitôt de fonctionner. Il faudra envoyer le nouveau au client."
        confirmLabel="Changer le lien"
        pending={reset.isPending}
        onConfirm={() => reset.mutate()}
      />
    </>
  );
}
