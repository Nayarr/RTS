import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Mail, Plus, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { fetchMailSettings, mailSender, mailSettingsKey, sendMail } from '@/lib/mail';
import { cn } from '@/lib/utils';
import { saveQuoteRequest, type TireLine } from './api';
import { PROFILE_LABELS, lineLabel } from './domain';
import { useCompany, useLastQuoteRequest, useSuppliers, useTireLines, useTireMutation } from './hooks';
import { quoteRequestMailto, quoteRequestMessage, type RequestLine } from './quote-request';

type Line = RequestLine & { id: string };

const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const toLine = (line: TireLine): Line => ({
  id: line.id,
  size: line.size,
  profile: line.profile,
  quantity: Math.max(line.missing_qty, 1),
});

/**
 * Demande de chiffrage (P07) : les tailles sous le seuil sont reprises avec la quantité qui manque
 * (modifiable). Le mail ne donne aucune marque : il part à un ou plusieurs fournisseurs, un envoi
 * par fournisseur, pour comparer.
 */
export function QuoteRequestDialog({ onClose }: { onClose: () => void }) {
  const stock = useTireLines();
  const suppliers = useSuppliers();
  const company = useCompany();
  const last = useLastQuoteRequest();
  const mail = useQuery({ queryKey: mailSettingsKey, queryFn: fetchMailSettings, staleTime: 60_000 });
  const [lines, setLines] = useState<Line[]>(() =>
    (stock.data ?? []).filter((line) => line.status !== 'ok').map(toLine),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState<string[]>([]);
  const [typing, setTyping] = useState<string | null>(null);
  const keys = useRef(new Map<string, string>());

  const withEmail = (suppliers.data ?? []).filter((supplier) => supplier.email);
  const recipients = [
    ...withEmail.filter((supplier) => selected.has(supplier.id)).map((supplier) => supplier.email ?? ''),
    ...extra,
  ];
  const message = useMemo(
    () => quoteRequestMessage(lines, company.data ?? { name: '', address: '' }),
    [lines, company.data],
  );
  const filled = lines.some((line) => line.quantity > 0);
  const others = (stock.data ?? []).filter((line) => !lines.some((item) => item.id === line.id));
  const sender = mail.data ? mailSender('workshop', mail.data) : null;
  const canSend = Boolean(mail.data?.enabled);
  const requestLines = lines
    .filter((line) => line.quantity > 0)
    .map(({ size, profile, quantity }) => ({ size, profile, quantity }));

  const send = useTireMutation(
    async () => {
      // Un envoi par fournisseur (aucun ne voit les autres) ; même clé à un nouvel essai : pas de doublon
      for (const to of recipients) {
        const key = keys.current.get(to) ?? crypto.randomUUID();
        keys.current.set(to, key);
        await sendMail({
          category: 'workshop',
          to,
          subject: message.subject,
          text: message.body,
          attachments: [],
          idempotencyKey: key,
        });
      }
      await saveQuoteRequest({ lines: requestLines, recipients, channel: 'email', ...message });
    },
    () => `Demande envoyée à ${recipients.length} fournisseur${recipients.length > 1 ? 's' : ''}`,
  );
  const record = useTireMutation(
    () => saveQuoteRequest({ lines: requestLines, recipients, channel: 'copy', ...message }),
    null,
  );

  const setQuantity = (id: string, value: string) =>
    setLines((current) =>
      current.map((line) =>
        line.id === id ? { ...line, quantity: Number(value.replace(/\D/g, '').slice(0, 4) || 0) } : line,
      ),
    );
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const addAddress = () => {
    const address = (typing ?? '').trim();
    if (!VALID_EMAIL.test(address)) return;
    if (!extra.includes(address)) setExtra([...extra, address]);
    setTyping(null);
  };
  const copy = async () => {
    await navigator.clipboard.writeText(`${message.subject}\n\n${message.body}`);
    toast.success('Texte de la demande copié');
  };

  const lastRecipients = last.data?.recipients ?? [];
  const sendLabel = `Envoyer ${recipients.length > 1 ? `aux ${recipients.length} fournisseurs` : 'au fournisseur'}`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[94dvh] gap-0 overflow-hidden p-0! sm:max-w-[1040px]"
      >
        <div className="flex max-h-[94dvh] min-h-0 flex-col">
          <div className="row items-start gap-4 px-6 pt-5 pb-4 max-sm:px-4">
            <div className="col min-w-0 flex-1 gap-1">
              <DialogTitle className="text-lg font-semibold">Demander un chiffrage</DialogTitle>
              <DialogDescription className="text-[13.5px]">
                Les tailles sous le seuil sont reprises avec la quantité qui manque. Le mail ne donne aucune
                marque : il peut partir à n’importe quel fournisseur, ou à plusieurs pour comparer.
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" aria-label="Fermer">
                <X />
              </Button>
            </DialogClose>
          </div>

          <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 pb-5 max-sm:px-4 lg:grid-cols-[440px_minmax(0,1fr)]">
            <div className="col gap-4">
              <div className="col gap-2">
                <span className="text-[13.5px] font-semibold">Fournisseurs</span>
                <div className="row flex-wrap gap-2" role="group" aria-label="Fournisseurs">
                  {withEmail.map((supplier) => (
                    <button
                      key={supplier.id}
                      type="button"
                      aria-pressed={selected.has(supplier.id)}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-[13.5px] font-medium',
                        selected.has(supplier.id) && 'border-primary bg-primary/10 text-primary',
                      )}
                      onClick={() => toggle(supplier.id)}
                    >
                      {supplier.name}
                    </button>
                  ))}
                  {extra.map((address) => (
                    <span
                      key={address}
                      className="row items-center gap-1 rounded-lg border border-primary px-3 py-1.5 text-[13.5px] text-primary"
                    >
                      {address}
                      <button
                        type="button"
                        aria-label={`Retirer ${address}`}
                        onClick={() => setExtra(extra.filter((item) => item !== address))}
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  ))}
                  {typing === null ? (
                    <button
                      type="button"
                      className="rounded-lg border px-3 py-1.5 text-[13.5px] font-medium text-primary"
                      onClick={() => setTyping('')}
                    >
                      + Autre adresse
                    </button>
                  ) : (
                    <form
                      className="row gap-1"
                      onSubmit={(event) => {
                        event.preventDefault();
                        addAddress();
                      }}
                    >
                      <Input
                        aria-label="Autre adresse"
                        type="email"
                        autoFocus
                        className="h-8 w-[220px]"
                        placeholder="pneus@fournisseur.fr"
                        value={typing}
                        onChange={(event) => setTyping(event.target.value)}
                      />
                      <Button type="submit" size="sm" variant="outline">
                        Ajouter
                      </Button>
                    </form>
                  )}
                </div>
                {suppliers.data && withEmail.length < suppliers.data.length && (
                  <span className="hint">Fournisseurs sans e-mail : renseigne-le dans « Fournisseurs ».</span>
                )}
              </div>

              <div className="card overflow-hidden p-0!">
                <table className="tbl" aria-label="Pneus demandés">
                  <thead>
                    <tr>
                      <th>Taille</th>
                      <th>Profil</th>
                      <th>Quantité</th>
                      <th className="w-[44px]">
                        <span className="sr-only">Retirer</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.id} aria-label={lineLabel(line)}>
                        <td className="num">{line.size}</td>
                        <td>{PROFILE_LABELS[line.profile]}</td>
                        <td>
                          <label className="row inline-flex h-8 w-[92px] items-center gap-1 rounded-md border bg-card px-2">
                            <input
                              aria-label={`Quantité ${lineLabel(line)}`}
                              className="num w-8 bg-transparent text-[13.5px] font-semibold outline-none"
                              inputMode="numeric"
                              value={line.quantity}
                              onChange={(event) => setQuantity(line.id, event.target.value)}
                            />
                            <span className="muted text-xs">pneus</span>
                          </label>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="ibtn sm ghost"
                            aria-label={`Retirer ${lineLabel(line)}`}
                            onClick={() => setLines(lines.filter((item) => item.id !== line.id))}
                          >
                            <Trash2 className="i s" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {others.length > 0 && (
                  <div className="row items-center gap-2 border-t px-4 py-2.5">
                    <Plus className="size-4 text-primary" />
                    <select
                      className="inp h-8 flex-1"
                      aria-label="Ajouter une taille"
                      value=""
                      onChange={(event) => {
                        const line = others.find((item) => item.id === event.target.value);
                        if (line) setLines([...lines, toLine(line)]);
                      }}
                    >
                      <option value="">Ajouter une taille…</option>
                      {others.map((line) => (
                        <option key={line.id} value={line.id}>
                          {lineLabel(line)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <p className="hint">
                Quantité proposée : de quoi revenir au seuil mini, plus les pneus réservés sur les devis et OR
                en cours. Modifiable.
              </p>
            </div>

            <section className="col gap-2" aria-label="Aperçu du mail">
              <span className="text-[13.5px] font-semibold">Aperçu du mail</span>
              <div className="col gap-3 rounded-xl border bg-muted/60 p-4 text-[13.5px]">
                <dl className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-b pb-3">
                  <dt className="muted">À</dt>
                  <dd>
                    {recipients.length ? (
                      recipients.join(', ')
                    ) : (
                      <span className="muted">Choisis un fournisseur</span>
                    )}
                    {recipients.length > 1 && <span className="muted"> (envoi séparé)</span>}
                  </dd>
                  {sender && (
                    <>
                      <dt className="muted">Depuis</dt>
                      <dd>{sender}</dd>
                    </>
                  )}
                  <dt className="muted">Objet</dt>
                  <dd>{message.subject}</dd>
                </dl>
                <p className="whitespace-pre-line">{message.body}</p>
              </div>
            </section>
          </div>

          <div className="row flex-wrap items-center gap-3 border-t px-6 py-4 max-sm:px-4">
            <span className="hint min-w-0 flex-1">
              La demande est gardée dans l’historique du stock
              {last.data
                ? ` (dernière : le ${DAY.format(new Date(last.data.sent_at))}${lastRecipients.length ? `, à ${lastRecipients.join(', ')}` : ''}).`
                : '.'}
            </span>
            <Button variant="outline" disabled={!filled} onClick={() => void copy()}>
              <Copy /> Copier le texte
            </Button>
            {canSend ? (
              <Button
                disabled={!filled || recipients.length === 0 || send.isPending}
                onClick={() => send.mutate(undefined, { onSuccess: onClose })}
              >
                <Send /> {sendLabel}
              </Button>
            ) : !filled || recipients.length === 0 ? (
              <Button disabled>
                <Mail /> Ouvrir la messagerie
              </Button>
            ) : (
              <Button asChild>
                <a
                  href={quoteRequestMailto(recipients, message.subject, message.body)}
                  onClick={() => record.mutate(undefined, { onSuccess: onClose })}
                >
                  <Mail /> Ouvrir la messagerie
                </a>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
