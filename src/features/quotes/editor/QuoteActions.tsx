import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, FileDown, RotateCcw, Send, Trash2, Wrench, X } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PdfPreviewDialog } from '@/components/PdfPreviewDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useActiveTechnicians } from '@/features/repair-orders/hooks';
import { todayIso } from '@/features/repair-orders/schemas';
import {
  assignQuoteNumber,
  createRepairOrderFromQuote,
  deleteQuote,
  setQuoteResponse,
  type QuoteOverview,
} from '../api';
import { useQuoteMutation } from '../hooks';
import { useQuotePdf } from '../use-quote-pdf';
import { ShareQuoteButton } from './ShareQuoteButton';

type Confirm = 'accepted' | 'refused' | 'delete' | null;

function CreateRepairOrderDialog({ quote, onClose }: { quote: QuoteOverview; onClose: () => void }) {
  const navigate = useNavigate();
  const technicians = useActiveTechnicians();
  const [technicianId, setTechnicianId] = useState('');
  const [plannedDate, setPlannedDate] = useState(todayIso());
  const [plannedStart, setPlannedStart] = useState('');
  const [plannedEnd, setPlannedEnd] = useState('');
  const timeError =
    plannedEnd && (!plannedStart || plannedEnd <= plannedStart)
      ? 'L’heure de fin doit être après l’heure de début'
      : null;
  const create = useQuoteMutation(async () => {
    const id = await createRepairOrderFromQuote(quote.id, {
      technicianId: technicianId || null,
      plannedDate: plannedDate || null,
      plannedStart: plannedStart || null,
      plannedEnd: plannedEnd || null,
    });
    await navigate(`/or/${id}`);
  }, 'OR créé avec les travaux du devis');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Créer l’OR</DialogTitle>
          <DialogDescription>
            Les travaux du devis deviennent les travaux effectués de l’OR, avec leur temps estimé ; les pièces
            passent « À commander ».
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="quote-technician">Technicien</Label>
          <select
            id="quote-technician"
            className="inp"
            value={technicianId}
            onChange={(event) => setTechnicianId(event.target.value)}
          >
            <option value="">— Non assigné —</option>
            {(technicians.data ?? []).map((technician) => (
              <option key={technician.id} value={technician.id}>
                {technician.display_name}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="col gap-2">
          <legend className="lbl mb-2">Début de l’OR</legend>
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
            <div className="field">
              <Label htmlFor="quote-planned-date">Date</Label>
              <Input
                id="quote-planned-date"
                type="date"
                value={plannedDate}
                onChange={(event) => setPlannedDate(event.target.value)}
              />
            </div>
            <div className="field">
              <Label htmlFor="quote-planned-start">Heure de début</Label>
              <Input
                id="quote-planned-start"
                type="time"
                value={plannedStart}
                onChange={(event) => setPlannedStart(event.target.value)}
              />
            </div>
            <div className="field">
              <Label htmlFor="quote-planned-end">Heure de fin</Label>
              <Input
                id="quote-planned-end"
                type="time"
                aria-invalid={timeError ? true : undefined}
                aria-describedby={timeError ? 'quote-planned-error' : undefined}
                value={plannedEnd}
                onChange={(event) => setPlannedEnd(event.target.value)}
              />
            </div>
          </div>
          {timeError ? (
            <p id="quote-planned-error" className="err">
              {timeError}
            </p>
          ) : (
            <span className="hint">
              {technicianId
                ? 'Le technicien est prévenu à la création, avec ce début prévu.'
                : 'Sans heure, l’OR va dans les OR « flexibles » du technicien.'}
            </span>
          )}
        </fieldset>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={create.isPending || Boolean(timeError)} onClick={() => create.mutate(undefined)}>
            Créer l’OR
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Barre de titre du devis : PDF et envoi au client. */
export function QuoteDocumentActions({ quote, hasLines }: { quote: QuoteOverview; hasLines: boolean }) {
  const pdf = useQuotePdf(quote.id);
  const answered = quote.status === 'accepted' || quote.status === 'refused';
  return (
    <>
      <Button
        variant="outline"
        disabled={!hasLines || pdf.generate.isPending}
        onClick={() => pdf.generate.mutate(undefined)}
      >
        <FileDown /> {pdf.generate.isPending ? 'Génération…' : 'Générer le PDF'}
      </Button>
      {!answered && <ShareQuoteButton quote={quote} disabled={!hasLines} />}
      <PdfPreviewDialog file={pdf.file} onClose={pdf.close} />
    </>
  );
}

/** Réponse du client, création de l'OR, envoi marqué, suppression. */
export function QuoteActions({ quote, hasLines }: { quote: QuoteOverview; hasLines: boolean }) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);

  const markSent = useQuoteMutation(() => assignQuoteNumber(quote.id, true), 'Devis marqué comme envoyé');
  const respond = useQuoteMutation(
    (status: 'accepted' | 'refused' | 'in_progress') => setQuoteResponse(quote.id, status),
    (status) =>
      status === 'accepted'
        ? 'Accord du client enregistré'
        : status === 'refused'
          ? 'Refus enregistré'
          : 'Devis rouvert',
  );
  const remove = useQuoteMutation(async () => {
    await deleteQuote(quote.id);
    await navigate('/devis', { replace: true });
  }, 'Devis supprimé');

  const answered = quote.status === 'accepted' || quote.status === 'refused';
  const standalone = quote.repair_order_id === null && quote.merged_into_repair_order_id === null;
  const canCreateOrder = standalone || (quote.status === 'accepted' && !quote.resulting_repair_order_id);

  return (
    <section data-slot="card" className="card" aria-labelledby="quote-actions">
      <div className="card-h">
        <h2 className="h2" id="quote-actions">
          Actions
        </h2>
      </div>
      <div className="card-b col gap-2.5">
        {!answered && (
          <>
            <span className="overline">Réponse du client</span>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="text-success"
                disabled={!hasLines}
                onClick={() => setConfirm('accepted')}
              >
                <Check /> Accepté
              </Button>
              <Button
                variant="outline"
                className="text-destructive"
                disabled={!hasLines}
                onClick={() => setConfirm('refused')}
              >
                <X /> Refusé
              </Button>
            </div>
            <p className="hint">
              Accord oral ou devis signé sur papier. Le devis ne pourra plus être modifié.
            </p>
          </>
        )}
        {quote.status === 'refused' && (
          <Button
            variant="outline"
            className="w-full"
            disabled={respond.isPending}
            onClick={() => respond.mutate('in_progress')}
          >
            <RotateCcw /> Rouvrir le devis
          </Button>
        )}
        {canCreateOrder && (
          <>
            <div className="hr my-1.5" />
            <span className="overline">Transformer en OR</span>
            <Button
              variant={standalone ? 'outline' : 'default'}
              className="w-full"
              onClick={() => setCreatingOrder(true)}
            >
              <Wrench /> {standalone ? 'Transformer en OR' : 'Créer l’OR avec les travaux acceptés'}
            </Button>
          </>
        )}
        {!answered && quote.status !== 'sent' && (
          <>
            <div className="hr my-1.5" />
            <Button
              variant="outline"
              className="w-full"
              disabled={!hasLines || markSent.isPending}
              onClick={() => markSent.mutate(undefined)}
            >
              <Send /> Marquer comme envoyé
            </Button>
          </>
        )}
        {!quote.number && !answered && (
          <Button variant="ghost" className="w-full text-destructive" onClick={() => setConfirm('delete')}>
            <Trash2 /> Supprimer le devis
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirm === 'accepted' || confirm === 'refused'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm === 'accepted' ? 'Le client accepte le devis ?' : 'Le client refuse le devis ?'}
        description={
          confirm === 'accepted'
            ? 'Accord oral ou devis signé sur papier. Le devis ne pourra plus être modifié.'
            : 'Le devis pourra être rouvert plus tard si besoin.'
        }
        confirmLabel={confirm === 'accepted' ? 'Enregistrer l’accord' : 'Enregistrer le refus'}
        destructive={confirm === 'refused'}
        pending={respond.isPending}
        onConfirm={() =>
          confirm && confirm !== 'delete' && respond.mutate(confirm, { onSuccess: () => setConfirm(null) })
        }
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Supprimer ce devis ?"
        description="Le brouillon et ses lignes seront supprimés."
        confirmLabel="Supprimer"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate(undefined)}
      />
      {creatingOrder && <CreateRepairOrderDialog quote={quote} onClose={() => setCreatingOrder(false)} />}
    </section>
  );
}
