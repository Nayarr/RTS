import { Link, useParams } from 'react-router';
import { Lock, Mail, Wrench } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { StoredImage } from '@/features/files/StoredImage';
import { formatDate, VEHICLE_TYPES } from '@/features/repair-orders/constants';
import { useSettings } from '@/features/settings/hooks';
import { AddLineButtons } from '@/features/documents/AddLineButtons';
import { LineColumns, LineRow, TotalsList, type LinePatch } from '@/features/documents/LineRow';
import { addQuoteLine, deleteQuoteLine, updateQuoteLine, type NewQuoteLine, type QuoteLine } from './api';
import { PreQuoteWorkCard } from '@/features/repair-orders/PreQuoteWorkCard';
import { offeredTotal } from '@/features/documents/lines';
import { computeTotals, isQuoteLocked, nextPosition } from './domain';
import { QuoteActions, QuoteDocumentActions } from './editor/QuoteActions';
import { useQuote, useQuoteMutation } from './hooks';
import { QuoteStatusBadge } from './QuoteStatusBadge';

/** Ligne du devis : enregistrement et suppression immédiats. */
function QuoteLineItem({ line, locked }: { line: QuoteLine; locked: boolean }) {
  const update = useQuoteMutation((patch: LinePatch) => updateQuoteLine(line.id, patch), null);
  const remove = useQuoteMutation(() => deleteQuoteLine(line.id), 'Ligne supprimée');
  return (
    <LineRow
      line={{ ...line, hours: line.estimated_hours }}
      locked={locked}
      onSave={(patch) => update.mutate(patch)}
      onDelete={() => remove.mutate(undefined)}
      deleting={remove.isPending}
    />
  );
}

