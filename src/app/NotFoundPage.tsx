import { Link } from 'react-router';
import { House } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Lien cassé ou écran supprimé (maquette « 404 »). */
export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="col max-w-[520px] items-center gap-[18px] text-center">
        <span
          aria-hidden
          className="font-display text-[110px] leading-[.9] font-bold text-primary sm:text-[140px]"
        >
          404
        </span>
        <h1 className="title xl">Page introuvable</h1>
        <p className="sub text-base!">Cette page n’existe pas ou a été déplacée.</p>
        <Button asChild size="lg">
          <Link to="/">
            <House /> Retour à l’accueil
          </Link>
        </Button>
      </div>
    </main>
  );
}
