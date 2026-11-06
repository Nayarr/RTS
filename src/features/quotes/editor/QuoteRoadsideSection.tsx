import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { roadsideProblem, type RoadsideValue } from '@/features/repair-orders/roadside';
import { RoadsideFields } from '@/features/repair-orders/RoadsideFields';
import { useSettings } from '@/features/settings/hooks';
import { fetchQuoteRoadside, saveQuoteRoadside, type QuoteOverview } from '../api';
import { quotesKey, useQuoteMutation } from '../hooks';

function Section({ children }: { children: React.ReactNode }) {
  return (
    <section aria-label="Lieu d’intervention" className="col gap-3 border-b px-6 py-4">
      <h3 className="h3 row gap-2 font-sans tracking-normal">
        <MapPin className="i s" /> Lieu d’intervention
      </h3>
      {children}
    </section>
  );
}

function Editor({ quoteId, saved }: { quoteId: string; saved: RoadsideValue }) {
  const settings = useSettings();
  const [value, setValue] = useState(saved);
  const save = useQuoteMutation(
    (next: RoadsideValue) => saveQuoteRoadside(quoteId, next),
    'Dépannage enregistré',
  );
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  return (
    <Section>
      <RoadsideFields value={value} onChange={setValue} />
      {dirty && (
        <div className="row justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setValue(saved)}>
            Annuler
          </Button>
          <Button
            size="sm"
            disabled={save.isPending}
            onClick={() => {
              const problem = roadsideProblem(value, settings.data?.app);
              if (problem) toast.error(problem);
              else save.mutate(value);
            }}
          >
            Enregistrer
          </Button>
        </div>
      )}
    </Section>
  );
}

/**
 * Éditeur de devis : dépannage extérieur, avec sa ligne de déplacement. Si l'OR du devis est déjà un
 * dépannage, il se règle sur la fiche de l'OR (qui le facture).
 */
export function QuoteRoadsideSection({ quote, locked }: { quote: QuoteOverview; locked: boolean }) {
  const roadside = useQuery({
    queryKey: [...quotesKey, quote.id, 'roadside'],
    queryFn: () => fetchQuoteRoadside(quote.id, quote.repair_order_id),
  });
  if (!roadside.data) return null;
  const { own, orderAddress } = roadside.data;

  if (orderAddress !== null) {
    return (
      <Section>
        <p className="text-[13.5px]">
          Dépannage extérieur : <b>{orderAddress}</b>
          {!locked && (
            <>
              {' · '}
              <Link className="link" to={`/or/${quote.repair_order_id}`}>
                à modifier sur l’OR
              </Link>
            </>
          )}
        </p>
      </Section>
    );
  }
  if (locked) {
    if (!own.enabled) return null;
    return (
      <Section>
        <p className="text-[13.5px]">
          Dépannage extérieur : <b>{own.address}</b>
        </p>
      </Section>
    );
  }
  // Après enregistrement : on repart de la valeur relue
  return <Editor key={JSON.stringify(own)} quoteId={quote.id} saved={own} />;
}
