import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, FileDown, FileMinus, Info, Lock, RotateCcw, Send, Trash2, Wallet } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PdfPreviewDialog } from '@/components/PdfPreviewDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AddLineButtons } from '@/features/documents/AddLineButtons';
import { LineColumns, LineRow, TotalsList, type LinePatch } from '@/features/documents/LineRow';
import { computeTotals, nextPositionOf, offeredTotal } from '@/features/documents/lines';
import { formatDate } from '@/features/repair-orders/constants';
import { useSettings } from '@/features/settings/hooks';
import { formatEuro } from '@/lib/numbers';
import {
  addCreditNote,
  addInvoiceLine,
  addPayment,
  deleteInvoiceDraft,
  deleteInvoiceLine,
  issueInvoice,
  rebuildInvoiceDraft,
  updateInvoiceDraft,
  updateInvoiceLine,
  type CreditNoteInput,
  type InvoiceDetail,
  type InvoiceLine,
  type NewInvoiceLine,
  type PaymentInput,
} from './api';
import { ClientBillingCard } from './ClientBillingCard';
import { CreditNoteDialog, IssueDialog, PaymentDialog } from './dialogs';
import { balanceHt, issueBlockers, issueWarnings, mainVatRate, PAYMENT_METHODS } from './domain';
import { useInvoice, useInvoiceMutation, useInvoicePdf } from './hooks';
import { InvoiceStatusBadge } from './PaymentStatusBadge';
import { ShareInvoiceButtons } from './ShareInvoiceButtons';
import { DuplicateButton } from '@/components/DuplicateButton';
import { duplicateInvoice } from './api';

type Dialog = 'issue' | 'payment' | 'credit' | 'rebuild' | 'delete' | null;

function InvoiceLineItem({ line, locked }: { line: InvoiceLine; locked: boolean }) {
  const update = useInvoiceMutation((patch: LinePatch) => updateInvoiceLine(line.id, patch), null);
  const remove = useInvoiceMutation(() => deleteInvoiceLine(line.id), 'Ligne supprimée');
  return (
    <LineRow
      line={{ ...line, hours: line.billed_hours }}
      locked={locked}
      onSave={(patch) => update.mutate(patch)}
      onDelete={() => remove.mutate(undefined)}
      deleting={remove.isPending}
    />
  );
}

function DraftActions({
  detail,
  onDialog,
  pdf,
}: {
  detail: InvoiceDetail;
  onDialog: (d: Dialog) => void;
  pdf: ReturnType<typeof useInvoicePdf>;
}) {
  const hasLines = detail.lines.some((line) => line.line_type !== 'text');
  return (
    <section data-slot="card" className="card" aria-labelledby="invoice-actions">
      <div className="card-h">
        <h2 className="h2" id="invoice-actions">
          Actions
        </h2>
      </div>
      <div className="card-b col gap-2">
        <Button className="w-full" disabled={!hasLines} onClick={() => onDialog('issue')}>
          <Send /> Émettre la facture
        </Button>
        <Button
          variant="outline"
          className="w-full"
          disabled={!hasLines || pdf.invoicePdf.isPending}
          onClick={() => pdf.invoicePdf.mutate({ detail, proforma: true })}
        >
          <FileDown /> Aperçu pro forma
        </Button>
        {detail.invoice.repair_order_ids.length > 0 && (
          <Button variant="outline" className="w-full" onClick={() => onDialog('rebuild')}>
            <RotateCcw /> Reprendre les lignes des OR
          </Button>
        )}
        <Button variant="ghost" className="w-full text-destructive" onClick={() => onDialog('delete')}>
          <Trash2 /> Supprimer le brouillon
        </Button>
      </div>
    </section>
  );
}

