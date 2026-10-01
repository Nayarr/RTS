import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { completeRepairOrder } from '../api';
import { useWorkshopMutation } from '../hooks';

/**
 * « Travaux terminés » : le technicien indique si un devis est nécessaire, puis la base vérifie
 * qu'un temps est saisi sur chaque travail effectué, arrête le chrono et verrouille l'OR.
 * Le bureau valide ensuite le passage en facturation.
 */
export function FinishSection({ repairOrderId }: { repairOrderId: string }) {
  const navigate = useNavigate();
  const [quoteNeeded, setQuoteNeeded] = useState<boolean | null>(null);
  const complete = useWorkshopMutation(
    repairOrderId,
    async (needed: boolean) => {
      await completeRepairOrder(repairOrderId, needed);
      await navigate('/', { replace: true });
    },
    'Travaux marqués comme terminés',
  );

  const choice = (value: boolean, label: string) => (
    <Button
      type="button"
      size="lg"
      variant="outline"
      aria-pressed={quoteNeeded === value}
      className={cn(quoteNeeded === value && 'border-primary bg-accent text-accent-foreground')}
      onClick={() => setQuoteNeeded(value)}
    >
      {label}
    </Button>
  );

  return (
    <section data-slot="card" className="card sec" aria-labelledby="tech-finish">
      <h2 className="sec-t" id="tech-finish">
        Terminer
      </h2>
      <span className="lbl" id="tech-quote-needed">
        Devis nécessaire ?
      </span>
      <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="tech-quote-needed">
        {choice(true, 'OUI')}
        {choice(false, 'NON')}
      </div>
      <span className="hint">
        Le passage en « Facture à faire » est validé par le bureau une fois le dossier vérifié.
      </span>
      <Button
        size="lg"
        className="h-14! w-full text-base"
        disabled={quoteNeeded === null || complete.isPending}
        onClick={() => quoteNeeded !== null && complete.mutate(quoteNeeded)}
      >
        <CircleCheck /> Travaux terminés
      </Button>
    </section>
  );
}
