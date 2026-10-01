import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, FileDown, RotateCcw, Send, Trash2, Wrench, X } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PdfPreviewDialog } from '@/components/PdfPreviewDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useActiveTechnicians } from '@/features/repair-orders/hooks';
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
  const create = useQuoteMutation(async () => {
    const id = await createRepairOrderFromQuote(quote.id, technicianId || null);
    await navigate(`/or/${id}`);
  }, 'OR créé avec les travaux du devis');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Créer l’OR</DialogTitle>
          <DialogDescription>
            Un nouvel OR reprend les travaux à prévoir du devis ; les pièces passent « À commander ».
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
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={create.isPending} onClick={() => create.mutate(undefined)}>
            Créer l’OR
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** PDF, envoi, réponse du client, création de l'OR. */
export function QuoteActions({ quote, hasLines }: { quote: QuoteOverview; hasLines: boolean }) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const pdf = useQuotePdf(quote.id);

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
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl font-bold">Actions</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button disabled={!hasLines || pdf.generate.isPending} onClick={() => pdf.generate.mutate(undefined)}>
          <FileDown /> {pdf.generate.isPending ? 'Génération…' : 'Générer le PDF'}
        </Button>
        {!answered && <ShareQuoteButton quote={quote} disabled={!hasLines} />}
        {!answered && quote.status !== 'sent' && (
          <Button
            variant="outline"
            disabled={!hasLines || markSent.isPending}
            onClick={() => markSent.mutate(undefined)}
          >
            <Send /> Marquer comme envoyé
          </Button>
        )}
        {!answered && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={!hasLines} onClick={() => setConfirm('accepted')}>
              <Check /> Accepté
            </Button>
            <Button variant="outline" disabled={!hasLines} onClick={() => setConfirm('refused')}>
              <X /> Refusé
            </Button>
          </div>
        )}
        {quote.status === 'refused' && (
          <Button
            variant="outline"
            disabled={respond.isPending}
            onClick={() => respond.mutate('in_progress')}
          >
            <RotateCcw /> Rouvrir le devis
          </Button>
        )}
        {canCreateOrder && (
          <Button variant={standalone ? 'outline' : 'default'} onClick={() => setCreatingOrder(true)}>
            <Wrench /> {standalone ? 'Transformer en OR' : 'Créer l’OR avec les travaux acceptés'}
          </Button>
        )}
        {!quote.number && !answered && (
          <Button variant="ghost" className="text-destructive" onClick={() => setConfirm('delete')}>
            <Trash2 /> Supprimer le devis
          </Button>
        )}
      </CardContent>

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
      <PdfPreviewDialog file={pdf.file} onClose={pdf.close} />
    </Card>
  );
}
