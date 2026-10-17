import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { FileSignature, FileText, PenLine, Printer } from 'lucide-react';
import { initials } from '@/app/nav';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SignaturePad } from '@/components/SignaturePad';
import { useSignaturePad } from '@/components/use-signature-pad';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DEADLINE_BADGE_CLASS,
  DEADLINE_TONE_CLASS,
  deadlineStatus,
  tailgateDueEnd,
} from '@/features/customers/domain';
import { monthLabel } from '@/lib/month';
import { PAYMENT_STATUS_META } from '@/features/invoices/domain';
import { formatDate, formatDateTime } from '@/features/repair-orders/constants';
import { todayIso } from '@/features/repair-orders/schemas';
import { TaskList } from '@/features/repair-orders/TaskList';
import { formatEuro, formatQuantity } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import {
  companyAddress,
  fetchPublicDocument,
  respondToQuote,
  type PublicInvoice,
  type PublicPortal,
  type PublicQuote,
  type PublicQuoteLine,
  type PublicSignature,
} from './api';
import { DocumentHead, Notice, OnlineSignatureForm, PublicHeader } from './document-ui';
import { RentalDocument } from './RentalDocument';

type TableLine = Pick<
  PublicQuoteLine,
  'description' | 'unit_price' | 'quantity' | 'discount_percent' | 'net_ht'
> & {
  line_type: string;
};

const PAYMENT_BADGE: Record<PublicPortal['invoices'][number]['payment_status'], string> = {
  paid: 's-ok',
  pending: 's-warn',
  partial: 's-blue',
  overdue: 's-bad',
};

