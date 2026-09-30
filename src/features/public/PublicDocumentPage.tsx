import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { CheckCircle2, Printer, XCircle } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SignaturePad } from '@/components/SignaturePad';
import { useSignaturePad } from '@/components/use-signature-pad';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DEADLINE_TONE_CLASS, deadlineStatus } from '@/features/customers/domain';
import { PAYMENT_STATUS_META } from '@/features/invoices/domain';
import { formatDate, formatDateTime } from '@/features/repair-orders/constants';
import { todayIso } from '@/features/repair-orders/schemas';
import { formatEuro, formatQuantity } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import {
  fetchPublicDocument,
  respondToQuote,
  type PublicCompany,
  type PublicInvoice,
  type PublicPortal,
  type PublicQuote,
  type PublicQuoteLine,
} from './api';

type TableLine = Pick<
  PublicQuoteLine,
  'description' | 'unit_price' | 'quantity' | 'discount_percent' | 'net_ht'
> & {
  line_type: string;
};

function LinesTable({ lines, title }: { lines: TableLine[]; title: string }) {
  if (lines.length === 0) return null;
  return (
    <section className="space-y-1">
      {title && <h2 className="mt-5 text-sm font-bold tracking-wide text-[#137017] uppercase">{title}</h2>}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#136817] text-left text-white">
              <th className="p-2 font-semibold">Prestation</th>
              <th className="p-2 text-right font-semibold whitespace-nowrap">Prix unit. HT</th>
              <th className="p-2 text-right font-semibold">Qté</th>
              <th className="p-2 text-right font-semibold whitespace-nowrap">Net HT</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) =>
              line.line_type === 'text' ? (
                <tr key={index} className="border-b">
                  <td colSpan={4} className="p-2 whitespace-pre-wrap text-neutral-600 italic">
                    {line.description}
                  </td>
                </tr>
              ) : (
                <tr key={index} className="border-b align-top">
                  <td className="p-2 whitespace-pre-wrap">
                    {line.description}
                    {line.discount_percent > 0 && (
                      <em className="text-neutral-500">
                        {' '}
                        (remise {formatQuantity(line.discount_percent)} %)
                      </em>
                    )}
                  </td>
                  <td className="p-2 text-right whitespace-nowrap tabular-nums">
                    {formatEuro(line.unit_price ?? 0)}
                  </td>
                  <td className="p-2 text-right tabular-nums">{formatQuantity(line.quantity)}</td>
                  <td className="p-2 text-right font-semibold whitespace-nowrap tabular-nums">
                    {formatEuro(line.net_ht)}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
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
    <div className="mt-6 space-y-3 border-t pt-4">
      <h2 className="font-bold">Bon pour accord</h2>
      <div className="space-y-2">
        <Label htmlFor="signer-name">Votre nom</Label>
        <Input
          id="signer-name"
          className="h-11 text-base"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <p className="text-sm text-neutral-600">Signez dans le cadre ci-dessous :</p>
      <SignaturePad pad={pad} label="Signature du client" />
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="lg" className="flex-1" disabled={respond.isPending} onClick={accept}>
          J’accepte ce devis
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={respond.isPending}
          onClick={() => setConfirmRefusal(true)}
        >
          Refuser
        </Button>
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
    </div>
  );
}

function DocumentHeader({
  company,
  title,
  children,
}: {
  company: PublicCompany;
  title: string;
  children: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <img src="/icons/icon-192.png" alt="" className="size-14" />
        <div>
          <p className="text-base font-bold">{company.legal_name}</p>
          <p className="text-xs text-neutral-600">
            {company.address_line}, {company.postal_code} {company.city}
            {company.siret && ` — SIRET ${company.siret}`}
            {company.email && ` — ${company.email}`}
          </p>
        </div>
      </div>
      <div className="ml-auto text-right">
        <h1 className="text-3xl font-extrabold text-[#137017]">{title}</h1>
        {children}
      </div>
    </header>
  );
}

function DocumentTotals({ totals }: { totals: { total_ht: number; total_vat: number; total_ttc: number } }) {
  return (
    <dl className="mt-5 ml-auto max-w-xs space-y-1 text-right" aria-label="Totaux">
      <div className="flex justify-between gap-4">
        <dt>Total HT</dt>
        <dd className="font-semibold tabular-nums">{formatEuro(totals.total_ht)}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt>TVA</dt>
        <dd className="tabular-nums">{formatEuro(totals.total_vat)}</dd>
      </div>
      <div className="flex justify-between gap-4 text-lg">
        <dt>Total TTC</dt>
        <dd className="font-bold tabular-nums">{formatEuro(totals.total_ttc)}</dd>
      </div>
    </dl>
  );
}

