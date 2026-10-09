import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  Eye,
  Link2,
  Loader2,
  Lock,
  MessageSquare,
  Paperclip,
  PenLine,
  RotateCcw,
  Send,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { PdfFile } from '@/components/PdfPreviewDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { sendMail, type MailCategory, type MailSettings } from '@/lib/mail';
import { bodyWithoutLink, splitSignature } from '@/lib/mail-text';
import { sendLinks, type ContactValues, type SendLinkMessage } from '@/lib/send-links';
import { cn } from '@/lib/utils';

export interface MailComposerProps {
  title: string;
  intro: string;
  link?: string | undefined;
  /** Libellé du bouton du document dans l'e-mail (« Consulter et signer le devis »). */
  linkLabel?: string | undefined;
  message: SendLinkMessage;
  settings: MailSettings;
  /** Adresse qui envoie (domaine des réglages) ; null : adresse unique réglée côté serveur. */
  senderAddress: string | null;
  mailCategory: MailCategory;
  contact: ContactValues;
  onContactSave: (contact: ContactValues) => void;
  onSend?:
    ((channel: 'email' | 'sms', contact: ContactValues, providerMessageId?: string) => void) | undefined;
  attachments?: { label: string; load: () => Promise<PdfFile[]> } | undefined;
  /** Réponse à un mail reçu (Agent Direction) : envoyée dans le fil du client. */
  inboxEmailId?: string | undefined;
  onClose: () => void;
}

const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('') || 'AT';

/**
 * Envoi par l'appli (Resend) : l'e-mail est relu avant de partir. À gauche ce qui se modifie
 * (destinataire, objet, texte, pièce jointe), à droite l'aperçu tel que le client le recevra.
 * Le lien du document n'est pas dans le texte : il devient un bouton sous le message.
 */
