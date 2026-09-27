import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { completeRepairOrder } from '../api';
import { useWorkshopMutation } from '../hooks';

/**
 * « Terminer l'intervention » : la base vérifie qu'un temps est saisi sur chaque travail effectué,
 * arrête le chrono et verrouille l'OR. Le bureau valide ensuite le passage en facturation.
 */
export function FinishSection({ repairOrderId }: { repairOrderId: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const complete = useWorkshopMutation(
    repairOrderId,
    async (quoteNeeded: boolean) => {
      await completeRepairOrder(repairOrderId, quoteNeeded);
      await navigate('/', { replace: true });
    },
    'Travaux marqués comme terminés',
  );

  return (
    <>
      <Button size="lg" className="h-14 w-full text-lg" onClick={() => setOpen(true)}>
        <Check /> Terminer l’intervention
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Devis nécessaire ?</DialogTitle>
            <DialogDescription>
              Un devis est-il nécessaire avant facturation ? Le passage en « Facture à faire » est validé par
              le bureau une fois le dossier vérifié.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              size="lg"
              variant="outline"
              disabled={complete.isPending}
              onClick={() => complete.mutate(true, { onError: () => setOpen(false) })}
            >
              <Receipt /> Oui, établir un devis
            </Button>
            <Button
              size="lg"
              disabled={complete.isPending}
              onClick={() => complete.mutate(false, { onError: () => setOpen(false) })}
            >
              <Check /> Non, rien à prévoir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