function QuoteDocument({ quote, token }: { quote: PublicQuote; token: string }) {
  const { company } = quote;
  const done = quote.lines.filter((line) => line.section === 'done');
  const planned = quote.lines.filter((line) => line.section === 'planned');
  // Même règle que la base : plus de signature en ligne après la date de validité.
  const expired = quote.valid_until !== null && quote.valid_until < todayIso();

  return (
    <article className="rounded-lg bg-white p-5 text-neutral-900 shadow-sm sm:p-8">
      <DocumentHeader company={company} title="DEVIS">
        <p className="text-neutral-600">
          {quote.number}
          {quote.issued_at && ` — ${formatDate(quote.issued_at)}`}
        </p>
        {quote.valid_until && (
          <p className="text-xs text-neutral-600">Valable jusqu’au {formatDate(quote.valid_until)}</p>
        )}
      </DocumentHeader>

      <p>
        <strong>Client :</strong> {quote.client_name ?? '—'}
        <br />
        <strong>Véhicule :</strong> {quote.vehicle_plate ?? '—'}
      </p>

      <LinesTable lines={done} title={done.length ? 'Travaux déjà effectués' : ''} />
      <LinesTable lines={planned} title={done.length ? 'Travaux à prévoir' : ''} />

      <DocumentTotals totals={quote.totals} />

      {quote.status === 'accepted' && (
        <p className="mt-6 flex items-center gap-2 rounded-md bg-[#e3f3e7] p-4 font-bold">
          <CheckCircle2 className="size-5 shrink-0 text-[#2A6B52]" />
          Devis accepté{quote.accepted_by_name && ` par ${quote.accepted_by_name}`}. Merci, nous vous
          recontactons pour planifier l’intervention.
        </p>
      )}
      {quote.status === 'refused' && (
        <p className="mt-6 flex items-center gap-2 rounded-md bg-[#f8e3e1] p-4 font-bold">
          <XCircle className="size-5 shrink-0 text-[#B5453A]" /> Devis refusé.
        </p>
      )}
      {quote.status === 'sent' && !expired && <ResponseForm token={token} />}
      {quote.status === 'sent' && expired && (
        <p className="mt-6 rounded-md bg-neutral-100 p-4">
          Ce devis a expiré le {formatDate(quote.valid_until ?? '')} : contactez l’atelier pour recevoir une
          nouvelle proposition.
        </p>
      )}
      {quote.status !== 'sent' && quote.status !== 'accepted' && quote.status !== 'refused' && (
        <p className="mt-6 rounded-md bg-neutral-100 p-4">
          Ce devis est en cours de modification par l’atelier. Contactez-le pour recevoir la dernière version.
        </p>
      )}
    </article>
  );
}

/** Facture consultée en ligne : imprimable ou enregistrable en PDF depuis le navigateur. */
function InvoiceDocument({ invoice }: { invoice: PublicInvoice }) {
  const balance = invoice.balance_due ?? 0;
  return (
    <article className="rounded-lg bg-white p-5 text-neutral-900 shadow-sm sm:p-8 print:p-0 print:shadow-none">
      <DocumentHeader company={invoice.company} title="FACTURE">
        <p className="text-neutral-600">
          {invoice.number} — {formatDate(invoice.issued_at)}
        </p>
        <p className="text-xs text-neutral-600">Échéance le {formatDate(invoice.due_date)}</p>
      </DocumentHeader>

      <div className="flex flex-wrap justify-between gap-4">
        <p>
          <strong>Véhicule :</strong> {invoice.vehicle_label ?? '—'}
          {invoice.mileage !== null && ` — ${invoice.mileage.toLocaleString('fr-FR')} km`}
          {invoice.service_date && (
            <>
              <br />
              <strong>Date de la prestation :</strong> {formatDate(invoice.service_date)}
            </>
          )}
        </p>
        <div className="min-w-56 rounded-md border p-3">
          <p className="font-bold">{invoice.client_name}</p>
          {invoice.client_address && <p className="text-sm whitespace-pre-line">{invoice.client_address}</p>}
        </div>
      </div>

      <LinesTable lines={invoice.lines} title="" />
      <DocumentTotals totals={invoice.totals} />

      {balance > 0.01 ? (
        <p className="mt-6 rounded-md bg-[#eef3fb] p-4 font-bold">
          Facture à régler avant le {formatDate(invoice.due_date)}
          {balance < invoice.totals.total_ttc - 0.01 && ` — reste dû : ${formatEuro(balance)}`}. Merci de
          votre confiance.
        </p>
      ) : (
        <p className="mt-6 flex items-center gap-2 rounded-md bg-[#e3f3e7] p-4 font-bold">
          <CheckCircle2 className="size-5 shrink-0 text-[#2A6B52]" /> Facture réglée. Merci de votre
          confiance.
        </p>
      )}

      {invoice.legal_mentions && invoice.legal_mentions.length > 0 && (
        <div className="mt-6 space-y-1 border-t pt-3 text-xs text-neutral-600">
          {invoice.legal_mentions.map((mention) => (
            <p key={mention}>{mention}</p>
          ))}
        </div>
      )}
      <Button variant="outline" className="mt-5 print:hidden" onClick={() => window.print()}>
        <Printer /> Imprimer / enregistrer en PDF
      </Button>
    </article>
  );
}

