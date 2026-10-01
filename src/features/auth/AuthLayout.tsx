import type { ReactNode } from 'react';

function Logo({ large = false }: { large?: boolean }) {
  return (
    <div className="row gap-3">
      <img
        src="/icons/icon-192.png"
        alt=""
        className={
          large ? 'size-[52px] rounded-xl bg-white p-[3px]' : 'size-11 rounded-[10px] bg-white p-0.5'
        }
      />
      <div className="col gap-0">
        <b
          className={
            large ? 'font-display text-[26px] leading-tight' : 'font-display text-[22px] leading-tight'
          }
        >
          RTS Atelier
        </b>
        <span
          className={
            large ? 'text-xs tracking-widest uppercase opacity-75' : 'text-[12.5px] text-muted-foreground'
          }
        >
          Rapid Truck Service
        </span>
      </div>
    </div>
  );
}

/** Connexion : bandeau vert à gauche (grand écran), formulaire à droite (maquette « Connexion »). */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#0d4f10] p-12 text-white lg:flex dark:bg-[#0f2a12]">
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] bg-size-[48px_48px]"
        />
        <div className="relative">
          <Logo large />
        </div>
        <div className="col relative max-w-[520px] gap-4">
          <p className="font-display text-[52px] leading-none font-bold">
            L’atelier poids lourds, de l’arrivée du camion à la facture.
          </p>
          <p className="text-base leading-normal opacity-80">
            OR, planning, devis signés en ligne, facturation et pointage — sur l’ordinateur du bureau comme
            sur le téléphone des techniciens.
          </p>
        </div>
        <span className="relative text-[13px] opacity-60">
          19 rue Gaston Monmousseau, 95190 Goussainville
        </span>
      </aside>
      <main className="flex items-center justify-center bg-background px-4 py-10">
        <div className="col w-full max-w-[400px] gap-[26px]">
          <div className="lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

/** Écran isolé dans une carte centrée (maquette « Nouveau mot de passe »). */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="card col w-full max-w-[440px] gap-[22px] p-6 sm:p-8">
        <Logo />
        {children}
      </div>
    </main>
  );
}