function LinesTable({ lines, title }: { lines: TableLine[]; title: string }) {
  if (lines.length === 0) return null;
  return (
    <>
      {title && (
        <div className="border-t px-5 pt-4 pb-1 first:border-t-0 sm:px-7">
          <h2 className="h3">{title}</h2>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="tbl dense">
          <thead>
            <tr>
              <th className="pl-5! sm:pl-7!">Prestation</th>
              <th className="r">Qté</th>
              <th className="r">Prix unit. HT</th>
              <th className="r pr-5! sm:pr-7!">Net HT</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) =>
              line.line_type === 'text' ? (
                <tr key={index}>
                  <td
                    colSpan={4}
                    className="pr-5! pl-5! whitespace-pre-wrap text-muted-foreground italic sm:pr-7! sm:pl-7!"
                  >
                    {line.description}
                  </td>
                </tr>
              ) : (
                <tr key={index} className="align-top">
                  <td className="pl-5! whitespace-pre-wrap sm:pl-7!">
                    {line.description}
                    {line.discount_percent > 0 && (
                      <em className="text-muted-foreground">
                        {' '}
                        (remise {formatQuantity(line.discount_percent)} %)
                      </em>
                    )}
                  </td>
                  <td className="r num">{formatQuantity(line.quantity)}</td>
                  <td className="r num whitespace-nowrap">{formatEuro(line.unit_price ?? 0)}</td>
                  <td className="r num b pr-5! whitespace-nowrap sm:pr-7!">{formatEuro(line.net_ht)}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Bon pour accord : nom + signature, ou refus. */
function ResponseForm({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const pad = useSignaturePad();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmRefusal, setConfirmRefusal] = useState(false);

  const respond = useMutation({
    mutationFn: (accept: boolean) =>
      respondToQuote({ token, accept, signer_name: name.trim(), signature: accept ? pad.toDataUrl() : null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['public-document', token] }),
    onError: (err) =>
      setError(
        err instanceof Error ? err.message : 'Impossible d’enregistrer votre réponse. Contactez l’atelier.',
      ),
  });

  const accept = () => {
    setError(null);
    if (!name.trim()) return setError('Merci d’indiquer votre nom.');
    if (pad.isEmpty) return setError('Merci de signer le devis dans le cadre ci-dessous.');
    respond.mutate(true);
  };

  return (
    <section data-slot="card" className="card print:hidden" aria-labelledby="response-title">
      <div className="card-h flex-wrap">
        <h2 className="h2 text-[22px]!" id="response-title">
          Bon pour accord
        </h2>
        <span className="hint">L’atelier sera prévenu de votre réponse.</span>
      </div>
      <div className="card-b col gap-4 sm:px-6! sm:py-[22px]!">
        <div className="field max-w-[400px]">
          <Label htmlFor="signer-name">Votre nom</Label>
          <Input
            id="signer-name"
            autoComplete="name"
            className="h-12 text-[15px]!"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="field">
          <span className="lbl">Signez dans le cadre ci-dessous :</span>
          <div className="relative">
            <SignaturePad pad={pad} label="Signature du client" showClear={false} />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="absolute top-2.5 right-2.5"
              onClick={pad.clear}
              disabled={pad.isEmpty}
            >
              Effacer
            </Button>
          </div>
        </div>
        {error && (
          <p role="alert" className="err">
            {error}
          </p>
        )}
        <div className="row between flex-wrap gap-2">
          <Button
            size="lg"
            variant="outline"
            className="text-destructive"
            disabled={respond.isPending}
            onClick={() => setConfirmRefusal(true)}
          >
            Refuser le devis
          </Button>
          <Button size="lg" disabled={respond.isPending} onClick={accept}>
            <PenLine /> Accepter et signer
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmRefusal}
        onOpenChange={setConfirmRefusal}
        title="Confirmer le refus du devis ?"
        description="L’atelier sera prévenu de votre réponse."
        confirmLabel="Refuser le devis"
        destructive
        pending={respond.isPending}
        onConfirm={() => {
          setConfirmRefusal(false);
          respond.mutate(false);
        }}
      />
    </section>
  );
}

function DocumentTotals({ totals }: { totals: { total_ht: number; total_vat: number; total_ttc: number } }) {
  return (
    <div className="flex justify-end border-t px-5 py-[18px] sm:px-7">
      <dl className="dl grid-cols-[140px_130px]! items-baseline text-right" aria-label="Totaux">
        <dt>Total HT</dt>
        <dd className="num">{formatEuro(totals.total_ht)}</dd>
        <dt>TVA</dt>
        <dd className="num">{formatEuro(totals.total_vat)}</dd>
        <dt className="b text-base text-foreground!">Total TTC</dt>
        <dd className="num font-display text-[26px] font-bold">{formatEuro(totals.total_ttc)}</dd>
      </dl>
    </div>
  );
}

const QUOTE_BADGE: Record<string, { label: string; tone: string }> = {
  sent: { label: 'Devis à valider', tone: 's-blue' },
  accepted: { label: 'Devis accepté', tone: 's-ok' },
  refused: { label: 'Devis refusé', tone: 's-bad' },
};

function QuoteDocument({ quote, token }: { quote: PublicQuote; token: string }) {
  const { company } = quote;
  const done = quote.lines.filter((line) => line.section === 'done');
  const planned = quote.lines.filter((line) => line.section === 'planned');
  // Même règle que la base : plus de signature en ligne après la date de validité.
  const expired = quote.valid_until !== null && quote.valid_until < todayIso();
  const badge = QUOTE_BADGE[quote.status];

  return (
    <>
      <PublicHeader company={company} subtitle={companyAddress(company)}>
        {badge && <span className={cn('badge lg', badge.tone)}>{badge.label}</span>}
      </PublicHeader>
      <main className="col mx-auto w-full max-w-[880px] gap-5 px-3 py-5 sm:py-8">
        <article data-slot="card" className="card overflow-hidden">
          <DocumentHead
            title="DEVIS"
            meta={
              <>
                N° {quote.number}
                {quote.issued_at && ` · ${formatDate(quote.issued_at)}`}
                {quote.valid_until && ` · valable jusqu’au ${formatDate(quote.valid_until)}`}
              </>
            }
            aside={
              <>
                <span>
                  <span className="muted">Client :</span> <b>{quote.client_name ?? '-'}</b>
                </span>
                <span>
                  <span className="muted">Véhicule :</span>{' '}
                  <b className="plate">{quote.vehicle_plate ?? '-'}</b>
                </span>
              </>
            }
          />
          <LinesTable lines={done} title={done.length ? 'Travaux déjà effectués' : ''} />
          <LinesTable lines={planned} title={done.length ? 'Travaux à prévoir' : ''} />
          <DocumentTotals totals={quote.totals} />
        </article>

        {quote.status === 'accepted' && (
          <Notice tone="s-ok">
            Devis accepté{quote.accepted_by_name && ` par ${quote.accepted_by_name}`}. Merci, nous vous
            recontactons pour planifier l’intervention.
          </Notice>
        )}
        {quote.status === 'refused' && <Notice tone="s-bad">Devis refusé.</Notice>}
        {quote.status === 'sent' && !expired && <ResponseForm token={token} />}
        {quote.status === 'sent' && expired && (
          <Notice tone="s-grey">
            Ce devis a expiré le {formatDate(quote.valid_until ?? '')} : contactez l’atelier pour recevoir une
            nouvelle proposition.
          </Notice>
        )}
        {quote.status !== 'sent' && quote.status !== 'accepted' && quote.status !== 'refused' && (
          <Notice tone="s-grey">
            Ce devis est en cours de modification par l’atelier. Contactez-le pour recevoir la dernière
            version.
          </Notice>
        )}
      </main>
    </>
  );
}

/** Facture consultée en ligne : imprimable ou enregistrable en PDF depuis le navigateur. */
function InvoiceDocument({ invoice }: { invoice: PublicInvoice }) {
  const balance = invoice.balance_due ?? 0;
  const { company } = invoice;
  return (
    <>
      <PublicHeader company={company} subtitle={companyAddress(company)}>
        {balance > 0.01 ? (
          <span className="badge lg s-blue">À régler</span>
        ) : (
          <span className="badge lg s-ok">Réglée</span>
        )}
      </PublicHeader>
      <main className="col mx-auto w-full max-w-[880px] gap-5 px-3 py-5 sm:py-8 print:p-0">
        <article data-slot="card" className="card overflow-hidden print:border-0 print:shadow-none">
          <DocumentHead
            title="FACTURE"
            meta={
              <>
                N° {invoice.number} · {formatDate(invoice.issued_at)} · échéance le{' '}
                {formatDate(invoice.due_date)}
              </>
            }
            aside={
              <>
                <b>{invoice.client_name}</b>
                {invoice.client_address && (
                  <span className="text-[13px] whitespace-pre-line text-muted-foreground">
                    {invoice.client_address}
                  </span>
                )}
              </>
            }
          />
          <div className="row wrap gap-x-6 gap-y-1 border-b px-5 py-3.5 text-[13.5px] sm:px-7">
            <span>
              <span className="muted">Véhicule :</span> <b>{invoice.vehicle_label ?? '-'}</b>
              {invoice.mileage !== null && ` · ${invoice.mileage.toLocaleString('fr-FR')} km`}
            </span>
            {invoice.service_date && (
              <span>
                <span className="muted">Date de la prestation :</span>{' '}
                <b>{formatDate(invoice.service_date)}</b>
              </span>
            )}
          </div>
          <LinesTable lines={invoice.lines} title="" />
          <DocumentTotals totals={invoice.totals} />
          {invoice.legal_mentions && invoice.legal_mentions.length > 0 && (
            <div className="col gap-1 border-t px-5 py-3.5 text-xs text-muted-foreground sm:px-7">
              {invoice.legal_mentions.map((mention) => (
                <p key={mention}>{mention}</p>
              ))}
            </div>
          )}
        </article>

        {balance > 0.01 ? (
          <Notice tone="s-blue">
            Facture à régler avant le {formatDate(invoice.due_date)}
            {balance < invoice.totals.total_ttc - 0.01 && `, reste dû : ${formatEuro(balance)}`}. Merci de
            votre confiance.
          </Notice>
        ) : (
          <Notice tone="s-ok">Facture réglée. Merci de votre confiance.</Notice>
        )}
        <div className="row justify-end print:hidden">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer /> Imprimer / enregistrer en PDF
          </Button>
        </div>
      </main>
    </>
  );
}

function Deadline({ label, date, month = false }: { label: string; date: string | null; month?: boolean }) {
  // Hayon : mois seulement, valable jusqu'à la fin du mois
  const status = deadlineStatus(month ? tailgateDueEnd(date) : date, todayIso());
  const text = `${label} : ${date ? (month ? monthLabel(date) : formatDate(date)) : '-'}`;
  if (!date || !status || status.tone === 'ok') {
    return <span className={cn('hint', status && DEADLINE_TONE_CLASS[status.tone])}>{text}</span>;
  }
  return (
    <span className={cn('badge h-[22px]! text-[11.5px]!', DEADLINE_BADGE_CLASS[status.tone])}>{text}</span>
  );
}

/** Espace client : véhicules, devis à signer, factures (toujours à jour, sans compte). */
function PortalDocument({ portal }: { portal: PublicPortal }) {
  const { company } = portal;
  return (
    <>
      <PublicHeader company={company} subtitle="Espace client" wide>
        <span className="row min-w-0 gap-2">
          <span className="av shrink-0 bg-accent! text-accent-foreground!">
            {initials(portal.client_name)}
          </span>
          <b className="truncate">{portal.client_name}</b>
        </span>
      </PublicHeader>
      <main className="col mx-auto w-full max-w-[1040px] gap-5 px-3 py-5 sm:py-7">
        <div className="col gap-1">
          <h1 className="title xl">Bonjour</h1>
          <p className="sub">
            Vos véhicules, vos devis à signer et vos factures, à jour en permanence (le{' '}
            {formatDateTime(portal.generated_at)}).
          </p>
        </div>

        {portal.quotes.map((quote) => (
          <Link key={quote.token} to={`/d/${quote.token}`} className="alert s-blue px-[18px]! py-4!">
            <FileSignature className="i shrink-0" />
            <span className="grow">
              <b>Devis {quote.number} à valider</b>
              {quote.vehicle_plate && <span className="muted"> · {quote.vehicle_plate}</span>}
            </span>
            <span className="btn sm pri">Voir et signer</span>
          </Link>
        ))}

        <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.4fr]">
          <section data-slot="card" className="card" aria-labelledby="portal-vehicles">
            <div className="card-h">
              <h2 className="h2" id="portal-vehicles">
                Vos véhicules
              </h2>
              <span className="cnt">{portal.vehicles.length}</span>
            </div>
            {portal.vehicles.length === 0 ? (
              <p className="card-b hint">Aucun véhicule.</p>
            ) : (
              <ul>
                {portal.vehicles.map((vehicle) => (
                  <li key={vehicle.plate} className="li flex-wrap" aria-label={vehicle.plate}>
                    <span className="col gap-0.5">
                      <b className="plate">{vehicle.plate}</b>
                      {vehicle.in_workshop ? (
                        <b className="text-[13px] text-primary">
                          À l’atelier · {vehicle.status_label}
                          {vehicle.since && ` depuis le ${formatDate(vehicle.since)}`}
                        </b>
                      ) : (
                        <span className="hint">{vehicle.status_label}</span>
                      )}
                    </span>
                    <span className="col items-end gap-1">
                      <Deadline label="Contrôle technique" date={vehicle.ct_due_date} />
                      <Deadline label="Contrôle hayon" date={vehicle.tailgate_due_date} month />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section data-slot="card" className="card tbl-wrap" aria-labelledby="portal-invoices">
            <div className="card-h">
              <h2 className="h2" id="portal-invoices">
                Vos factures
              </h2>
            </div>
            {portal.invoices.length === 0 ? (
              <p className="card-b hint">Aucune facture.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl dense">
                  <thead>
                    <tr>
                      <th>Facture</th>
                      <th>Date</th>
                      <th>Véhicule</th>
                      <th className="r">TTC</th>
                      <th className="r">Reste dû</th>
                      <th>Statut</th>
                      <th aria-label="Ouvrir" />
                    </tr>
                  </thead>
                  <tbody>
                    {portal.invoices.map((invoice) => (
                      <tr key={invoice.token}>
                        <td>
                          <Link to={`/d/${invoice.token}`} className="b ul">
                            {invoice.number}
                          </Link>
                        </td>
                        <td className="num">{formatDate(invoice.issued_at)}</td>
                        <td className="plate text-sm!">{invoice.vehicle_label}</td>
                        <td className="r num">{formatEuro(invoice.total_ttc)}</td>
                        <td className={cn('r num b', invoice.payment_status === 'overdue' && 'down')}>
                          {formatEuro(invoice.balance_due)}
                        </td>
                        <td>
                          <span className={cn('badge', PAYMENT_BADGE[invoice.payment_status])}>
                            {PAYMENT_STATUS_META[invoice.payment_status].label}
                          </span>
                        </td>
                        <td>
                          <Link
                            to={`/d/${invoice.token}`}
                            className="ibtn sm"
                            tabIndex={-1}
                            aria-label={`Ouvrir la facture ${invoice.number}`}
                          >
                            <FileText className="i s" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <p className="hint text-center">
          Une question ? Contactez l’atelier {company.legal_name} · {company.address_line},{' '}
          {company.postal_code} {company.city}
          {company.phone && ` · ${company.phone}`}
          {company.email && ` · ${company.email}`}
        </p>
      </main>
    </>
  );
}

function SignatureDocument({ request, token }: { request: PublicSignature; token: string }) {
  const { company } = request;
  return (
    <>
      <PublicHeader company={company} subtitle={companyAddress(company)}>
        {request.status === 'signed' && <span className="badge lg s-ok">Signé</span>}
      </PublicHeader>
      <main className="col mx-auto w-full max-w-[880px] gap-5 px-3 py-5 sm:py-8">
        <article data-slot="card" className="card overflow-hidden">
          <DocumentHead
            title="ORDRE DE RÉPARATION"
            meta={
              <>
                N° {request.number}
                {request.planned_date && ` · intervention prévue le ${formatDate(request.planned_date)}`}
              </>
            }
            aside={
              <>
                <span>
                  <span className="muted">Client :</span> <b>{request.client_name ?? '-'}</b>
                </span>
                <span>
                  <span className="muted">Véhicule :</span>{' '}
                  <b className="plate">{request.vehicle_plate ?? '-'}</b>
                </span>
              </>
            }
          />
          <div className="col gap-2 px-5 py-5 sm:px-7">
            <span className="overline">Travaux demandés</span>
            <TaskList text={request.requested_work} className="text-[15px] leading-normal" />
          </div>
        </article>

        {request.status === 'pending' && (
          <>
            <Notice tone="s-blue">
              En signant, vous autorisez l’atelier à réaliser les travaux ci-dessus. Lien valable jusqu’au{' '}
              {formatDate(request.expires_at)}.
            </Notice>
            <OnlineSignatureForm
              token={token}
              title="Accord avant intervention"
              submitLabel="Signer l’ordre de réparation"
            />
          </>
        )}
        {request.status === 'signed' && (
          <Notice tone="s-ok">
            Signé{request.signer_name && ` par ${request.signer_name}`}
            {request.signed_at && ` le ${formatDate(request.signed_at)}`}. Merci, l’atelier a bien reçu votre
            accord.
          </Notice>
        )}
        {(request.status === 'expired' || request.status === 'cancelled') && (
          <Notice tone="s-grey">
            Ce lien de signature n’est plus valable : contactez l’atelier pour en recevoir un nouveau.
          </Notice>
        )}
      </main>
    </>
  );
}

/** Page publique ouverte avec le lien reçu par e-mail ou SMS (sans compte). */
export function PublicDocumentPage() {
  const { token = '' } = useParams();
  const document = useQuery({
    queryKey: ['public-document', token],
    queryFn: () => fetchPublicDocument(token),
  });

  const data = document.data;
  const message = (text: string) => <p className="empty mx-auto mt-16 max-w-md">{text}</p>;
  let content;
  if (document.isPending) content = message('Chargement du document…');
  else if (document.isError)
    // Réseau coupé, mise en ligne en cours… : le lien reste bon, on propose de réessayer.
    content = (
      <div className="col mx-auto mt-16 max-w-md items-center gap-3 px-4 text-center">
        <p className="empty">Impossible de charger le document pour le moment.</p>
        <Button onClick={() => void document.refetch()} disabled={document.isFetching}>
          Réessayer
        </Button>
      </div>
    );
  else if (data?.type === 'quote') content = <QuoteDocument quote={data} token={token} />;
  else if (data?.type === 'invoice') content = <InvoiceDocument invoice={data} />;
  else if (data?.type === 'portal') content = <PortalDocument portal={data} />;
  else if (data?.type === 'signature') content = <SignatureDocument request={data} token={token} />;
  else if (data?.type === 'rental' || data?.type === 'rental_signature')
    content = <RentalDocument contract={data} token={token} />;
  else content = message('Ce document est introuvable ou le lien a expiré.');

  return <div className="min-h-dvh bg-background print:bg-white">{content}</div>;
}
