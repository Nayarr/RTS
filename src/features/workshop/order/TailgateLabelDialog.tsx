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
import { MonthYearField } from '@/components/MonthYearField';
import { monthFromLabel, monthLabel } from '@/lib/month';
import { cn } from '@/lib/utils';
import { readTailgateLabel, updateDeadlines } from '../api';
import { tailgateVerdict } from '../domain';
import { READING_FAILED, readingFailedMessage } from '@/lib/reading';

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Enregistrement impossible : réessaie';

/**
 * Lecture automatique de l'étiquette du contrôle hayon qui vient d'être photographiée : date
 * proposée (modifiable), verdict, puis enregistrement de l'échéance du véhicule et du contrôle.
 */
export function TailgateLabelDialog({
  fileId,
  repairOrderId,
  vehicleId,
  onApply,
  onClose,
}: {
  fileId: string;
  repairOrderId: string;
  vehicleId: string;
  onApply: (verdict: 'OK' | 'HS') => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const reading = useQuery({
    queryKey: ['label-read', fileId],
    queryFn: () => readTailgateLabel(fileId),
    retry: false,
    staleTime: Infinity,
  });
  // Mois modifié par le technicien ; sinon celui lu sur l'étiquette (MMAAAA).
  const [edited, setEdited] = useState<string | null>(null);
  const date = edited ?? monthFromLabel(reading.data?.due_month) ?? '';
  const lastControl = monthFromLabel(reading.data?.last_control_month);
  const verdict = date ? tailgateVerdict(date) : null;

  const save = useMutation({
    mutationFn: () => updateDeadlines(repairOrderId, { tailgate_due_date: date }),
    onSuccess: async () => {
      if (verdict) {
        onApply(verdict.value);
        toast.success(`Contrôle hayon : ${verdict.value === 'OK' ? 'OK' : 'À FAIRE'}`);
      }
      await queryClient.invalidateQueries({ queryKey: ['vehicles', vehicleId, 'deadlines'] });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lecture de l’étiquette du hayon</DialogTitle>
          <DialogDescription>
            La photo est ajoutée à l’OR. Vérifie le mois et l’année avant de valider.
          </DialogDescription>
        </DialogHeader>

        {reading.isPending && (
          <p className="row gap-2 py-4 text-sm" role="status">
            <ScanText className="i s shrink-0 animate-pulse" /> Lecture de l’étiquette en cours…
          </p>
        )}
        {reading.isError && (
          <p className="alert s-warn" role="alert">
            {readingFailedMessage(reading.error)}
          </p>
        )}
        {reading.isSuccess && (
          <div className="col gap-3">
            {reading.data.label_text && (
              <p className="hint">Lu sur l’étiquette : « {reading.data.label_text} »</p>
            )}
            {lastControl && (
              <p className="text-sm">
                Dernier contrôle : <b>{monthLabel(lastControl)}</b>
              </p>
            )}
            {!reading.data.due_month && (
              <p className="alert s-warn" role="alert">
                {READING_FAILED}
              </p>
            )}
            {reading.data.due_month && reading.data.confidence !== 'haute' && (
              <p className="alert s-warn">Lecture incertaine : vérifie le mois et l’année sur l’étiquette.</p>
            )}
            <MonthYearField
              id="tailgate-scan"
              label="Prochain contrôle hayon (modifiable)"
              value={date}
              onChange={setEdited}
            />
            {verdict && (
              <p
                className={cn(
                  'text-base font-bold',
                  verdict.value === 'OK' ? 'text-success' : 'text-destructive',
                )}
                role="status"
              >
                {verdict.label}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {reading.isSuccess ? 'Annuler' : 'Fermer'}
          </Button>
          {reading.isSuccess && (
            <Button disabled={!date || save.isPending} onClick={() => save.mutate()}>
              Valider
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
