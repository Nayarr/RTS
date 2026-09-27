import { Link, useParams } from 'react-router';
import { ArrowLeft, Lock } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StoredImage } from '@/features/files/StoredImage';
import { formatDate, VEHICLE_TYPES } from '@/features/repair-orders/constants';
import { useSettings } from '@/features/settings/hooks';
import { formatEuro } from '@/lib/numbers';
import type { QuoteLine } from './api';
import { computeTotals, isQuoteLocked } from './domain';
import { AddLineButtons } from './editor/AddLineButtons';
import { QuoteActions } from './editor/QuoteActions';
import { QuoteLineRow } from './editor/QuoteLineRow';
import { useQuote } from './hooks';
import { QuoteStatusBadge } from './QuoteStatusBadge';

function LinesSection({
  title,
  lines,
  locked,
  empty,
}: {
  title: string;
  lines: QuoteLine[];
  locked: boolean;
  empty: string;
}) {
  return (
    <section aria-label={title} className="space-y-1">
      <h3 className="text-sm font-bold tracking-wide text-primary uppercase">{title}</h3>
      <div className="hidden grid-cols-[1fr_6.5rem_4.5rem_4.5rem_6.5rem_2.25rem] gap-2 border-b pb-1 text-xs text-muted-foreground md:grid">
        <span>Prestation / pièce</span>
        <span className="text-right">Prix unit. HT</span>
        <span className="text-right">Qté</span>
        <span className="text-right">Remise %</span>
        <span className="text-right">Net HT</span>
      </div>
      {lines.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul>
          {lines.map((line) => (
            <QuoteLineRow key={line.id} line={line} locked={locked} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Édition d'un devis : lignes chiffrées, totaux, PDF, réponse du client, création de l'OR. */
export function QuotePage() {
  const { id = '' } = useParams();
  const detail = useQuote(id);
  const settings = useSettings();

  if (detail.isPending) return <p className="text-muted-foreground">Chargement…</p>;
  if (detail.isError) return <p className="text-destructive">Impossible de charger ce devis.</p>;
  if (!detail.data) {
    return (
      <div className="space-y-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Devis introuvable</h1>
        <Button asChild>
          <Link to="/devis">Retour aux devis</Link>
        </Button>
      </div>
    );
  }

  const { quote, lines } = detail.data;
  const locked = isQuoteLocked(quote);
  const done = lines.filter((line) => line.section === 'done');
  const planned = lines.filter((line) => line.section === 'planned');
  const totals = computeTotals(lines);
  const hasLines = lines.some((line) => line.line_type !== 'text');

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Button variant="ghost" asChild className="-ml-3">
        <Link to={quote.repair_order_id ? `/or/${quote.repair_order_id}` : '/devis'}>
          <ArrowLeft /> {quote.repair_order_id ? `Retour à l’OR ${quote.repair_order_number ?? ''}` : 'Devis'}
        </Link>
      </Button>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <Card className="min-w-0">
          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-3xl font-bold text-primary">DEVIS</h1>
                <p className="text-muted-foreground">{quote.number ?? 'Numéro attribué à la génération'}</p>
                {quote.valid_until && (
                  <p className="text-sm text-muted-foreground">
                    Valable jusqu’au {formatDate(quote.valid_until)}
                  </p>
                )}
              </div>
              <QuoteStatusBadge status={quote.status} className="px-3 py-1 text-sm" />
            </div>

            <div className="text-base">
              <p>
                <strong>Client :</strong> {quote.client_name ?? '—'}
              </p>
              <p>
                <strong>Véhicule :</strong> {quote.plate ?? '—'} ({VEHICLE_TYPES[quote.vehicle_type]})
              </p>
              {quote.resulting_repair_order_id && (
                <p className="mt-1 text-sm">
                  OR créé :{' '}
                  <Link className="font-medium underline" to={`/or/${quote.resulting_repair_order_id}`}>
                    {quote.resulting_repair_order_number}
                  </Link>
                </p>
              )}
            </div>

            {locked && (
              <Alert>
                <Lock />
                <AlertDescription>
                  {quote.status === 'accepted'
                    ? 'Devis accepté par le client : il ne peut plus être modifié.'
                    : 'Devis rattaché à un OR : il ne peut plus être modifié.'}
                </AlertDescription>
              </Alert>
            )}

            {done.length > 0 && (
              <LinesSection
                title="Travaux déjà effectués"
                lines={done}
                locked={locked}
                empty="Aucun travail effectué."
              />
            )}
            <LinesSection
              title="Travaux à prévoir"
              lines={planned}
              locked={locked}
              empty="Aucune ligne : ajoute une prestation, un forfait ou une pièce."
            />
            {!locked && (
              <AddLineButtons detail={detail.data} vatRate={settings.data?.company.default_vat_rate ?? 20} />
            )}

            <dl className="ml-auto w-full max-w-xs space-y-1 text-right text-sm" aria-label="Totaux">
              <div className="flex justify-between gap-4">
                <dt>Total HT</dt>
                <dd className="font-semibold tabular-nums">{formatEuro(totals.ht)}</dd>
              </div>
              {totals.rates.map(({ rate, amount }) => (
                <div key={rate} className="flex justify-between gap-4">
                  <dt>TVA ({String(rate).replace('.', ',')} %)</dt>
                  <dd className="tabular-nums">{formatEuro(amount)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 border-t pt-1 text-base">
                <dt>Total TTC</dt>
                <dd className="font-bold tabular-nums">{formatEuro(totals.ttc)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <QuoteActions quote={quote} hasLines={hasLines} />
          <Card>
            <CardHeader>
              <CardTitle>
                <h2 className="text-base font-semibold">Suivi</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>Créé le {formatDate(quote.created_at)}</p>
              {quote.sent_at && <p>Envoyé le {formatDate(quote.sent_at)}</p>}
              {quote.accepted_at && (
                <p>
                  Accepté le {formatDate(quote.accepted_at)}
                  {quote.accepted_by_name && ` en ligne par ${quote.accepted_by_name}`}
                </p>
              )}
              {quote.signature_file_id && (
                <StoredImage
                  fileId={quote.signature_file_id}
                  alt="Signature du client"
                  className="h-20 w-48 border bg-white object-contain"
                />
              )}
              {quote.refused_at && <p>Refusé le {formatDate(quote.refused_at)}</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