export function MailComposer({
  title,
  intro,
  link,
  linkLabel = 'Consulter le document',
  message,
  settings,
  senderAddress,
  mailCategory,
  contact: initial,
  onContactSave,
  onSend,
  attachments,
  inboxEmailId,
  onClose,
}: MailComposerProps) {
  const original = useMemo(
    () => ({ subject: message.subject, text: bodyWithoutLink(message.body, link) }),
    [message, link],
  );
  const [contact, setContact] = useState(initial);
  const [subject, setSubject] = useState(original.subject);
  const [text, setText] = useState(original.text);
  const [attach, setAttach] = useState(true);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [attachmentNames, setAttachmentNames] = useState<string[]>([]);
  const idempotency = useRef<{ payload: string; key: string } | null>(null);

  const edited = subject !== original.subject || text !== original.text;
  const to = contact.email.trim();
  const validEmail = VALID_EMAIL.test(to);
  const replyTo = senderAddress ?? settings.companyEmail;
  // Envoi par la messagerie : texte relu, avec le lien en clair
  const fallbackBody = link
    ? (() => {
        const [body, signature] = splitSignature(text);
        return [body, `${linkLabel} : ${link}`, signature].filter(Boolean).join('\n\n');
      })()
    : text;
  const links = sendLinks({ subject, body: fallbackBody, sms: message.sms }, contact, senderAddress);

  const save = () => {
    if (contact.email.trim() !== initial.email.trim() || contact.phone.trim() !== initial.phone.trim()) {
      onContactSave(contact);
    }
  };

  const sendNow = useMutation({
    mutationFn: async () => {
      const withFiles = Boolean(attachments) && attach;
      const payload = JSON.stringify([to, subject, text, withFiles]);
      if (idempotency.current?.payload !== payload) {
        idempotency.current = { payload, key: crypto.randomUUID() };
      }
      const files = withFiles && attachments ? await attachments.load() : [];
      setAttachmentNames(files.map((file) => file.fileName));
      return sendMail({
        category: mailCategory,
        to,
        subject,
        text,
        link: link ? { label: linkLabel, url: link } : undefined,
        attachments: files,
        idempotencyKey: idempotency.current.key,
        inboxEmailId,
      });
    },
    onSuccess: ({ id }) => {
      toast.success(`E-mail envoyé à ${to}`);
      save();
      onSend?.('email', contact, id);
      onClose();
    },
  });
  const failure =
    sendNow.error instanceof Error ? sendNow.error.message : sendNow.isError ? 'E-mail non envoyé' : null;

  const openMailApp = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!to && !window.confirm('Aucun e-mail client renseigné. Ouvrir quand même la messagerie ?')) {
      event.preventDefault();
      return;
    }
    save();
    onSend?.('email', contact);
  };

  const [body, signature] = splitSignature(text);
  const attachmentLabel = attachments?.label.replace(/^(le|la|les|l’)\s+/i, '');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[94dvh] gap-0 overflow-hidden p-0! sm:max-w-[1040px]"
      >
        <div className="flex max-h-[94dvh] min-h-0 flex-col px-0!">
          {/* En-tête */}
          <div className="row items-start gap-4 px-6 pt-5 pb-4 max-sm:px-4">
            <div className="col min-w-0 flex-1 gap-1">
              <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
              <DialogDescription className="text-[13.5px]">{intro}</DialogDescription>
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" aria-label="Fermer">
                <X />
              </Button>
            </DialogClose>
          </div>

          {/* Onglets sur téléphone */}
          <div className="px-4 pb-3 lg:hidden" role="tablist" aria-label="Modifier ou voir l’aperçu">
            <div className="grid grid-cols-2 gap-1 rounded-[10px] bg-muted p-[3px]">
              {(
                [
                  ['edit', 'Modifier', PenLine],
                  ['preview', 'Aperçu', Eye],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                  className={cn(
                    'row justify-center gap-1.5 rounded-lg py-2 text-[13.5px] font-medium text-muted-foreground',
                    tab === value && 'bg-card font-semibold text-foreground shadow-sm',
                  )}
                >
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 pb-5 max-sm:px-4 lg:grid-cols-[440px_minmax(0,1fr)]">
            {/* Message à envoyer */}
            <div
              className={cn('col gap-4', tab !== 'edit' && 'max-lg:hidden')}
              aria-label="Message à envoyer"
            >
              <div className="col gap-1.5">
                <span className="text-[13px] font-medium">De</span>
                <div className="row gap-2 rounded-lg bg-muted px-3 py-2.5 text-[13.5px]">
                  <Lock className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {settings.companyName}
                    {senderAddress ? ` <${senderAddress}>` : ''}
                  </span>
                </div>
                {replyTo && (
                  <span className="hint">
                    Les réponses du client arrivent sur {senderAddress ? 'cette adresse' : replyTo}.
                  </span>
                )}
              </div>
              <div className="field">
                <Label htmlFor="mail-to">À</Label>
                <Input
                  id="mail-to"
                  type="email"
                  placeholder="contact@client.fr"
                  value={contact.email}
                  onChange={(event) => setContact({ ...contact, email: event.target.value })}
                  onBlur={save}
                />
              </div>
              <div className="field">
                <Label htmlFor="mail-subject">Objet</Label>
                <Input
                  id="mail-subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                />
              </div>
              <div className="col gap-1.5">
                <div className="row gap-2">
                  <Label htmlFor="mail-text" className="flex-1">
                    Message
                  </Label>
                  {edited && (
                    <>
                      <span className="badge s-green text-[11.5px]!">
                        <PenLine className="size-3" /> Modifié
                      </span>
                      <button
                        type="button"
                        className="row gap-1 text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setSubject(original.subject);
                          setText(original.text);
                        }}
                      >
                        <RotateCcw className="size-3.5" /> Rétablir le texte d’origine
                      </button>
                    </>
                  )}
                </div>
                <Textarea
                  id="mail-text"
                  className="min-h-[220px] text-[14px] leading-[21px]"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
                <span className="hint">
                  Le texte modifié n’est envoyé qu’une fois : le modèle de message ne change pas.
                </span>
              </div>
              {link && (
                <p className="row items-start gap-2.5 rounded-lg bg-accent px-3 py-2.5 text-[12.5px] font-medium text-accent-foreground">
                  <Link2 className="mt-px size-4 shrink-0" />
                  Bouton « {linkLabel} » ajouté sous le message : il ouvre le document en ligne.
                </p>
              )}
              {attachments && (
                <label className="row cursor-pointer gap-2.5 text-[13.5px] font-medium">
                  <input
                    type="checkbox"
                    checked={attach}
                    onChange={(event) => setAttach(event.target.checked)}
                  />
                  <Paperclip className="size-3.5 text-muted-foreground" /> Joindre {attachments.label}
                </label>
              )}
            </div>

            {/* Aperçu */}
            <section
              className={cn('col gap-3 rounded-xl bg-muted p-4', tab !== 'preview' && 'max-lg:hidden')}
              aria-label="Aperçu de l’e-mail"
            >
              <div className="row gap-1.5 text-[12.5px] font-medium text-muted-foreground">
                <Eye className="size-3.5" />
                <span className="flex-1">Aperçu · tel que le client le recevra</span>
                <span className="font-normal max-sm:hidden">Mis à jour pendant la saisie</span>
              </div>
              <article className="col gap-3.5 rounded-[10px] border bg-card p-5 max-sm:p-4">
                <h3 className="text-[17px] leading-[23px] font-semibold">{subject || '(sans objet)'}</h3>
                <div className="row gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground">
                    {initials(settings.companyName)}
                  </span>
                  <span className="col min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-[13.5px]">
                      <b>{settings.companyName}</b>
                      {senderAddress && (
                        <span className="text-muted-foreground"> &lt;{senderAddress}&gt;</span>
                      )}
                    </span>
                    <span className="truncate text-[12.5px] text-muted-foreground">À {to || '…'}</span>
                  </span>
                </div>
                <hr />
                <p className="text-[14px] leading-[21px] whitespace-pre-line">{body}</p>
                {link && (
                  <>
                    <span className="self-start rounded-md bg-primary px-4 py-2.5 text-[14px] font-semibold text-primary-foreground">
                      {linkLabel}
                    </span>
                    <span className="text-[12px] break-all text-muted-foreground">
                      Le bouton ne marche pas ? Copiez ce lien : {link}
                    </span>
                  </>
                )}
                {attachments && attach && (
                  <>
                    <hr />
                    <span className="row gap-2.5 self-start rounded-lg border px-3 py-2 text-[13px] font-medium">
                      <span className="rounded bg-destructive/10 px-1.5 py-1 text-[9px] font-bold text-destructive">
                        PDF
                      </span>
                      {attachmentNames[0] ?? attachmentLabel}
                    </span>
                  </>
                )}
                {signature && (
                  <>
                    <hr />
                    <p className="text-[13px] leading-[19px] whitespace-pre-line text-muted-foreground">
                      {signature}
                    </p>
                  </>
                )}
              </article>
            </section>
          </div>

          {failure && (
            <div className="px-6 pb-4 max-sm:px-4">
              <p role="alert" className="alert s-bad">
                <AlertTriangle className="i s shrink-0" />
                <span>
                  <b>E-mail non envoyé : {failure}</b>
                  <br />
                  Ton texte est gardé. Réessaie dans un instant, ou ouvre-le dans ta messagerie pour l’envoyer
                  toi-même.
                </span>
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="row flex-wrap gap-2 border-t px-6 py-3.5 max-sm:px-4">
            <Button variant="ghost" asChild>
              <a href={links.mailto} onClick={openMailApp}>
                <ExternalLink /> Ouvrir dans ma messagerie
              </a>
            </Button>
            {link ? (
              <Button
                variant="ghost"
                onClick={() =>
                  void navigator.clipboard.writeText(link).then(
                    () => toast.success('Lien copié'),
                    () => toast.error('Copie impossible'),
                  )
                }
              >
                <Copy /> Copier le lien
              </Button>
            ) : (
              <Button variant="ghost" asChild>
                <a
                  href={links.sms}
                  onClick={() => {
                    save();
                    onSend?.('sms', contact);
                  }}
                >
                  <MessageSquare /> Envoyer par SMS
                </a>
              </Button>
            )}
            <span className="flex-1" />
            {!validEmail && <span className="hint">Renseigne l’e-mail du client pour l’envoyer.</span>}
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button
              disabled={!validEmail || !text.trim() || !subject.trim() || sendNow.isPending}
              onClick={() => sendNow.mutate()}
            >
              {sendNow.isPending ? <Loader2 className="animate-spin" /> : failure ? <RotateCcw /> : <Send />}{' '}
              {failure ? 'Réessayer' : 'Envoyer l’e-mail'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
