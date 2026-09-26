import { Link } from 'react-router';
import { FullPageMessage } from '@/components/FullPageMessage';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <FullPageMessage title="Page introuvable">
      <p className="text-muted-foreground">Cette page n’existe pas ou a été déplacée.</p>
      <Button asChild>
        <Link to="/">Retour à l’accueil</Link>
      </Button>
    </FullPageMessage>
  );
}
