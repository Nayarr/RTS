import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { completeRepairOrder } from '../api';
import { useWorkshopMutation } from '../hooks';

/**
 * « Travaux terminés » : le technicien indique si un devis est nécessaire, puis la base vérifie
 * les temps estimés, la taille des pneus à changer et la photo du hayon HS, arrête le chrono et
 * verrouille l'OR. Le bureau valide ensuite le passage en facturation.
 */
export function FinishSection({
  repairOrderId,
  blockers,
}: {
  repairOrderId: string;
  /** Ce qu'il reste à compléter (mêmes règles que la base) : le bouton attend que tout soit fait. */
  blockers: string[];
}) {
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
      {blockers.length > 0 && (
        <div className="alert s-warn items-start!" role="status" aria-labelledby="tech-finish-blockers">
          <TriangleAlert className="i s mt-0.5 shrink-0" />
          <div className="col gap-1">
            <b id="tech-finish-blockers">À compléter avant de terminer</b>
            <ul className="col list-disc gap-0.5 pl-4">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <Button
        size="lg"
        className="h-14! w-full text-base"
        disabled={quoteNeeded === null || blockers.length > 0 || complete.isPending}
        onClick={() => quoteNeeded !== null && complete.mutate(quoteNeeded)}
      >
        <CircleCheck /> Travaux terminés
      </Button>
    </section>
  );
}
