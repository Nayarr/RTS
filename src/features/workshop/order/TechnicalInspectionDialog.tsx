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
import { formatDate, normalizeKey } from '@/features/repair-orders/constants';
import { readTechnicalInspection, updateDeadlines } from '../api';
import { isVin, normalizeVin } from '../domain';

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Lecture impossible : saisis la date à la main';

/**
 * Lecture automatique du contrôle technique qui vient d'être photographié : VIN proposé (et date du
 * prochain contrôle sur un procès-verbal), modifiables, puis enregistrés sur la fiche véhicule.
 * La plaque lue est comparée à celle de l'OR.
 */
export function TechnicalInspectionDialog({
  fileId,
  repairOrderId,
  vehicleId,
  plate,
  onClose,
}: {
  fileId: string;
  repairOrderId: string;
  vehicleId: string;
  /** Plaque du véhicule de l'OR. */
  plate: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const reading = useQuery({
    queryKey: ['label-read', 'technical_inspection', fileId],
    queryFn: () => readTechnicalInspection(fileId),
    retry: false,
    staleTime: Infinity,
  });
  // Valeurs modifiées par le technicien ; sinon celles lues sur le document.
  const [editedDate, setEditedDate] = useState<string | null>(null);
  const [editedVin, setEditedVin] = useState<string | null>(null);
  const date = editedDate ?? reading.data?.next_due_date ?? '';
  const vin = normalizeVin(editedVin ?? reading.data?.vin ?? '');
  const vinError = vin && !isVin(vin) ? 'VIN : 17 caractères (lettres sauf I, O, Q, et chiffres)' : null;
  const readPlate = reading.data?.plate ?? null;
  const otherPlate = readPlate && plate && normalizeKey(readPlate) !== normalizeKey(plate);

  const save = useMutation({
    mutationFn: () =>
      updateDeadlines(repairOrderId, { ...(date ? { ct_due_date: date } : {}), ...(vin ? { vin } : {}) }),
    onSuccess: async () => {
      toast.success('Contrôle technique enregistré sur le véhicule');
      await queryClient.invalidateQueries({ queryKey: ['vehicles', vehicleId, 'deadlines'] });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lecture du contrôle technique</DialogTitle>
          <DialogDescription>
            La photo est ajoutée à l’OR. Vérifie le VIN (numéro de série) avant de valider.
          </DialogDescription>
        </DialogHeader>

        {reading.isPending && (
          <p className="row gap-2 py-4 text-sm" role="status">
            <ScanText className="i s shrink-0 animate-pulse" /> Lecture du contrôle technique en cours…
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
              <p className="hint">Lu sur le document : « {reading.data.label_text} »</p>
            )}
            {readPlate && (
              <p className={otherPlate ? 'alert s-warn' : 'text-sm'} role={otherPlate ? 'alert' : undefined}>
                Immatriculation lue : <b className="plate">{readPlate}</b>
                {otherPlate && ` · différente de l’OR (${plate}) : vérifie qu’il s’agit du bon véhicule.`}
              </p>
            )}
            {reading.data.last_control_date && (
              <p className="text-sm">
                Contrôle du : <b>{formatDate(reading.data.last_control_date)}</b>
              </p>
            )}
            {!reading.data.next_due_date && (
              <p className="hint">Date d’échéance non lue (vignette) : saisis-la à la main si besoin.</p>
            )}
            {(reading.data.next_due_date || reading.data.vin) && reading.data.confidence !== 'haute' && (
              <p className="alert s-warn">Lecture incertaine : vérifie sur le document.</p>
            )}
            <div className="field">
              <Label htmlFor="ct-scan-date">Prochain contrôle technique (modifiable)</Label>
              <Input
                id="ct-scan-date"
                type="date"
                value={date}
                onChange={(event) => setEditedDate(event.target.value)}
              />
            </div>
            <div className="field">
              <Label htmlFor="ct-scan-vin">VIN · numéro de série (modifiable)</Label>
              <Input
                id="ct-scan-vin"
                className="font-mono uppercase"
                maxLength={20}
                autoComplete="off"
                aria-invalid={vinError ? true : undefined}
                aria-describedby={vinError ? 'ct-scan-vin-error' : undefined}
                value={vin}
                placeholder="Non lu"
                onChange={(event) => setEditedVin(event.target.value)}
              />
              {vinError && (
                <p id="ct-scan-vin-error" className="err">
                  {vinError}
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {reading.isSuccess ? 'Annuler' : 'Fermer'}
          </Button>
          {reading.isSuccess && (
            <Button disabled={(!date && !vin) || !!vinError || save.isPending} onClick={() => save.mutate()}>
              Valider
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
