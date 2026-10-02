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
import { formatDate } from '@/features/repair-orders/constants';
import { cn } from '@/lib/utils';
import { readTailgateLabel, updateDeadlines } from '../api';
import { tailgateVerdict } from '../domain';

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Lecture impossible : saisis la date à la main';

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
  // Date modifiée par le technicien ; sinon celle lue sur l'étiquette.
  const [edited, setEdited] = useState<string | null>(null);
  const date = edited ?? reading.data?.next_due_date ?? '';
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
            La photo est ajoutée à l’OR. Vérifie la date avant de valider.
          </DialogDescription>
        </DialogHeader>

        {reading.isPending && (
          <p className="row gap-2 py-4 text-sm" role="status">
            <ScanText className="i s shrink-0 animate-pulse" /> Lecture de l’étiquette en cours…
          </p>
        )}
        {reading.isError && (
          <p className="alert s-warn" role="alert">
            {errorMessage(reading.error)}
          </p>
        )}
        {reading.isSuccess && (
          <div className="col gap-3">
            {reading.data.label_text && (
              <p className="hint">Lu sur l’étiquette : « {reading.data.label_text} »</p>
            )}
            {reading.data.last_control_date && (
              <p className="text-sm">
                Dernier contrôle : <b>{formatDate(reading.data.last_control_date)}</b>
              </p>
            )}
            {!reading.data.next_due_date && (
              <p className="err">Aucune date trouvée sur la photo : saisis-la à la main.</p>
            )}
            {reading.data.next_due_date && reading.data.confidence !== 'haute' && (
              <p className="alert s-warn">Lecture incertaine : vérifie la date sur l’étiquette.</p>
            )}
            <div className="field">
              <Label htmlFor="tailgate-scan-date">Prochain contrôle hayon (modifiable)</Label>
              <Input
                id="tailgate-scan-date"
                type="date"
                value={date}
                onChange={(event) => setEdited(event.target.value)}
              />
            </div>
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
