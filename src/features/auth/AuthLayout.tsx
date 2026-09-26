import type { ReactNode } from 'react';
import { Brand } from '@/components/Brand';

/** Mise en page des écrans hors connexion (connexion, nouveau mot de passe). */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-8">
        <Brand size="lg" subtitle="Rapid Truck Service" />
        {children}
      </div>
    </main>
  );
}
