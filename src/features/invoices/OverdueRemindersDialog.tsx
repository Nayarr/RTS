import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { publicDocumentUrl } from '@/features/documents/client-contact';
import { formatDate } from '@/features/repair-orders/constants';
import { todayIso } from '@/features/repair-orders/schemas';
import { useSettings } from '@/features/settings/hooks';
import { fetchMailSettings, mailSettingsKey, sendMail } from '@/lib/mail';
import { formatEuro } from '@/lib/numbers';
import { fetchClientEmails, recordInvoiceReminder, shareInvoice, type InvoiceOverview } from './api';
import { overdueByClient, overdueReminderMessage, type OverdueClient } from './domain';

const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Relance de tous les retards : un mail par client, qui liste ses factures en retard avec leur
 * lien. Envoi par l'appli (adresse facturation@), sinon messagerie de l'ordinateur ; chaque
 * facture garde la relance.
 */
export function OverdueRemindersDialog({
  invoices,
  onClose,
}: {
  invoices: InvoiceOverview[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const settings = useSettings();
  const mail = useQuery({ queryKey: mailSettingsKey, queryFn: fetchMailSettings });
  const groups = useMemo(() => overdueByClient(invoices), [invoices]);
  const clientIds = groups.map((group) => group.clientId);
  const emails = useQuery({
    queryKey: ['invoices', 'overdue-emails', clientIds],
    queryFn: () => fetchClientEmails(clientIds),
  });
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  // Sans envoi par l'appli : messages prêts pour la messagerie de l'ordinateur
  const [prepared, setPrepared] = useState<Record<string, { subject: string; body: string }>>({});

  const emailOf = (group: OverdueClient) => {
    const email = emails.data?.[group.clientId]?.trim() ?? '';
    return VALID_EMAIL.test(email) ? email : null;
  };
  const selected = groups.filter(
    (group) => emailOf(group) && !skipped.has(group.clientId) && !done.has(group.clientId),
  );
  const company = settings.data?.company;
  const enabled = mail.data?.enabled ?? false;
  const count = `${selected.length} relance${selected.length > 1 ? 's' : ''}`;

  /** Liens de consultation et relance tracée sur chaque facture, puis message du client. */
  const prepare = async (group: OverdueClient) => {
    if (!company) throw new Error('réglages de l’atelier indisponibles');
    const links: Record<string, string> = {};
    for (const invoice of group.invoices) {
      links[invoice.id] = publicDocumentUrl(await shareInvoice(invoice.id));
      await recordInvoiceReminder(invoice.id);
    }
    return overdueReminderMessage(group, links, company);
  };

  const run = async () => {
    setSending(true);
    let sent = 0;
    for (const group of selected) {
      try {
        const message = await prepare(group);
        if (enabled) {
          await sendMail({
            category: 'billing',
            to: emailOf(group) ?? '',
            subject: message.subject,
            text: message.body,
            attachments: [],
            idempotencyKey: crypto.randomUUID(),
          });
          sent++;
        } else {
          setPrepared((current) => ({ ...current, [group.clientId]: message }));
        }
        setDone((current) => new Set(current).add(group.clientId));
      } catch (error) {
        toast.error(
          `${group.clientName} non relancé : ${error instanceof Error ? error.message : 'réessaie'}`,
        );
      }
    }
    setSending(false);
    void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    if (sent) toast.success(`${sent} relance${sent > 1 ? 's' : ''} envoyée${sent > 1 ? 's' : ''}`);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !sending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Relancer les retards</DialogTitle>
          <DialogDescription>
            Un mail par client avec toutes ses factures en retard au {formatDate(todayIso())}
            {enabled
              ? ', envoyé depuis l’adresse de facturation.'
              : ' : l’envoi par l’appli est coupé, chaque message s’ouvre dans ta messagerie.'}
          </DialogDescription>
        </DialogHeader>
        {groups.length === 0 ? (
          <p className="empty">Aucune facture en retard.</p>
        ) : (
          <ul className="col max-h-[50vh] gap-2 overflow-y-auto" aria-label="Clients à relancer">
            {groups.map((group) => {
              const email = emailOf(group);
              const message = prepared[group.clientId];
              const relanced = done.has(group.clientId);
              return (
                <li key={group.clientId} className="row items-start gap-3 border-t pt-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    aria-label={`Relancer ${group.clientName}`}
                    disabled={!email || relanced || sending}
                    checked={Boolean(email) && !skipped.has(group.clientId)}
                    onChange={(event) =>
                      setSkipped((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.delete(group.clientId);
                        else next.add(group.clientId);
                        return next;
                      })
                    }
                  />
                  <span className="col grow gap-0.5">
                    <b>{group.clientName}</b>
                    <span className="hint">
                      {group.invoices.map((invoice) => invoice.number).join(', ')} ·{' '}
                      <span className="num">{formatEuro(group.balance)}</span> en retard
                    </span>
                    <span className="hint">
                      {relanced && !message
                        ? `Relancé (${email ?? ''})`
                        : (email ?? 'Pas d’e-mail sur la fiche : relance depuis la facture')}
                    </span>
                    {message && email && (
                      <a
                        className="row gap-1 text-sm underline"
                        href={`mailto:${email}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`}
                      >
                        <Mail className="i" /> Ouvrir dans la messagerie
                      </a>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Fermer
          </Button>
          <Button onClick={() => void run()} disabled={sending || selected.length === 0 || !company}>
            <BellRing /> {enabled ? `Envoyer ${count}` : `Préparer ${count}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