function DeadlineCell({ date }: { date: string | null }) {
  const status = deadlineStatus(date, todayIso());
  if (!date || !status) return <span className="text-neutral-500">—</span>;
  return <span className={cn('font-bold', DEADLINE_TONE_CLASS[status.tone])}>{formatDate(date)}</span>;
}

const PORTAL_SECTION = 'mt-6 mb-2 text-sm font-bold tracking-wide text-[#137017] uppercase';

/** Espace client : véhicules, devis à signer, factures (toujours à jour, sans compte). */
function PortalDocument({ portal }: { portal: PublicPortal }) {
  return (
    <article className="rounded-lg bg-white p-6 shadow-sm sm:p-10 print:shadow-none">
      <DocumentHeader company={portal.company} title="Espace client">
        <p className="font-semibold">{portal.client_name}</p>
        <p className="text-xs text-neutral-500">Mis à jour le {formatDateTime(portal.generated_at)}</p>
      </DocumentHeader>

      <h2 className={PORTAL_SECTION}>Vos véhicules</h2>
      {portal.vehicles.length === 0 ? (
        <p className="text-neutral-500">Aucun véhicule.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-3">Véhicule</th>
                <th className="py-2 pr-3">Statut</th>
                <th className="py-2 pr-3">Contrôle technique</th>
                <th className="py-2">Contrôle hayon</th>
              </tr>
            </thead>
            <tbody>
              {portal.vehicles.map((vehicle) => (
                <tr key={vehicle.plate} className="border-b">
                  <td className="py-2 pr-3 font-bold">{vehicle.plate}</td>
                  <td className="py-2 pr-3">
                    {vehicle.in_workshop ? (
                      <strong className="text-[#137017]">
                        À l’atelier — {vehicle.status_label}
                        {vehicle.since && ` depuis le ${formatDate(vehicle.since)}`}
                      </strong>
                    ) : (
                      <span className="text-neutral-500">{vehicle.status_label}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <DeadlineCell date={vehicle.ct_due_date} />
                  </td>
                  <td className="py-2">
                    <DeadlineCell date={vehicle.tailgate_due_date} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {portal.quotes.length > 0 && (
        <>
          <h2 className={PORTAL_SECTION}>Devis à valider</h2>
          <ul className="space-y-1">
            {portal.quotes.map((quote) => (
              <li key={quote.token}>
                <Link to={`/d/${quote.token}`} className="font-semibold text-[#137017] underline">
                  Devis {quote.number}
                  {quote.vehicle_plate && ` — ${quote.vehicle_plate}`}
                </Link>{' '}
                → à consulter et signer
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className={PORTAL_SECTION}>Vos factures</h2>
      {portal.invoices.length === 0 ? (
        <p className="text-neutral-500">Aucune facture.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-3">Facture</th>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Véhicule</th>
                <th className="py-2 pr-3 text-right">TTC</th>
                <th className="py-2 pr-3 text-right">Reste dû</th>
                <th className="py-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {portal.invoices.map((invoice) => (
                <tr key={invoice.token} className="border-b">
                  <td className="py-2 pr-3">
                    <Link to={`/d/${invoice.token}`} className="font-semibold text-[#137017] underline">
                      {invoice.number}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">{formatDate(invoice.issued_at)}</td>
                  <td className="py-2 pr-3">{invoice.vehicle_label}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatEuro(invoice.total_ttc)}</td>
                  <td className="py-2 pr-3 text-right font-bold tabular-nums">
                    {formatEuro(invoice.balance_due)}
                  </td>
                  <td className="py-2" style={{ color: PAYMENT_STATUS_META[invoice.payment_status].color }}>
                    {PAYMENT_STATUS_META[invoice.payment_status].label}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-xs text-neutral-500">
        Une question ? Contactez l’atelier {portal.company.legal_name} — {portal.company.address_line},{' '}
        {portal.company.postal_code} {portal.company.city}
        {portal.company.email && ` — ${portal.company.email}`}
        {portal.company.phone && ` — ${portal.company.phone}`}
      </p>
    </article>
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
  let content;
  if (document.isPending) content = <p>Chargement du document…</p>;
  else if (document.isError) content = <p>Impossible de charger le document. Réessayez dans un instant.</p>;
  else if (data?.type === 'quote') content = <QuoteDocument quote={data} token={token} />;
  else if (data?.type === 'invoice') content = <InvoiceDocument invoice={data} />;
  else if (data?.type === 'portal') content = <PortalDocument portal={data} />;
  else content = <p>Ce document est introuvable ou le lien a expiré.</p>;

  return (
    <div className="min-h-dvh bg-[#eef0ee] px-3 py-5 print:bg-white print:p-0">
      <main className="mx-auto max-w-[820px]">{content}</main>
    </div>
  );
}
