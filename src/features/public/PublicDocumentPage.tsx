import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { CheckCircle2, XCircle } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SignaturePad } from '@/components/SignaturePad';
import { useSignaturePad } from '@/components/use-signature-pad';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/features/repair-orders/constants';
import { formatEuro, formatQuantity } from '@/lib/numbers';
import { fetchPublicDocument, respondToQuote, type PublicQuote, type PublicQuoteLine } from './api';

function LinesTable({ lines, title }: { lines: PublicQuoteLine[]; title: string }) {
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

function QuoteDocument({ quote, token }: { quote: PublicQuote; token: string }) {
  const { company } = quote;
  const done = quote.lines.filter((line) => line.section === 'done');
  const planned = quote.lines.filter((line) => line.section === 'planned');

  return (
    <article className="rounded-lg bg-white p-5 text-neutral-900 shadow-sm sm:p-8">
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
        <div className="text-right">
          <h1 className="text-3xl font-extrabold text-[#137017]">DEVIS</h1>
          <p className="text-neutral-600">
            {quote.number}
            {quote.issued_at && ` — ${formatDate(quote.issued_at)}`}
          </p>
          {quote.valid_until && (
            <p className="text-xs text-neutral-600">Valable jusqu’au {formatDate(quote.valid_until)}</p>
          )}
        </div>
      </header>

      <p>
        <strong>Client :</strong> {quote.client_name ?? '—'}
        <br />
        <strong>Véhicule :</strong> {quote.vehicle_plate ?? '—'}
      </p>

      <LinesTable lines={done} title={done.length ? 'Travaux déjà effectués' : ''} />
      <LinesTable lines={planned} title={done.length ? 'Travaux à prévoir' : ''} />

      <dl className="mt-5 ml-auto max-w-xs space-y-1 text-right" aria-label="Totaux">
        <div className="flex justify-between gap-4">
          <dt>Total HT</dt>
          <dd className="font-semibold tabular-nums">{formatEuro(quote.totals.total_ht)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>TVA</dt>
          <dd className="tabular-nums">{formatEuro(quote.totals.total_vat)}</dd>
        </div>
        <div className="flex justify-between gap-4 text-lg">
          <dt>Total TTC</dt>
          <dd className="font-bold tabular-nums">{formatEuro(quote.totals.total_ttc)}</dd>
        </div>
      </dl>

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
      {quote.status === 'sent' && <ResponseForm token={token} />}
      {quote.status !== 'sent' && quote.status !== 'accepted' && quote.status !== 'refused' && (
        <p className="mt-6 rounded-md bg-neutral-100 p-4">
          Ce devis est en cours de modification par l’atelier. Contactez-le pour recevoir la dernière version.
        </p>
      )}
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

  let content;
  if (document.isPending) content = <p>Chargement du devis…</p>;
  else if (document.isError) content = <p>Impossible de charger le devis. Réessayez dans un instant.</p>;
  else if (document.data?.type !== 'quote') content = <p>Ce devis est introuvable ou le lien a expiré.</p>;
  else content = <QuoteDocument quote={document.data as PublicQuote} token={token} />;

  return (
    <div className="min-h-dvh bg-[#eef0ee] px-3 py-5">
      <main className="mx-auto max-w-[820px]">{content}</main>
    </div>
  );
}
