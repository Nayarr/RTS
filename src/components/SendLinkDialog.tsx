import { useState } from 'react';
import { Copy, Mail, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sendLinks, type ContactValues, type SendLinkMessage } from '@/lib/send-links';

interface SendLinkDialogProps {
  title: string;
  intro: string;
  /** Lien de consultation ; absent pour un simple message (rappel de rendez-vous). */
  link?: string | undefined;
  message: SendLinkMessage;
  /** Adresse d'envoi conseillée (celle de l'atelier). */
  senderEmail: string | null;
  contact: ContactValues;
  onContactSave: (contact: ContactValues) => void;
  onClose: () => void;
}

/**
 * Envoi d'un lien ou d'un message au client (devis à signer, facture, rappel) : l'appli prépare le message,
 * la messagerie de l'atelier l'envoie (comme l'ancienne appli).
 */
export function SendLinkDialog({
  title,
  intro,
  link,
  message,
  senderEmail,
  contact: initial,
  onContactSave,
  onClose,
}: SendLinkDialogProps) {
  const [contact, setContact] = useState(initial);
  const links = sendLinks(message, contact);
  const save = () => {
    if (contact.email.trim() !== initial.email.trim() || contact.phone.trim() !== initial.phone.trim()) {
      onContactSave(contact);
    }
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
            <Input id="send-link" readOnly value={link} className="h-11" onFocus={(e) => e.target.select()} />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Button asChild>
            <a href={links.mailto} onClick={save}>
              <Mail /> Envoyer par e-mail (messagerie de l’ordinateur)
            </a>
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" asChild>
              <a href={links.gmail} target="_blank" rel="noreferrer" onClick={save}>
                Ouvrir dans Gmail
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={links.outlook} target="_blank" rel="noreferrer" onClick={save}>
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
            <a href={links.sms} onClick={save}>
              <MessageSquare /> Envoyer par SMS (depuis un téléphone)
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
