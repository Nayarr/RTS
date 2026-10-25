import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { TriangleAlert } from 'lucide-react';
import { z } from 'zod';
import { FormField } from '@/components/FormField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { todayIso } from '@/features/repair-orders/schemas';
import { decimalField, decimalText, decimalValue, formatEuro } from '@/lib/numbers';
import type { CreditNoteInput, PaymentInput } from './api';
import { PAYMENT_METHOD_CHOICES, PAYMENT_METHODS, type PaymentChoice } from './domain';

/** Confirmation de l'émission définitive, avec les points à vérifier. */
export function IssueDialog({
  blockers,
  warnings,
  totalTtc,
  pending,
  onConfirm,
  onClose,
}: {
  blockers: string[];
  warnings: string[];
  totalTtc: number;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Émettre définitivement cette facture ?</DialogTitle>
          <DialogDescription>
            Total {formatEuro(totalTtc)} TTC. Une fois émise, elle ne pourra plus être modifiée : une
            correction passera par un avoir.
          </DialogDescription>
        </DialogHeader>
        {blockers.map((blocker) => (
          <Alert key={blocker} variant="destructive">
            <TriangleAlert />
            <AlertDescription>{blocker}</AlertDescription>
          </Alert>
        ))}
        {warnings.length > 0 && (
          <Alert>
            <TriangleAlert />
            <AlertDescription>Attention : {warnings.join(', ')}.</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={pending || blockers.length > 0} onClick={onConfirm}>
            {pending ? 'Émission…' : 'Émettre la facture'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Paiement

const paymentSchema = (balance: number) =>
  z.object({
    amount: decimalField({ required: true, positive: true }).refine(
      (value) => (decimalValue(value) ?? 0) <= balance + 0.001,
      `Au plus le reste dû (${formatEuro(balance)})`,
    ),
    method: z.enum(PAYMENT_METHOD_CHOICES),
    paid_on: z.string().min(1, 'Indique la date'),
    note: z.string().trim().max(200),
  });
type PaymentValues = z.infer<ReturnType<typeof paymentSchema>>;

export function PaymentDialog({
  number,
  totalTtc,
  balance,
  defaultMethod = 'bank_transfer',
  pending,
  onSubmit,
  onClose,
}: {
  number: string;
  totalTtc: number;
  balance: number;
  /** Mode proposé (prélèvement pour un client en prélèvement). */
  defaultMethod?: PaymentChoice;
  pending: boolean;
  onSubmit: (input: PaymentInput) => void;
  onClose: () => void;
}) {
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PaymentValues>({
    resolver: zodResolver(paymentSchema(balance)),
    defaultValues: { amount: decimalText(balance), method: defaultMethod, paid_on: todayIso(), note: '' },
  });
  // Paiement en plusieurs fois : ce qu'il restera à payer après celui-ci
  const amount = decimalValue(useWatch({ control, name: 'amount' })) ?? 0;
  const left = Math.round((balance - amount) * 100) / 100;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Paiement</DialogTitle>
          <DialogDescription>
            Facture {number} · TTC {formatEuro(totalTtc)}, reste dû : <strong>{formatEuro(balance)}</strong>
          </DialogDescription>
        </DialogHeader>
        <form
          id="payment-form"
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((values) =>
            onSubmit({
              amount_ttc: decimalValue(values.amount) ?? 0,
              method: values.method,
              paid_on: values.paid_on,
              note: values.note || null,
            }),
          )}
        >
          <div className="grid grid-cols-2 gap-3">
            <FormField
              id="payment-amount"
              label="Montant TTC (€)"
              inputMode="decimal"
              error={errors.amount?.message}
              {...register('amount')}
            />
            <FormField
              id="payment-date"
              label="Date"
              type="date"
              error={errors.paid_on?.message}
              {...register('paid_on')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-method">Mode</Label>
            <select id="payment-method" className="inp" {...register('method')}>
              {PAYMENT_METHOD_CHOICES.map((value) => (
                <option key={value} value={value}>
                  {PAYMENT_METHODS[value]}
                </option>
              ))}
            </select>
          </div>
          <FormField
            id="payment-note"
            label="Référence (facultatif)"
            placeholder="N° de chèque, référence du virement…"
            {...register('note')}
          />
          {amount > 0 && left > 0.001 && left < balance && (
            <p className="hint" role="status">
              Paiement partiel : il restera {formatEuro(left)} à payer. Enregistre les autres paiements
              (carte, espèces…) au fur et à mesure.
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="payment-form" disabled={pending}>
            Enregistrer le paiement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Échéance

/** Nouvelle échéance d'une facture : jamais avant la date d'émission. */
export function DueDateDialog({
  number,
  dueDate,
  issuedOn,
  pending,
  onSubmit,
  onClose,
}: {
  number: string;
  dueDate: string | null;
  issuedOn: string | null;
  pending: boolean;
  onSubmit: (date: string) => void;
  onClose: () => void;
}) {
  const schema = z.object({
    due_date: z
      .string()
      .min(1, 'Indique la nouvelle échéance')
      .refine((value) => !issuedOn || value >= issuedOn, 'Pas avant la date d’émission de la facture'),
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { due_date: dueDate ?? todayIso() },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Échéance</DialogTitle>
          <DialogDescription>
            Facture {number} : la nouvelle date est gardée dans l’historique de la facture, les relances
            suivent la nouvelle échéance.
          </DialogDescription>
        </DialogHeader>
        <form id="due-date-form" noValidate onSubmit={handleSubmit((values) => onSubmit(values.due_date))}>
          <FormField
            id="due-date"
            label="Nouvelle échéance"
            type="date"
            min={issuedOn ?? undefined}
            error={errors.due_date?.message}
            {...register('due_date')}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="due-date-form" disabled={pending}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Avoir

const creditNoteSchema = z.object({
  amount: decimalField({ required: true, positive: true }),
  vat_rate: decimalField({ required: true }),
  reason: z.string().trim().min(1, 'Indique le motif').max(500),
});
type CreditNoteValues = z.infer<typeof creditNoteSchema>;

export function CreditNoteDialog({
  number,
  suggestedHt,
  vatRate,
  pending,
  onSubmit,
  onClose,
}: {
  number: string;
  suggestedHt: number;
  vatRate: number;
  pending: boolean;
  onSubmit: (input: CreditNoteInput) => void;
  onClose: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreditNoteValues>({
    resolver: zodResolver(creditNoteSchema),
    defaultValues: { amount: decimalText(suggestedHt), vat_rate: decimalText(vatRate), reason: '' },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Générer un avoir</DialogTitle>
          <DialogDescription>
            L’avoir sera rattaché à la facture {number}. Il ne pourra plus être modifié.
          </DialogDescription>
        </DialogHeader>
        <form
          id="credit-note-form"
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((values) =>
            onSubmit({
              amount_ht: decimalValue(values.amount) ?? 0,
              vat_rate: decimalValue(values.vat_rate) ?? 0,
              reason: values.reason,
            }),
          )}
        >
          <div className="grid grid-cols-2 gap-3">
            <FormField
              id="credit-note-amount"
              label="Montant HT à créditer (€)"
              inputMode="decimal"
              error={errors.amount?.message}
              {...register('amount')}
            />
            <FormField
              id="credit-note-vat"
              label="TVA (%)"
              inputMode="decimal"
              error={errors.vat_rate?.message}
              {...register('vat_rate')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="credit-note-reason">Motif</Label>
            <textarea
              id="credit-note-reason"
              rows={3}
              className="inp"
              placeholder="Ex : erreur de facturation, retour pièce, geste commercial…"
              aria-invalid={errors.reason ? true : undefined}
              {...register('reason')}
            />
            {errors.reason && <p className="text-sm text-destructive">{errors.reason.message}</p>}
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="credit-note-form" disabled={pending}>
            Générer l’avoir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
