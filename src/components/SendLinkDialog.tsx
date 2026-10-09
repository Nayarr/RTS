import { useState, type MouseEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Mail, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { FormField } from '@/components/FormField';
import { MailComposer } from '@/components/MailComposer';
import type { PdfFile } from '@/components/PdfPreviewDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchMailSettings, mailSender, mailSettingsKey, type MailCategory } from '@/lib/mail';
import { sendLinks, type ContactValues, type SendLinkMessage } from '@/lib/send-links';

interface SendLinkDialogProps {
  title: string;
  intro: string;
  /** Lien de consultation ; absent pour un simple message (rappel de rendez-vous). */
  link?: string | undefined;
  /** Libellé du bouton du document dans l'e-mail envoyé par l'appli. */
  linkLabel?: string | undefined;
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
  /** Réponse à un mail reçu (Agent Direction) : envoyée dans le fil du client. */
  inboxEmailId?: string | undefined;
  onClose: () => void;
}

/**
 * Envoi d'un lien ou d'un message au client (devis à signer, facture, rappel) : l'appli prépare le message.
 * Envoi par l'appli activé (réglage de la direction, service Resend) : l'e-mail est relu et modifiable
 * avant de partir (aperçu). Sinon, la messagerie de l'atelier s'ouvre avec le message prêt.
 */
export function SendLinkDialog(props: SendLinkDialogProps) {
  const mailSettings = useQuery({ queryKey: mailSettingsKey, queryFn: fetchMailSettings, staleTime: 60_000 });
  const settings = mailSettings.data;
  if (settings?.enabled) {
    return (
      <MailComposer
        title={props.title}
        intro={props.intro}
        link={props.link}
        linkLabel={props.linkLabel}
        message={props.message}
        settings={settings}
        senderAddress={mailSender(props.mailCategory, settings)}
        mailCategory={props.mailCategory}
        contact={props.contact}
        onContactSave={props.onContactSave}
        onSend={props.onSend}
        attachments={props.attachments}
        inboxEmailId={props.inboxEmailId}
        onClose={props.onClose}
      />
    );
  }
  const senderEmail = (settings && mailSender(props.mailCategory, settings)) ?? props.senderEmail;
  return <MailAppDialog {...props} senderEmail={senderEmail} />;
}

/** Envoi par la messagerie de l'ordinateur, Gmail, Outlook web ou SMS (comme l'ancienne appli). */
function MailAppDialog({
  title,
  intro,
  link,
  message,
  senderEmail,
  contact: initial,
  onContactSave,
  onSend,
  onClose,
}: SendLinkDialogProps) {
  const [contact, setContact] = useState(initial);
  const links = sendLinks(message, contact, senderEmail);

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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{intro}</DialogDescription>
        </DialogHeader>
        {senderEmail && (
          <p className="text-sm text-muted-foreground">
            À envoyer depuis <strong>{senderEmail}</strong> : vérifie que c’est bien le compte expéditeur
            choisi dans ta messagerie.
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
          <Button asChild>
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
