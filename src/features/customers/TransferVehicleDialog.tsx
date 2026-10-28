import { useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { SuggestField } from '@/components/SuggestField';
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
import { Textarea } from '@/components/ui/textarea';
import { useClientSuggestions } from '@/features/repair-orders/hooks';
import { transferVehicle, type VehicleOverview } from './api';
import { useCustomerMutation } from './hooks';

/**
 * Véhicule racheté par un autre client : il passe chez le nouveau propriétaire, son historique
 * reste entier sur la fiche. Les OR, devis et factures déjà faits restent à l'ancien.
 */
export function TransferVehicleDialog({
  vehicle,
  onClose,
}: {
  vehicle: Pick<VehicleOverview, 'id' | 'plate' | 'client_id' | 'client_name'>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [client, setClient] = useState<{ id: string; name: string } | null>(null);
  const [note, setNote] = useState('');
  const suggestions = (useClientSuggestions(query).data ?? []).filter(
    (item) => item.id !== vehicle.client_id,
  );
  const transfer = useCustomerMutation(
    (target: { id: string; name: string }) => transferVehicle(vehicle.id, target.id, note),
    `${vehicle.plate} transféré`,
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Transférer {vehicle.plate} à un autre client</DialogTitle>
          <DialogDescription>
            Véhicule racheté par un autre client : il passe sur sa fiche, l’historique reste entier sur la
            fiche du véhicule.
          </DialogDescription>
        </DialogHeader>
        <div className="col gap-3.5">
          <p className="text-[13.5px]">
            <span className="muted">Propriétaire actuel : </span>
            {vehicle.client_name ?? 'sans client'}
          </p>
          <SuggestField
            id="transfer-client"
            label="Nouveau propriétaire"
            placeholder="Nom du client / société"
            autoComplete="off"
            value={client?.name ?? query}
            onValueChange={(value) => {
              setClient(null);
              setQuery(value);
            }}
            suggestions={suggestions.map((item) => ({ key: item.id, label: item.name }))}
            onPick={(item) => setClient({ id: item.key, name: item.label })}
            hint={client ? undefined : 'Client déjà en base : choisis-le dans la liste.'}
          />
          <div className="field">
            <Label htmlFor="transfer-note">Motif (facultatif)</Label>
            <Textarea
              id="transfer-note"
              rows={2}
              placeholder="Ex. : racheté le 15/10 avec la flotte"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <ul className="hint col list-disc gap-1 pl-4">
            <li>Les OR, devis et factures déjà faits restent à l’ancien propriétaire.</li>
            <li>
              Le véhicule sort de son contrat d’entretien, puis de son espace client une fois ses OR facturés.
            </li>
            <li>Les prochains OR, rendez-vous et rappels d’échéance vont au nouveau propriétaire.</li>
          </ul>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={!client || transfer.isPending}
            onClick={() => client && transfer.mutate(client, { onSuccess: onClose })}
          >
            <ArrowRightLeft /> Transférer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
