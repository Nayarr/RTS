import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Receipt, Send } from 'lucide-react';
import { toast } from 'sonner';
import { SendLinkDialog } from '@/components/SendLinkDialog';
import { Button } from '@/components/ui/button';
import {
  fetchClientContact,
  publicDocumentUrl,
  updateClientContact,
} from '@/features/documents/client-contact';
import { useInvoice } from '@/features/invoices/hooks';
import { ShareInvoiceButtons } from '@/features/invoices/ShareInvoiceButtons';
import { formatDate } from '@/features/repair-orders/constants';
import { fetchSettings } from '@/features/settings/api';
import type { ContactValues, SendLinkMessage } from '@/lib/send-links';
import {
  fetchRentalSignatureRequest,
  requestRentalSignature,
  shareRental,
  type RentalDetail,
} from './rental-api';
import { rentalsKey } from './rental-hooks';
import { rentalContractMessage, rentalSignatureMessage } from './rental-messages';

interface Prepared {
  link: string;
  message: SendLinkMessage;
  senderEmail: string | null;
  contact: ContactValues;
}

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Envoi impossible';

/** Message prêt à envoyer, avec les coordonnées du client et l'adresse d'envoi de l'atelier. */
async function prepare(
  detail: RentalDetail,
  token: string,
  build: typeof rentalContractMessage,
): Promise<Prepared> {
  const { rental, vehicle, client } = detail;
  const [settings, contact] = await Promise.all([fetchSettings(), fetchClientContact(client.id)]);
  const link = publicDocumentUrl(token);
  return {
    link,
    message: build(
      {
        number: rental.number,
        kind: rental.kind,
        plate: vehicle.plate,
        departure_at: rental.departure_at,
        planned_return_at: rental.planned_return_at,
      },
      link,
      settings.company,
    ),
    senderEmail: settings.company.email,
    contact: { email: contact.email ?? '', phone: contact.phone ?? '' },
  };
}

function useSaveContact(clientId: string) {
  return (contact: ContactValues) => {
    updateClientContact(clientId, {
      email: contact.email.trim() || null,
      phone: contact.phone.trim() || null,
    }).then(
      () => toast.success('Coordonnées du client enregistrées'),
      () => toast.error('Coordonnées non enregistrées'),
    );
  };
}

/**
 * Signature à distance : lien envoyé au client absent (valable 7 jours), suivi de la demande.
 * Dès que le client a signé, le contrat est rechargé (remise des clés débloquée).
 */
export function RemoteSignature({ detail }: { detail: RentalDetail }) {
  const { rental } = detail;
  const queryClient = useQueryClient();
  const key = [...rentalsKey, rental.id, 'signature-request'];
  const request = useQuery({
    queryKey: key,
    queryFn: () => fetchRentalSignatureRequest(rental.id),
    // Suivi toutes les 10 s tant que le client n'a pas signé
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 10_000 : false),
  });
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const saveContact = useSaveContact(detail.client.id);

  const signed = request.data?.status === 'signed';
  useEffect(() => {
    if (signed && !rental.signed_at) {
      toast.success('Le client a signé le contrat');
      void queryClient.invalidateQueries({ queryKey: rentalsKey });
    }
  }, [signed, rental.signed_at, queryClient]);

  const ask = useMutation({
    mutationFn: async () => {
      const created = await requestRentalSignature(rental.id);
      setPrepared(await prepare(detail, created.token ?? '', rentalSignatureMessage));
      return created;
    },
    onSuccess: (created) => queryClient.setQueryData(key, created),
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (rental.signed_at || rental.status !== 'reserved') return null;
  const pending = request.data?.status === 'pending' ? request.data : null;

  return (
    <div className="col gap-2" aria-label="Signature à distance">
      {pending && (
        <span className="hint">
          Lien de signature envoyé, valable jusqu’au {formatDate(pending.expires_at)}. Le contrat se met à
          jour dès que le client signe.
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        disabled={ask.isPending}
        onClick={() => ask.mutate()}
      >
        <Mail /> {pending ? 'Renvoyer le lien de signature' : 'Faire signer à distance (e-mail)'}
      </Button>
      {prepared && (
        <SendLinkDialog
          title={`${rental.number} : signature à distance`}
          intro="Le client relit le contrat et le signe en ligne, sans compte. Le lien est valable 7 jours."
          link={prepared.link}
          message={prepared.message}
          senderEmail={prepared.senderEmail}
          contact={prepared.contact}
          onContactSave={saveContact}
          onClose={() => setPrepared(null)}
        />
      )}
    </div>
  );
}

/** « Envoyer au client » : lien de consultation du contrat (imprimable ou enregistrable en PDF). */
export function SendContractButton({ detail }: { detail: RentalDetail }) {
  const { rental } = detail;
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const saveContact = useSaveContact(detail.client.id);
  const share = useMutation({
    mutationFn: async () =>
      setPrepared(await prepare(detail, await shareRental(rental.id), rentalContractMessage)),
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (rental.status === 'cancelled') return null;
  const name = rental.kind === 'loan' ? 'le bon de prêt' : 'le contrat';
  return (
    <>
      <Button variant="outline" disabled={share.isPending} onClick={() => share.mutate()}>
        <Send /> Envoyer {name}
      </Button>
      {prepared && (
        <SendLinkDialog
          title={`Envoyer ${name} ${rental.number}`}
          intro="Le client pourra consulter, imprimer ou enregistrer son contrat en PDF."
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

/** Facture de la location : envoi au client une fois émise (et relance si elle est en retard). */
export function RentalInvoiceCard({ invoiceId }: { invoiceId: string }) {
  const detail = useInvoice(invoiceId);
  const invoice = detail.data?.invoice;
  if (!invoice) return null;
  const issued = invoice.status === 'issued';
  return (
    <section data-slot="card" className="card" aria-labelledby="rental-invoice">
      <div className="card-h">
        <h2 className="h2" id="rental-invoice">
          Facture {invoice.number ?? ''}
        </h2>
        <Button size="sm" variant="outline" asChild>
          <Link to={`/factures/${invoice.id}`}>
            <Receipt /> Ouvrir
          </Link>
        </Button>
      </div>
      <div className="card-b col gap-2">
        {issued ? (
          <ShareInvoiceButtons invoice={invoice} />
        ) : (
          <span className="hint">Facture en brouillon : émets-la pour pouvoir l’envoyer au client.</span>
        )}
      </div>
    </section>
  );
}
