import { Link } from 'react-router';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuoteNumber } from './hooks';

/** « Devis D00012 » : ouvre le devis d'où vient l'OR (OR créé depuis un devis) ; rien sinon. */
export function OriginQuoteButton({ quoteId }: { quoteId: string | null }) {
  const number = useQuoteNumber(quoteId);
  if (!quoteId) return null;
  const label = number.data ? `Devis ${number.data}` : 'Devis d’origine';
  return (
    <Button variant="outline" asChild>
      <Link to={`/devis/${quoteId}`}>
        <FileText /> {label}
      </Link>
    </Button>
  );
}
