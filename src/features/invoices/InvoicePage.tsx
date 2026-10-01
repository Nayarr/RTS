import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, FileDown, FileMinus, Lock, RotateCcw, Send, Trash2, Wallet } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PdfPreviewDialog } from '@/components/PdfPreviewDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AddLineButtons } from '@/features/documents/AddLineButtons';
import { LineColumns, LineRow, TotalsList, type LinePatch } from '@/features/documents/LineRow';
import { computeTotals, nextPositionOf } from '@/features/documents/lines';
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
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl font-bold">Actions</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button disabled={!hasLines} onClick={() => onDialog('issue')}>
          <Send /> Émettre la facture
        </Button>
        <Button
          variant="outline"
          disabled={!hasLines || pdf.invoicePdf.isPending}
          onClick={() => pdf.invoicePdf.mutate({ detail, proforma: true })}
        >
          <FileDown /> Aperçu pro forma
        </Button>
        {detail.invoice.repair_order_ids.length > 0 && (
          <Button variant="outline" onClick={() => onDialog('rebuild')}>
            <RotateCcw /> Reprendre les lignes des OR
          </Button>
        )}
        <Button variant="ghost" className="text-destructive" onClick={() => onDialog('delete')}>
          <Trash2 /> Supprimer le brouillon
        </Button>
      </CardContent>
    </Card>
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
  const { invoice, payments, creditNotes } = detail;
  const balance = invoice.balance_due ?? 0;
  const credited = invoice.credited_ttc ?? 0;
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-xl font-bold">Actions</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button
            disabled={pdf.invoicePdf.isPending}
            onClick={() => pdf.invoicePdf.mutate({ detail, proforma: false })}
          >
            <FileDown /> PDF de la facture
          </Button>
          {balance > 0.01 && (
            <Button variant="outline" onClick={() => onDialog('payment')}>
              <Wallet /> Enregistrer un paiement
            </Button>
          )}
          <ShareInvoiceButtons invoice={invoice} />
          {credited < invoice.total_ttc - 0.01 && (
            <Button variant="outline" onClick={() => onDialog('credit')}>
              <FileMinus /> Générer un avoir
            </Button>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-xl font-bold">Encaissement</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <dl className="space-y-1" aria-label="Solde">
            <div className="flex justify-between">
              <dt>Total TTC</dt>
              <dd className="tabular-nums">{formatEuro(invoice.total_ttc)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Payé</dt>
              <dd className="tabular-nums">{formatEuro(invoice.paid_ttc ?? 0)}</dd>
            </div>
            {credited > 0 && (
              <div className="flex justify-between">
                <dt>Avoirs</dt>
                <dd className="tabular-nums">{formatEuro(credited)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t pt-1 text-base font-bold">
              <dt>Reste dû</dt>
              <dd className="tabular-nums">{formatEuro(balance)}</dd>
            </div>
          </dl>
          {invoice.reminders_count > 0 && (
            <p className="text-muted-foreground">
              {invoice.reminders_count} relance{invoice.reminders_count > 1 ? 's' : ''}, la dernière le{' '}
              {formatDate(invoice.last_reminder_at)}
            </p>
          )}
          {payments.length > 0 && (
            <ul aria-label="Paiements" className="divide-y">
              {payments.map((payment) => (
                <li key={payment.id} className="flex justify-between gap-2 py-1.5">
                  <span>
                    {formatDate(payment.paid_on)} — {PAYMENT_METHODS[payment.method]}
                    {payment.note && <span className="text-muted-foreground"> · {payment.note}</span>}
                  </span>
                  <strong className="tabular-nums">{formatEuro(payment.amount_ttc)}</strong>
                </li>
              ))}
            </ul>
          )}
          {creditNotes.length > 0 && (
            <ul aria-label="Avoirs" className="divide-y">
              {creditNotes.map((note) => (
                <li key={note.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>
                    {note.number} — {formatDate(note.issued_at)}
                    {note.reason && <span className="text-muted-foreground"> · {note.reason}</span>}
                  </span>
                  <span className="flex items-center gap-1">
                    <strong className="tabular-nums">−{formatEuro(note.total_ttc)}</strong>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`PDF de l’avoir ${note.number}`}
                      onClick={() => pdf.creditNotePdf.mutate({ creditNote: note, invoice })}
                    >
                      <FileDown />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
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
      <div className="space-y-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Facture introuvable</h1>
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

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Button variant="ghost" asChild className="-ml-3">
        <Link to={singleOrder ? `/or/${singleOrder}` : '/factures'}>
          <ArrowLeft /> {singleOrder ? `Retour à l’OR ${invoice.repair_order_numbers[0] ?? ''}` : 'Factures'}
        </Link>
      </Button>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <Card className="min-w-0">
          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-3xl font-bold text-primary">FACTURE</h1>
                <p className="text-muted-foreground">
                  {invoice.number ?? 'Brouillon — numéro attribué à l’émission'}
                </p>
                {!draft && (
                  <p className="text-sm text-muted-foreground">
                    Émise le {formatDate(invoice.issued_at)} · échéance le {formatDate(invoice.due_date)}
                  </p>
                )}
              </div>
              <InvoiceStatusBadge invoice={invoice} className="px-3 py-1 text-sm" />
            </div>

            <div className="grid gap-4 text-base sm:grid-cols-2">
              <div>
                <p>
                  <strong>Client :</strong> {invoice.client_name ?? '—'}
                </p>
                {!draft && invoice.client_address && (
                  <p className="text-sm whitespace-pre-line text-muted-foreground">
                    {invoice.client_address}
                  </p>
                )}
                <p>
                  <strong>Véhicule :</strong> {invoice.vehicle_label ?? '—'}
                  {invoice.mileage !== null && ` — ${invoice.mileage.toLocaleString('fr-FR')} km`}
                </p>
                {invoice.repair_order_numbers.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Réf. OR :{' '}
                    {invoice.repair_order_ids.map((orderId, index) => (
                      <span key={orderId}>
                        {index > 0 && ', '}
                        <Link className="underline" to={`/or/${orderId}`}>
                          {invoice.repair_order_numbers[index]}
                        </Link>
                      </span>
                    ))}
                  </p>
                )}
              </div>
              {draft && (
                <div className="space-y-2 sm:max-w-48 sm:justify-self-end">
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
                  <p className="text-xs text-muted-foreground">Vide : date d’émission.</p>
                </div>
              )}
            </div>

            {!draft && (
              <Alert>
                <Lock />
                <AlertDescription>
                  Facture émise : elle ne se modifie plus. Une correction passe par un avoir.
                </AlertDescription>
              </Alert>
            )}

            <section aria-label="Lignes de la facture" className="space-y-1">
              <LineColumns />
              {lines.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">
                  Aucune ligne : rien à facturer pour l’instant.
                </p>
              ) : (
                <ul>
                  {lines.map((line) => (
                    <InvoiceLineItem key={line.id} line={line} locked={!draft} />
                  ))}
                </ul>
              )}
            </section>
            {draft && (
              <AddLineButtons
                vehicleType={data.vehicleType}
                laborRate={data.laborRate}
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
            )}
            <TotalsList
              totals={draft ? totals : { ...totals, ht: invoice.total_ht, ttc: invoice.total_ttc }}
            />
          </CardContent>
        </Card>

        <div className="space-y-5">
          {draft ? (
            <>
              <DraftActions detail={data} onDialog={setDialog} pdf={pdf} />
              <ClientBillingCard clientId={invoice.client_id} client={client} />
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
    </div>
  );
}
