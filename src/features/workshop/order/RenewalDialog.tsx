import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScanText } from 'lucide-react';
import { toast } from 'sonner';
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
import { MonthYearField } from '@/components/MonthYearField';
import { monthFromLabel } from '@/lib/month';
import { readingFailedMessage } from '@/lib/reading';
import { readTailgateLabel, readTechnicalInspection, recordRenewal, type DeadlineRenewal } from '../api';
import { useVehicleDeadlines } from '../hooks';
import { RENEWAL_LABELS, renewalByMonth, renewalDueLabel, type RenewalKind } from '../domain';

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Enregistrement impossible : réessaie';

/** Date lue sur l'étiquette par l'assistant : hayon (MMAAAA) et contrôle technique seulement. */
async function readDue(kind: RenewalKind, fileId: string): Promise<{ due: string | null; text: string }> {
  if (kind === 'tailgate') {
    const reading = await readTailgateLabel(fileId);
    return { due: monthFromLabel(reading.due_month), text: reading.label_text };
  }
  const reading = await readTechnicalInspection(fileId);
  return { due: reading.next_due_date, text: reading.label_text };
}

/**
 * Nouvelle étiquette photographiée après un renouvellement : date du prochain contrôle (lue par
 * l'assistant quand c'est possible, sinon saisie), comparée à l'ancienne, puis enregistrée sur le
 * véhicule et dans son historique.
 */
export function RenewalDialog({
  kind,
  fileId,
  repairOrderId,
  vehicleId,
  done,
  scan,
  onClose,
}: {
  kind: RenewalKind;
  fileId: string;
  repairOrderId: string;
  vehicleId: string;
  /** Renouvellement déjà enregistré sur l'OR (nouvelle photo : date corrigée). */
  done: DeadlineRenewal | undefined;
  /** Lecture automatique activée par la direction. */
  scan: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const deadlines = useVehicleDeadlines(vehicleId);
  // Échéance avant le renouvellement : celle gardée à la première photo, sinon celle du véhicule
  // (extincteurs : pas de date sur la fiche, comptés depuis les passages à l'atelier)
  const vehicleDue =
    kind === 'ct'
      ? deadlines.data?.ct_due_date
      : kind === 'tailgate'
        ? deadlines.data?.tailgate_due_date
        : kind === 'antipollution'
          ? deadlines.data?.antipollution_due_date
          : null;
  const previous = done ? done.previous_due : (vehicleDue ?? null);
  const readable = scan && (kind === 'tailgate' || kind === 'ct');
  const reading = useQuery({
    queryKey: ['label-read', 'renewal', kind, fileId],
    queryFn: () => readDue(kind, fileId),
    enabled: readable,
    retry: false,
    staleTime: Infinity,
  });
  const [edited, setEdited] = useState<string | null>(null);
  const byMonth = renewalByMonth(kind);
  const due = edited ?? reading.data?.due ?? '';
  const label = RENEWAL_LABELS[kind];
  // Même échéance qu'avant (ou plus ancienne) : sans doute l'ancienne étiquette
  const notLater = Boolean(
    due && previous && due.slice(0, byMonth ? 7 : 10) <= previous.slice(0, byMonth ? 7 : 10),
  );

  const save = useMutation({
    mutationFn: () => recordRenewal({ repairOrderId, kind, newDue: due, fileId }),
    onSuccess: async () => {
      toast.success(`${label} renouvelé : prochain ${renewalDueLabel(kind, due)}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['renewals', repairOrderId] }),
        queryClient.invalidateQueries({ queryKey: ['vehicles', vehicleId] }),
      ]);
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvelle étiquette : {label.toLowerCase()}</DialogTitle>
          <DialogDescription>
            La photo est ajoutée à l’OR. Vérifie la date du prochain contrôle avant de valider.
          </DialogDescription>
        </DialogHeader>

        <div className="col gap-3">
          {readable && reading.isPending && (
            <p className="row gap-2 text-sm" role="status">
              <ScanText className="i s shrink-0 animate-pulse" /> Lecture de l’étiquette en cours…
            </p>
          )}
          {readable && reading.isError && (
            <p className="alert s-warn" role="alert">
              {readingFailedMessage(reading.error)}
            </p>
          )}
          {reading.data?.text && <p className="hint">Lu sur l’étiquette : « {reading.data.text} »</p>}
          {byMonth ? (
            <MonthYearField
              id="renewal-due"
              label={`Prochain ${label.toLowerCase()}`}
              value={due}
              onChange={setEdited}
            />
          ) : (
            <div className="field">
              <Label htmlFor="renewal-due">Prochain {label.toLowerCase()}</Label>
              <Input
                id="renewal-due"
                type="date"
                value={due}
                onChange={(event) => setEdited(event.target.value)}
              />
            </div>
          )}
          <div className="col gap-1 border-t pt-3 text-sm">
            <span className="text-muted-foreground">
              Avant : {previous ? renewalDueLabel(kind, previous) : 'non renseigné'}
            </span>
            {due && <span className="font-semibold text-success">Après : {renewalDueLabel(kind, due)}</span>}
          </div>
          {notLater && (
            <p className="alert s-warn" role="alert">
              La date est la même qu’avant (ou plus ancienne) : c’est bien la nouvelle étiquette ?
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={!due || save.isPending} onClick={() => save.mutate()}>
            Valider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
