import { useRef, useState, type MouseEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Copy, Loader2, Mail, MessageSquare, Paperclip, Send } from 'lucide-react';
import { toast } from 'sonner';
import { FormField } from '@/components/FormField';
import type { PdfFile } from '@/components/PdfPreviewDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchMailSettings, mailSender, mailSettingsKey, sendMail, type MailCategory } from '@/lib/mail';
import { sendLinks, type ContactValues, type SendLinkMessage } from '@/lib/send-links';

interface SendLinkDialogProps {
  title: string;
  intro: string;
  /** Lien de consultation ; absent pour un simple message (rappel de rendez-vous). */
  link?: string | undefined;
  message: SendLinkMessage;
  /** Adresse d'envoi conseillée (celle de l'atelier), si aucun domaine d'envoi n'est réglé. */
  senderEmail: string | null;
  /** Type de message : facturation@ (devis, factures, contrats), atelier@ (infos, rappels), signature@. */
  mailCategory: MailCategory;
  contact: ContactValues;
  onContactSave: (contact: ContactValues) => void;
  /**
   * Appelé quand l'envoi part par e-mail ou par SMS (traçabilité).
   * `providerMessageId` : identifiant Resend quand l'appli a envoyé l'e-mail elle-même.
   */
  onSend?:
    ((channel: 'email' | 'sms', contact: ContactValues, providerMessageId?: string) => void) | undefined;
  /** PDF joints quand l'appli envoie l'e-mail (devis, facture, contrat). */
  attachments?: { label: string; load: () => Promise<PdfFile[]> } | undefined;
  onClose: () => void;
}

/**
 * Envoi d'un lien ou d'un message au client (devis à signer, facture, rappel) : l'appli prépare le message,
 * puis l'envoie elle-même (réglage de la direction, service Resend) ou ouvre la messagerie de l'atelier.
 */
export function SendLinkDialog({
  title,
  intro,
  link,
  message,
  senderEmail: companyEmail,
  mailCategory,
  contact: initial,
  onContactSave,
  onSend,
  attachments,
  onClose,
}: SendLinkDialogProps) {
  const [contact, setContact] = useState(initial);
  const [attach, setAttach] = useState(true);
  const mailSettings = useQuery({ queryKey: mailSettingsKey, queryFn: fetchMailSettings, staleTime: 60_000 });
  const direct = mailSettings.data?.enabled === true;
  // Adresse du type de message (Réglages › Atelier), sinon l'e-mail de l'entreprise
  const senderEmail = (mailSettings.data && mailSender(mailCategory, mailSettings.data)) ?? companyEmail;
  const links = sendLinks(message, contact, senderEmail);
  // Même clé tant que l'envoi ne change pas : un nouvel essai n'envoie pas l'e-mail deux fois.
  const idempotency = useRef<{ payload: string; key: string } | null>(null);

  const save = () => {
    if (contact.email.trim() !== initial.email.trim() || contact.phone.trim() !== initial.phone.trim()) {
      onContactSave(contact);
    }
  };
  const send = (channel: 'email' | 'sms') => () => {
    save();
    onSend?.(channel, contact);
  };
  /** Comme l'ancienne appli : confirmation avant d'ouvrir la messagerie sans adresse du client. */
  const sendByEmailApp = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      !contact.email.trim() &&
      !window.confirm('Aucun e-mail client renseigné. Ouvrir quand même la messagerie ?')
    ) {
      event.preventDefault();
      return;
    }
    send('email')();
  };

  const sendNow = useMutation({
    mutationFn: async () => {
      const to = contact.email.trim();
      const withFiles = Boolean(attachments) && attach;
      const payload = `${to}|${withFiles}`;
      if (idempotency.current?.payload !== payload) {
        idempotency.current = { payload, key: crypto.randomUUID() };
      }
      const files = withFiles && attachments ? await attachments.load() : [];
      return sendMail({
        category: mailCategory,
        to,
        message,
        attachments: files,
        idempotencyKey: idempotency.current.key,
      });
    },
    onSuccess: ({ id }) => {
      toast.success(`E-mail envoyé à ${contact.email.trim()}`);
      save();
      onSend?.('email', contact, id);
      onClose();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'E-mail non envoyé'),
  });
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim());

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{intro}</DialogDescription>
        </DialogHeader>
        {senderEmail && (
          <p className="text-sm text-muted-foreground">
            {direct && mailSettings.data?.domain ? (
              <>
                Envoyé par l’appli depuis <strong>{senderEmail}</strong> : les réponses du client arrivent sur
                cette adresse.
              </>
            ) : direct ? (
              <>
                Envoyé par l’appli au nom de l’atelier : les réponses du client arrivent sur{' '}
                <strong>{senderEmail}</strong>.
              </>
            ) : (
              <>
                À envoyer depuis <strong>{senderEmail}</strong> : vérifie que c’est bien le compte expéditeur
                choisi dans ta messagerie.
              </>
            )}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            id="send-email"
            label="E-mail du client"
            type="email"
            placeholder="contact@client.fr"
            value={contact.email}
            onChange={(event) => setContact({ ...contact, email: event.target.value })}
            onBlur={save}
          />
          <FormField
            id="send-phone"
            label="Téléphone du client"
            type="tel"
            placeholder="06 12 34 56 78"
            value={contact.phone}
            onChange={(event) => setContact({ ...contact, phone: event.target.value })}
            onBlur={save}
          />
        </div>
        {link && (
          <div className="space-y-2">
            <Label htmlFor="send-link">Lien</Label>
            <Input id="send-link" readOnly value={link} onFocus={(e) => e.target.select()} />
          </div>
        )}
        <div className="flex flex-col gap-2">
          {direct && (
            <>
              {attachments && (
                <label className="row cursor-pointer gap-2.5 text-[13.5px]">
                  <input
                    type="checkbox"
                    checked={attach}
                    onChange={(event) => setAttach(event.target.checked)}
                  />
                  <Paperclip className="i xs" /> Joindre {attachments.label}
                </label>
              )}
              <Button disabled={!validEmail || sendNow.isPending} onClick={() => sendNow.mutate()}>
                {sendNow.isPending ? <Loader2 className="animate-spin" /> : <Send />} Envoyer l’e-mail
                maintenant
              </Button>
              {!validEmail && <span className="hint">Renseigne l’e-mail du client pour l’envoyer.</span>}
              <span className="mt-1 overline">Ou par ta messagerie</span>
            </>
          )}
          <Button variant={direct ? 'outline' : 'default'} asChild>
            <a href={links.mailto} onClick={sendByEmailApp}>
              <Mail /> Envoyer par e-mail (messagerie de l’ordinateur)
            </a>
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" asChild>
              <a href={links.gmail} target="_blank" rel="noreferrer" onClick={send('email')}>
                Ouvrir dans Gmail
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={links.outlook} target="_blank" rel="noreferrer" onClick={send('email')}>
                Ouvrir dans Outlook web
              </a>
            </Button>
          </div>
          {link && (
            <Button
              variant="outline"
              onClick={() =>
                void navigator.clipboard.writeText(link).then(
                  () => toast.success('Lien copié'),
                  () => toast.error('Copie impossible : sélectionne le lien ci-dessus'),
                )
              }
            >
              <Copy /> Copier le lien
            </Button>
          )}
          <Button variant="ghost" asChild>
            <a href={links.sms} onClick={send('sms')}>
              <MessageSquare /> Envoyer par SMS (depuis un téléphone)
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
