import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Info, PenLine, XCircle } from 'lucide-react';
import { SignaturePad } from '@/components/SignaturePad';
import { useSignaturePad } from '@/components/use-signature-pad';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signOnline } from '@/features/signature/api';
import { cn } from '@/lib/utils';
import type { PublicCompany } from './api';

/** Bandeau du haut : identité de l'atelier, et à droite l'état du document ou le client. */
export function PublicHeader({
  company,
  subtitle,
  wide = false,
  children,
}: {
  company: PublicCompany;
  subtitle: string;
  wide?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="mbar h-[72px]! print:hidden">
      <div
        className={cn(
          'mx-auto flex w-full items-center justify-between gap-3',
          wide ? 'max-w-[1040px]' : 'max-w-[880px]',
        )}
      >
        <div className="row min-w-0 gap-3">
          <img src="/icons/icon-192.png" alt="" className="size-11 shrink-0 rounded-[7px] bg-white p-0.5" />
          <div className="col min-w-0 gap-0">
            <b className="truncate font-display text-xl uppercase">{company.legal_name}</b>
            <span className="hint truncate">{subtitle}</span>
          </div>
        </div>
        {children}
      </div>
    </header>
  );
}

/** En-tête du document : titre (DEVIS, FACTURE), références, et client / véhicule à droite. */
export function DocumentHead({ title, meta, aside }: { title: string; meta: ReactNode; aside: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-6 sm:px-7">
      <div className="col gap-1">
        <h1 className="font-display text-[34px] leading-none font-bold tracking-[.06em]">{title}</h1>
        <span className="hint">{meta}</span>
      </div>
      <div className="col gap-1.5 sm:text-right">{aside}</div>
    </div>
  );
}

export function Notice({
  tone,
  children,
}: {
  tone: 's-ok' | 's-bad' | 's-blue' | 's-grey';
  children: ReactNode;
}) {
  const Icon = tone === 's-ok' ? CheckCircle2 : tone === 's-bad' ? XCircle : Info;
  return (
    <p className={cn('alert font-semibold', tone)}>
      <Icon className="i s shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Signature à distance (OR ou contrat de location) : nom + signature dessinée. */
export function OnlineSignatureForm({
  token,
  title,
  submitLabel,
  consent,
}: {
  token: string;
  title: string;
  submitLabel: string;
  /** Case à cocher obligatoire avant de signer (conditions du contrat). */
  consent?: string;
}) {
  const queryClient = useQueryClient();
  const pad = useSignaturePad();
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sign = useMutation({
    mutationFn: () => signOnline({ token, signer_name: name.trim(), signature: pad.toDataUrl() ?? '' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['public-document', token] }),
    onError: (err) =>
      setError(
        err instanceof Error ? err.message : 'Impossible d’enregistrer votre signature. Contactez l’atelier.',
      ),
  });

  const submit = () => {
    setError(null);
    if (!name.trim()) return setError('Merci d’indiquer votre nom.');
    if (consent && !agreed) return setError('Merci de cocher la case pour accepter les conditions.');
    if (pad.isEmpty) return setError('Merci de signer dans le cadre ci-dessous.');
    sign.mutate();
  };

  return (
    <section data-slot="card" className="card print:hidden" aria-labelledby="signature-title">
      <div className="card-h flex-wrap">
        <h2 className="h2 text-[22px]!" id="signature-title">
          {title}
        </h2>
        <span className="hint">L’atelier sera prévenu dès votre signature.</span>
      </div>
      <div className="card-b col gap-4 sm:px-6! sm:py-[22px]!">
        <div className="field max-w-[400px]">
          <Label htmlFor="signer-name">Votre nom</Label>
          <Input
            id="signer-name"
            autoComplete="name"
            className="h-12 text-[15px]!"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        {consent && (
          <label className="row cursor-pointer items-start gap-2.5 text-[14px]">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
            />
            {consent}
          </label>
        )}
        <div className="field">
          <span className="lbl">Signez dans le cadre ci-dessous :</span>
          <div className="relative">
            <SignaturePad pad={pad} label="Signature du client" showClear={false} />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="absolute top-2.5 right-2.5"
              onClick={pad.clear}
              disabled={pad.isEmpty}
            >
              Effacer
            </Button>
          </div>
        </div>
        {error && (
          <p role="alert" className="err">
            {error}
          </p>
        )}
        <Button size="lg" className="self-end" disabled={sign.isPending} onClick={submit}>
          <PenLine /> {submitLabel}
        </Button>
      </div>
    </section>
  );
}
