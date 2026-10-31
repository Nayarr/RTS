import { useState } from 'react';
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
import { useSettings } from '@/features/settings/hooks';
import { fetchMailSettings, mailSettingsKey, sendMail } from '@/lib/mail';
import { recordDeadlineReminders, type VehicleDeadline } from './api';
import {
  deadlineReminderMessage,
  reminderLine,
  remindersByClient,
  type ReminderClient,
} from './deadline-reminders';
import { vehiclesKey } from './hooks';

/**
 * Relance des échéances : un mail par client pour tous ses véhicules dépassés ou dans les 30 jours,
 * envoyé depuis l'adresse de l'atelier (sinon prêt pour la messagerie de l'ordinateur). La relance
 * est notée sur chaque véhicule : plus de relance pendant 3 mois (page, Agent Direction, rappels).
 */
export function DeadlineRemindersDialog({
  deadlines,
  today,
  onClose,
}: {
  deadlines: VehicleDeadline[];
  today: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const settings = useSettings();
  const mail = useQuery({ queryKey: mailSettingsKey, queryFn: fetchMailSettings });
  // Liste figée à l'ouverture : les clients relancés restent affichés « Relancé » après l'envoi
  const [groups] = useState(() => remindersByClient(deadlines));
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  // Sans envoi par l'appli : messages prêts pour la messagerie de l'ordinateur
  const [prepared, setPrepared] = useState<Record<string, { subject: string; body: string }>>({});

  const company = settings.data?.company;
  const enabled = mail.data?.enabled ?? false;
  const selected = groups.filter(
    (group) => group.email && !skipped.has(group.clientId) && !done.has(group.clientId),
  );
  const count = `${selected.length} mail${selected.length > 1 ? 's' : ''}`;

  const remind = async (group: ReminderClient) => {
    if (!company) throw new Error('réglages de l’atelier indisponibles');
    const message = deadlineReminderMessage(group, today, company);
    if (enabled) {
      await sendMail({
        category: 'workshop',
        to: group.email ?? '',
        subject: message.subject,
        text: message.body,
        attachments: [],
        idempotencyKey: crypto.randomUUID(),
      });
    } else {
      setPrepared((current) => ({ ...current, [group.clientId]: message }));
    }
    // Relance notée sur chaque véhicule : bouton bloqué 3 mois
    await recordDeadlineReminders(
      group.items.map((item) => ({ vehicle_id: item.vehicleId, kind: item.kind })),
    );
  };

  const run = async () => {
    setSending(true);
    let sent = 0;
    for (const group of selected) {
      try {
        await remind(group);
        if (enabled) sent++;
        setDone((current) => new Set(current).add(group.clientId));
      } catch (error) {
        toast.error(
          `${group.clientName} non relancé : ${error instanceof Error ? error.message : 'réessaie'}`,
        );
      }
    }
    setSending(false);
    void queryClient.invalidateQueries({ queryKey: vehiclesKey });
    if (sent) toast.success(`${sent} relance${sent > 1 ? 's' : ''} envoyée${sent > 1 ? 's' : ''}`);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !sending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Relancer les échéances</DialogTitle>
          <DialogDescription>
            Un mail par client pour tous ses contrôles dépassés ou dans les 30 jours
            {enabled
              ? ', envoyé depuis l’adresse de l’atelier.'
              : ' : l’envoi par l’appli est coupé, chaque message s’ouvre dans ta messagerie.'}{' '}
            Un véhicule relancé ne se relance plus pendant 3 mois.
          </DialogDescription>
        </DialogHeader>
        {groups.length === 0 ? (
          <p className="empty">
            Aucun véhicule à relancer : tous ont déjà été relancés depuis moins de 3 mois.
          </p>
        ) : (
          <ul className="col max-h-[50vh] gap-2 overflow-y-auto" aria-label="Clients à relancer">
            {groups.map((group) => {
              const message = prepared[group.clientId];
              const relanced = done.has(group.clientId);
              return (
                <li key={group.clientId} className="row items-start gap-3 border-t pt-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    aria-label={`Relancer ${group.clientName}`}
                    disabled={!group.email || relanced || sending}
                    checked={Boolean(group.email) && !skipped.has(group.clientId)}
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
                    <ul className="hint">
                      {group.items.map((item) => (
                        <li key={`${item.vehicleId}-${item.kind}`}>{reminderLine(item, today)}</li>
                      ))}
                    </ul>
                    <span className="hint">
                      {relanced && !message
                        ? `Relancé (${group.email ?? ''})`
                        : (group.email ?? 'Pas d’e-mail sur la fiche du client')}
                    </span>
                    {message && group.email && (
                      <a
                        className="row gap-1 text-sm underline"
                        href={`mailto:${group.email}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`}
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