function IssuedPanel({
  detail,
  onDialog,
  pdf,
}: {
  detail: InvoiceDetail;
  onDialog: (d: Dialog) => void;
  pdf: ReturnType<typeof useInvoicePdf>;
}) {
  // « ?envoyer=1 » : facture qui vient d'être émise (travaux avant devis), envoyée au client tout de suite
  const [params, setParams] = useSearchParams();
  const autoSend = params.get('envoyer') === '1';
  const { invoice, payments, creditNotes } = detail;
  const balance = invoice.balance_due ?? 0;
  const credited = invoice.credited_ttc ?? 0;
  const paid = invoice.paid_ttc ?? 0;
  const settled = invoice.total_ttc > 0 ? Math.min(100, ((paid + credited) / invoice.total_ttc) * 100) : 0;
  return (
    <>
      <section data-slot="card" className="card" aria-labelledby="invoice-actions">
        <div className="card-h">
          <h2 className="h2" id="invoice-actions">
            Actions
          </h2>
        </div>
        <div className="card-b col gap-2">
          {balance > 0.01 && (
            <Button className="w-full" onClick={() => onDialog('payment')}>
              <Wallet /> Enregistrer un paiement
            </Button>
          )}
          <Button
            variant={balance > 0.01 ? 'outline' : 'default'}
            className="w-full"
            disabled={pdf.invoicePdf.isPending}
            onClick={() => pdf.invoicePdf.mutate({ detail, proforma: false })}
          >
            <FileDown /> PDF de la facture
          </Button>
          <ShareInvoiceButtons
            invoice={invoice}
            autoSend={autoSend}
            onAutoSendDone={() => setParams({}, { replace: true })}
          />
          {credited < invoice.total_ttc - 0.01 && (
            <Button variant="outline" className="w-full" onClick={() => onDialog('credit')}>
              <FileMinus /> Générer un avoir
            </Button>
          )}
        </div>
      </section>
      <section data-slot="card" className="card" aria-label="Solde">
        <div className="card-h">
          <h2 className="h2">Encaissement</h2>
          <InvoiceStatusBadge invoice={invoice} />
        </div>
        <div className="card-b col gap-3">
          <dl className="g3 gap-2">
            <div className="col gap-0.5">
              <dt className="hint">Total TTC</dt>
              <dd className="num b">{formatEuro(invoice.total_ttc)}</dd>
            </div>
            <div className="col gap-0.5">
              <dt className="hint">Payé</dt>
              <dd className="num b up">{formatEuro(paid)}</dd>
            </div>
            <div className="col gap-0.5">
              <dt className="hint">Reste dû</dt>
              <dd className={`num b ${balance > 0.01 ? 'down' : ''}`}>{formatEuro(balance)}</dd>
            </div>
            {credited > 0 && (
              <div className="col gap-0.5">
                <dt className="hint">Avoirs</dt>
                <dd className="num b">{formatEuro(credited)}</dd>
              </div>
            )}
          </dl>
          <div className="bar s-ok" aria-hidden>
            <i style={{ width: `${settled}%` }} />
          </div>
          {invoice.reminders_count > 0 && (
            <p className="hint">
              {invoice.reminders_count} relance{invoice.reminders_count > 1 ? 's' : ''}, la dernière le{' '}
              {formatDate(invoice.last_reminder_at)}
            </p>
          )}
          {payments.length > 0 && (
            <ul aria-label="Paiements">
              {payments.map((payment) => (
                <li key={payment.id} className="row between border-t py-2.5">
                  <span className="col gap-0">
                    <b>{PAYMENT_METHODS[payment.method]}</b>
                    <span className="hint">
                      {formatDate(payment.paid_on)}
                      {payment.note && ` · ${payment.note}`}
                    </span>
                  </span>
                  <b className="num">{formatEuro(payment.amount_ttc)}</b>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      {creditNotes.length > 0 && (
        <section data-slot="card" className="card" aria-label="Avoirs">
          <div className="card-h">
            <h2 className="h2">Avoirs</h2>
            <span className="cnt">{creditNotes.length}</span>
          </div>
          <ul>
            {creditNotes.map((note) => (
              <li key={note.id} className="li">
                <span className="c2 min-w-0">
                  <b>{note.number}</b>
                  <span>
                    {formatDate(note.issued_at)}
                    {note.reason && ` · ${note.reason}`}
                  </span>
                </span>
                <span className="row gap-2">
                  <b className="num down">−{formatEuro(note.total_ttc)}</b>
                  <button
                    type="button"
                    className="ibtn sm"
                    aria-label={`PDF de l’avoir ${note.number}`}
                    onClick={() => pdf.creditNotePdf.mutate({ creditNote: note, invoice })}
                  >
                    <FileDown className="i s" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** Facture : brouillon modifiable, puis facture émise figée (encaissements, avoirs). */
export function InvoicePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const detail = useInvoice(id);
  const settings = useSettings();
  const pdf = useInvoicePdf();
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  const addLine = useInvoiceMutation((line: NewInvoiceLine) => addInvoiceLine(id, line), null);
  const setServiceDate = useInvoiceMutation(
    (date: string) => updateInvoiceDraft(id, { service_date: date || null }),
    null,
  );
  const issue = useInvoiceMutation(
    async () => {
      const number = await issueInvoice(id);
      close();
      return number;
    },
    (number) => `Facture ${number} émise`,
  );
  const pay = useInvoiceMutation((input: PaymentInput) => addPayment(id, input), 'Paiement enregistré');
  const credit = useInvoiceMutation(
    (input: CreditNoteInput) => addCreditNote(id, input),
    (note) => `Avoir ${note.number} généré`,
  );
  const rebuild = useInvoiceMutation(async (orderIds: string[]) => {
    const newId = await rebuildInvoiceDraft(id, orderIds);
    close();
    await navigate(`/factures/${newId}`, { replace: true });
  }, 'Lignes reprises des OR');
  const remove = useInvoiceMutation(async () => {
    await deleteInvoiceDraft(id);
    await navigate('/factures', { replace: true });
  }, 'Brouillon supprimé');

  if (detail.isPending) return <p className="text-muted-foreground">Chargement…</p>;
  if (detail.isError) return <p className="text-destructive">Impossible de charger cette facture.</p>;
  if (!detail.data) {
    return (
      <div className="col items-center gap-4 py-16 text-center">
        <h1 className="title">Facture introuvable</h1>
        <Button asChild>
          <Link to="/factures">Retour aux factures</Link>
        </Button>
      </div>
    );
  }

  const data = detail.data;
  const { invoice, lines, client } = data;
  const draft = invoice.status === 'draft';
  const totals = computeTotals(lines);
  const vatRate = settings.data?.company.default_vat_rate ?? 20;
  const singleOrder = invoice.repair_order_ids.length === 1 ? invoice.repair_order_ids[0] : undefined;
  const grouped = invoice.repair_order_ids.length > 1;

  return (
    <>
      <PageHeader
        back={{ to: '/factures', label: 'Retour aux factures' }}
        crumbs={[{ label: 'Factures', to: '/factures' }, { label: invoice.number ?? 'Brouillon' }]}
        title={
          <>
            <span>{invoice.number ? `Facture ${invoice.number}` : 'Facture · brouillon'}</span>
            <InvoiceStatusBadge invoice={invoice} />
          </>
        }
        actions={
          <>
            {singleOrder && (
              <Button variant="ghost" asChild>
                <Link to={`/or/${singleOrder}`}>
                  <ArrowLeft /> Retour à l’OR {invoice.repair_order_numbers[0] ?? ''}
                </Link>
              </Button>
            )}
            <DuplicateButton
              label="Dupliquer la facture"
              duplicate={() => duplicateInvoice(invoice.id)}
              path={(copy) => `/factures/${copy}`}
              success="Facture dupliquée en brouillon"
            />
          </>
        }
      />

      <div className="split grid-cols-1! lg:grid-cols-[minmax(0,1fr)_360px]!">
        <div className="col min-w-0 gap-5">
          <section data-slot="card" className="card overflow-hidden" aria-label="Facture">
            <div className="row top flex-wrap justify-between gap-5 border-b px-6 py-[22px]">
              <div className="col gap-1">
                <h2 className="disp text-[30px] leading-none font-bold tracking-[.06em]">FACTURE</h2>
                <span className="hint">
                  {invoice.number
                    ? `N° ${invoice.number} · émise le ${formatDate(invoice.issued_at)} · échéance ${formatDate(invoice.due_date)}`
                    : 'Brouillon : numéro attribué à l’émission'}
                </span>
              </div>
              <div className="grid w-full max-w-[540px] gap-7 sm:grid-cols-2">
                <div className="col gap-0.5">
                  <span className="overline">Client :</span>
                  <b>{invoice.client_name ?? '-'}</b>
                  {!draft && invoice.client_address && (
                    <span className="hint whitespace-pre-line">{invoice.client_address}</span>
                  )}
                </div>
                <div className="col gap-0.5">
                  <span className="overline">Véhicule :</span>
                  <b className="plate">{invoice.vehicle_label ?? '-'}</b>
                  <span className="hint">
                    {invoice.mileage !== null && `${invoice.mileage.toLocaleString('fr-FR')} km · `}
                    {grouped && `Facture groupée (${invoice.repair_order_ids.length} OR) · `}
                    {invoice.repair_order_ids.map((orderId, index) => (
                      <span key={orderId}>
                        {index > 0 && ', '}
                        <Link className="ul" to={`/or/${orderId}`}>
                          {invoice.repair_order_numbers[index]}
                        </Link>
                      </span>
                    ))}
                  </span>
                </div>
              </div>
            </div>

            {draft ? (
              <div className="row flex-wrap items-end gap-3.5 border-b px-6 py-3.5">
                <div className="field w-[220px]">
                  <Label htmlFor="service-date">Date de la prestation</Label>
                  <Input
                    id="service-date"
                    type="date"
                    defaultValue={invoice.service_date ?? ''}
                    key={invoice.service_date ?? ''}
                    onBlur={(event) => {
                      if (event.target.value !== (invoice.service_date ?? ''))
                        setServiceDate.mutate(event.target.value);
                    }}
                  />
                </div>
                <span className="hint pb-3">Vide : date d’émission.</span>
              </div>
            ) : (
              <div className="border-b px-6 py-4">
                <Alert>
                  <Lock />
                  <AlertDescription>
                    Facture émise : elle ne se modifie plus. Une correction passe par un avoir.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <section aria-label="Lignes de la facture">
              <LineColumns />
              {lines.length === 0 ? (
                <p className="hint px-6 py-3">Aucune ligne : rien à facturer pour l’instant.</p>
              ) : (
                <ul>
                  {lines.map((line) => (
                    <InvoiceLineItem key={line.id} line={line} locked={!draft} />
                  ))}
                </ul>
              )}
            </section>
            {draft && (
              <div className="border-t bg-head px-6 py-3">
                <AddLineButtons
                  vehicleType={data.vehicleType}
                  laborRate={data.laborRate}
                  tires={{
                    documentLabel: 'facture',
                    repairOrderId: singleOrder ?? null,
                    repairOrderNumber: null,
                  }}
                  onAdd={({ hours, ...line }) =>
                    addLine.mutateAsync({
                      repair_order_id: singleOrder ?? null,
                      position: nextPositionOf(lines),
                      vat_rate: vatRate,
                      discount_percent: line.line_type === 'text' ? 0 : data.clientDiscount,
                      billed_hours: hours ?? null,
                      ...line,
                    })
                  }
                />
              </div>
            )}
            <div className="flex justify-end border-t px-6 py-[18px]">
              <TotalsList
                totals={draft ? totals : { ...totals, ht: invoice.total_ht, ttc: invoice.total_ttc }}
                offered={offeredTotal(lines)}
              />
            </div>
          </section>
          {draft && <ClientBillingCard clientId={invoice.client_id} client={client} />}
        </div>

        <div className="col gap-5">
          {draft ? (
            <>
              <DraftActions detail={data} onDialog={setDialog} pdf={pdf} />
              <div className="alert s-blue">
                <Info className="i" />
                <span>
                  Brouillon : le numéro est attribué à l’émission. Une fois émise, la facture ne se modifie
                  plus.
                </span>
              </div>
            </>
          ) : (
            <IssuedPanel detail={data} onDialog={setDialog} pdf={pdf} />
          )}
        </div>
      </div>

      {dialog === 'issue' && (
        <IssueDialog
          blockers={issueBlockers(client)}
          warnings={issueWarnings(lines, client)}
          totalTtc={totals.ttc}
          pending={issue.isPending}
          onConfirm={() => issue.mutate(undefined)}
          onClose={close}
        />
      )}
      {dialog === 'payment' && (
        <PaymentDialog
          number={invoice.number ?? ''}
          totalTtc={invoice.total_ttc}
          balance={invoice.balance_due ?? 0}
          pending={pay.isPending}
          onSubmit={(input) => pay.mutate(input, { onSuccess: close })}
          onClose={close}
        />
      )}
      {dialog === 'credit' && (
        <CreditNoteDialog
          number={invoice.number ?? ''}
          suggestedHt={balanceHt(invoice)}
          vatRate={mainVatRate(lines, vatRate)}
          pending={credit.isPending}
          onSubmit={(input) =>
            credit.mutate(input, {
              onSuccess: (note) => {
                close();
                pdf.creditNotePdf.mutate({ creditNote: note, invoice });
              },
            })
          }
          onClose={close}
        />
      )}
      <ConfirmDialog
        open={dialog === 'rebuild'}
        onOpenChange={(open) => !open && close()}
        title="Reprendre les lignes des OR ?"
        description="Le brouillon est refait à partir des travaux, pièces, sous-traitance et consommables actuels des OR : les modifications faites ici sont perdues."
        confirmLabel="Reprendre les lignes"
        pending={rebuild.isPending}
        onConfirm={() => rebuild.mutate(invoice.repair_order_ids)}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(open) => !open && close()}
        title="Supprimer ce brouillon ?"
        description="Les OR restent à facturer ; aucun numéro n’a été attribué."
        confirmLabel="Supprimer"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate(undefined)}
      />
      <PdfPreviewDialog file={pdf.file} onClose={pdf.close} />
    </>
  );
}