function LinesSection({
  title,
  lines,
  locked,
  empty,
  first,
}: {
  title: string;
  lines: QuoteLine[];
  locked: boolean;
  empty: string;
  first?: boolean;
}) {
  return (
    <section aria-label={title}>
      <div className={first ? 'px-6 pt-3.5 pb-1.5' : 'border-t px-6 pt-[18px] pb-1.5'}>
        <h3 className="h3 font-sans tracking-normal">{title}</h3>
      </div>
      <LineColumns />
      {lines.length === 0 ? (
        <p className="hint px-6 py-3">{empty}</p>
      ) : (
        <ul>
          {lines.map((line) => (
            <QuoteLineItem key={line.id} line={line} locked={locked} />
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
  const addLine = useQuoteMutation((line: NewQuoteLine) => addQuoteLine(id, line), null);

  if (detail.isPending) return <p className="text-muted-foreground">Chargement…</p>;
  if (detail.isError) return <p className="text-destructive">Impossible de charger ce devis.</p>;
  if (!detail.data) {
    return (
      <div className="col items-center gap-4 py-16 text-center">
        <h1 className="title">Devis introuvable</h1>
        <Button asChild>
          <Link to="/devis">Retour aux devis</Link>
        </Button>
      </div>
    );
  }

  const { quote, lines, laborRate, clientDiscount } = detail.data;
  const locked = isQuoteLocked(quote);
  const done = lines.filter((line) => line.section === 'done');
  const planned = lines.filter((line) => line.section === 'planned');
  const totals = computeTotals(lines);
  const hasLines = lines.some((line) => line.line_type !== 'text');
  const companyEmail = settings.data?.company.email;

  const events = [
    { tone: 's-warn', label: 'Devis créé', date: quote.created_at },
    quote.sent_at && { tone: 's-blue', label: 'Envoyé au client', date: quote.sent_at },
    quote.accepted_at && {
      tone: 's-ok',
      label: `Accepté${quote.accepted_by_name ? ` par ${quote.accepted_by_name}` : ''}`,
      date: quote.accepted_at,
    },
    quote.refused_at && { tone: 's-bad', label: 'Refusé', date: quote.refused_at },
  ].filter((event): event is { tone: string; label: string; date: string } => Boolean(event));

  return (
    <>
      <PageHeader
        back={{
          to: quote.repair_order_id ? `/or/${quote.repair_order_id}` : '/devis',
          label: quote.repair_order_id ? 'Retour à l’OR' : 'Retour aux devis',
        }}
        crumbs={[{ label: 'Devis', to: '/devis' }, { label: quote.number ?? 'Brouillon' }]}
        title={
          <>
            <span>Devis{quote.plate ? ` · ${quote.plate}` : ''}</span>
            <QuoteStatusBadge status={quote.status} />
          </>
        }
        actions={
          <>
            {quote.repair_order_id && (
              <Button variant="ghost" asChild>
                <Link to={`/or/${quote.repair_order_id}`}>
                  <Wrench /> Retour à l’OR {quote.repair_order_number ?? ''}
                </Link>
              </Button>
            )}
            <QuoteDocumentActions quote={quote} hasLines={hasLines} />
          </>
        }
      />

      <div className="split grid-cols-1! lg:grid-cols-[minmax(0,1fr)_340px]!">
        <section data-slot="card" className="card min-w-0 overflow-hidden" aria-label="Éditeur de devis">
          <div className="row top flex-wrap justify-between gap-5 border-b px-6 py-[22px]">
            <div className="col gap-1">
              <h2 className="disp text-[30px] leading-none font-bold tracking-[.06em]">DEVIS</h2>
              <span className="hint">{quote.number ?? 'Numéro attribué à la génération'}</span>
              {quote.valid_until && (
                <span className="hint">Valable jusqu’au {formatDate(quote.valid_until)}</span>
              )}
            </div>
            <div className="grid w-full max-w-[520px] gap-7 sm:grid-cols-2">
              <div className="col gap-0.5">
                <span className="overline">Client :</span>
                <b>{quote.client_name ?? '-'}</b>
              </div>
              <div className="col gap-0.5">
                <span className="overline">Véhicule :</span>
                <b className="plate">{quote.plate ?? '-'}</b>
                <span className="hint">{VEHICLE_TYPES[quote.vehicle_type]}</span>
              </div>
            </div>
          </div>

          {(quote.resulting_repair_order_id ||
            locked ||
            (quote.status === 'accepted' && quote.repair_order_id)) && (
            <div className="col gap-3 border-b px-6 py-4">
              {quote.resulting_repair_order_id && (
                <p className="text-[13.5px]">
                  OR créé :{' '}
                  <Link className="link" to={`/or/${quote.resulting_repair_order_id}`}>
                    {quote.resulting_repair_order_number}
                  </Link>
                </p>
              )}
              {quote.status === 'accepted' && quote.repair_order_id && (
                // Devis accepté : les travaux déjà faits sur l'OR d'origine sont à facturer ou offrir.
                <PreQuoteWorkCard repairOrderId={quote.repair_order_id} autoOpen />
              )}
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
            </div>
          )}

          {done.length > 0 && (
            <LinesSection
              title="Travaux déjà effectués"
              lines={done}
              locked={locked}
              empty="Aucun travail effectué."
              first
            />
          )}
          <LinesSection
            title="Travaux à prévoir"
            lines={planned}
            locked={locked}
            empty="Aucune ligne : ajoute une prestation, un forfait ou une pièce."
            first={done.length === 0}
          />
          {!locked && (
            <div className="border-t bg-head px-5 py-3">
              <AddLineButtons
                vehicleType={quote.vehicle_type}
                laborRate={laborRate}
                tires={{
                  documentLabel: 'devis',
                  repairOrderId: quote.repair_order_id,
                  repairOrderNumber: quote.repair_order_number,
                }}
                onAdd={({ hours, ...line }) =>
                  addLine.mutateAsync({
                    section: 'planned',
                    position: nextPosition(lines, 'planned'),
                    vat_rate: settings.data?.company.default_vat_rate ?? 20,
                    discount_percent: line.line_type === 'text' ? 0 : clientDiscount,
                    estimated_hours: hours ?? null,
                    ...line,
                  })
                }
              />
            </div>
          )}

          <div className="flex justify-end px-6 py-[18px]">
            <TotalsList totals={totals} offered={offeredTotal(lines)} />
          </div>
        </section>

        <div className="col gap-5">
          <QuoteActions quote={quote} hasLines={hasLines} />
          <section data-slot="card" className="card" aria-labelledby="quote-history">
            <div className="card-h">
              <h2 className="h2" id="quote-history">
                Suivi
              </h2>
            </div>
            <ul className="card-b col gap-3.5">
              {events.map((event) => (
                <li key={event.label} className="row top gap-2.5">
                  <span className={`tdot mt-[5px] ${event.tone}`} />
                  <div className="col gap-0">
                    <span>{event.label}</span>
                    <span className="hint">le {formatDate(event.date)}</span>
                  </div>
                </li>
              ))}
              {quote.signature_file_id && (
                <li>
                  <StoredImage
                    fileId={quote.signature_file_id}
                    alt="Signature du client"
                    className="h-20 w-48 rounded-[7px] border bg-white object-contain"
                  />
                </li>
              )}
            </ul>
          </section>
          {companyEmail && quote.status !== 'accepted' && quote.status !== 'refused' && (
            <div className="alert s-blue">
              <Mail className="i" />
              <span>À envoyer depuis {companyEmail} : le client signe en ligne.</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
