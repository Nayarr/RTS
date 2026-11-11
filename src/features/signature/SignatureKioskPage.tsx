import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileSignature, PenLine, Settings } from 'lucide-react';
import { SignaturePad } from '@/components/SignaturePad';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSignaturePad } from '@/components/use-signature-pad';
import { uploadFile } from '@/features/files/api';
import { fetchCompanyName } from '@/features/kiosk/api';
import { ExitDialog } from '@/features/kiosk/ExitDialog';
import { useKioskMode } from '@/features/kiosk/use-kiosk-mode';
import { useNow } from '@/features/kiosk/use-now';
import { RoadsideSummary } from '@/features/repair-orders/RoadsideSummary';
import { TaskList } from '@/features/repair-orders/TaskList';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import { fetchKioskPendingSignatures, kioskSign, kioskSignatureKey, type KioskSignatureRequest } from './api';
import { remainingPercent } from './domain';
import { useCountdown } from './use-countdown';

/** Sous 30 s, le compte à rebours passe en orange. */
const URGENT_SECONDS = 30;

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Signature non enregistrée : réessayez.';

const documentName = (request: KioskSignatureRequest) =>
  request.kind === 'quote' ? `Devis ${request.number}` : `Ordre de réparation ${request.number}`;

const signatureTitle = (request: KioskSignatureRequest) =>
  request.kind === 'quote'
    ? `Signature du devis ${request.number}`
    : `Signature de l’ordre de réparation ${request.number}`;

/** Barre du temps restant d'une demande (orange sous 30 s). */
function TimeLeft({ seconds, className }: { seconds: number; className?: string }) {
  const urgent = seconds < URGENT_SECONDS;
  return (
    <div
      className={cn('col gap-1.5', className)}
      role="timer"
      aria-label={`Temps restant : ${seconds} secondes`}
    >
      <div className="h-2 overflow-hidden rounded bg-muted">
        <i
          className={cn(
            'block h-full rounded transition-[width] duration-300 ease-linear',
            urgent ? 'bg-warning' : 'bg-primary',
          )}
          style={{ width: `${remainingPercent(seconds)}%` }}
        />
      </div>
      <span className={cn('hint text-right', urgent && 'text-warning')}>Disparaît dans {seconds} s</span>
    </div>
  );
}

/** Fenêtre de signature : le document, le nom du client, la zone de signature et le temps restant. */
function SignatureForm({
  request,
  readAt,
  onDone,
}: {
  request: KioskSignatureRequest;
  readAt: number;
  /** Fermeture : signé (après le merci), minute écoulée ou « Retour à la liste ». */
  onDone: () => void;
}) {
  const pad = useSignaturePad();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState(false);
  const seconds = useCountdown(request.seconds_left, readAt, !thanks);

  const sign = useMutation({
    mutationFn: async () => {
      const blob = await pad.toBlob();
      if (!blob) throw new Error('Signez dans le cadre ci-dessous.');
      const fileId = await uploadFile(blob, { category: 'signature', name: 'signature-client.png' });
      await kioskSign(request.id, name.trim(), fileId);
    },
    onSuccess: () => {
      setThanks(true);
      window.setTimeout(onDone, 3000);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  // Minute écoulée : la fenêtre disparaît (la demande expire aussi côté serveur).
  const timedOut = !thanks && seconds === 0 && !sign.isPending;
  useEffect(() => {
    if (timedOut) onDone();
  }, [timedOut, onDone]);

  if (thanks) {
    return (
      <div className="col items-center gap-3 py-8 text-center" role="status">
        <CheckCircle2 className="size-12 text-success" />
        <p className="text-lg font-semibold">Merci, votre signature est enregistrée.</p>
      </div>
    );
  }

  return (
    <div className="col gap-4">
      <TimeLeft seconds={seconds} />
      {request.roadside && (
        <RoadsideSummary roadside={request.roadside} className="rounded-[10px] border px-4 py-3" />
      )}
      <div className="col gap-1 rounded-[10px] border px-4 py-3">
        <span className="row wrap gap-x-3">
          <b className="plate text-lg">{request.vehicle_plate ?? '-'}</b>
          <span className="muted">{request.client_name ?? ''}</span>
        </span>
        <TaskList text={request.requested_work} className="text-[15px]" />
        {request.kind === 'quote' && typeof request.total_ttc === 'number' && (
          <p className="row justify-between border-t pt-2 text-base">
            <span>Total TTC</span>
            <b className="num">{formatEuro(request.total_ttc)}</b>
          </p>
        )}
      </div>
      <div className="field">
        <Label htmlFor="kiosk-signer">Votre nom (facultatif)</Label>
        <Input
          id="kiosk-signer"
          autoComplete="off"
          className="h-12 text-base!"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="field">
        <span className="lbl">Signez dans le cadre :</span>
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
      <div className="grid grid-cols-[auto_1fr] gap-3">
        <Button
          size="lg"
          variant="outline"
          className="h-14! text-base"
          disabled={sign.isPending}
          onClick={onDone}
        >
          Retour à la liste
        </Button>
        <Button
          size="lg"
          className="h-14! text-base"
          disabled={pad.isEmpty || sign.isPending}
          onClick={() => {
            setError(null);
            sign.mutate();
          }}
        >
          <PenLine /> {sign.isPending ? 'Enregistrement…' : 'Valider ma signature'}
        </Button>
      </div>
    </div>
  );
}

/** Une demande en attente : document, véhicule, travaux, temps restant et bouton « Signer ». */
function RequestCard({
  request,
  readAt,
  onSign,
}: {
  request: KioskSignatureRequest;
  readAt: number;
  onSign: () => void;
}) {
  const seconds = useCountdown(request.seconds_left, readAt, true);
  // Minute écoulée : la demande disparaît de la liste (elle expire aussi côté serveur).
  if (seconds === 0) return null;
  const name = documentName(request);
  return (
    <li className="card grid gap-5 p-6 md:grid-cols-[1fr_240px] md:items-center" aria-label={name}>
      <div className="col min-w-0 gap-2">
        <h2 className="text-[22px] leading-tight font-semibold">{name}</h2>
        <span className="row wrap gap-x-3">
          <b className="plate text-base">{request.vehicle_plate ?? '-'}</b>
          <span className="muted">{request.client_name ?? ''}</span>
        </span>
        <TaskList text={request.requested_work} className="text-[15px]" />
      </div>
      <div className="col gap-2.5">
        {request.kind === 'quote' && typeof request.total_ttc === 'number' && (
          <p className="col gap-0 text-right">
            <span className="hint">Total TTC</span>
            <b className="num text-2xl">{formatEuro(request.total_ttc)}</b>
          </p>
        )}
        <TimeLeft seconds={seconds} />
        <Button size="lg" className="h-14! w-full text-base" aria-label={`Signer : ${name}`} onClick={onSign}>
          <PenLine /> Signer
        </Button>
      </div>
    </li>
  );
}

/**
 * Compte « Borne signature » : les demandes envoyées par l'accueil (devis ou OR, client sur place)
 * s'affichent en liste, chacune pendant 1 minute ; le client touche « Signer » sur la sienne.
 */
export function SignatureKioskPage() {
  useKioskMode();
  const now = useNow();
  const queryClient = useQueryClient();
  const company = useQuery({
    queryKey: ['kiosk', 'company-name'],
    queryFn: fetchCompanyName,
    staleTime: Infinity,
  });
  const pending = useQuery({
    queryKey: kioskSignatureKey,
    queryFn: fetchKioskPendingSignatures,
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });
  // Demande ouverte : gardée jusqu'à sa fermeture (le « merci » reste après la signature).
  const [signing, setSigning] = useState<{ request: KioskSignatureRequest; readAt: number } | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const requests = pending.data ?? [];

  const close = () => {
    setSigning(null);
    void queryClient.invalidateQueries({ queryKey: kioskSignatureKey });
  };

  return (
    <div className="col fixed inset-0 z-50 gap-6 overflow-y-auto bg-background p-6 select-none lg:px-12 lg:py-10">
      <header className="row items-start justify-between gap-6">
        <div className="col gap-1">
          <div className="row gap-3">
            <img src="/icons/icon-192.png" alt="" className="size-12 rounded-[8px] bg-white p-0.5" />
            <b className="font-display text-2xl leading-tight">{company.data ?? 'RTS Atelier'}</b>
          </div>
          <h1 className="title mt-3 text-[30px]!">Signature client</h1>
          {requests.length > 0 && <span className="sub">Touchez « Signer » sur votre document</span>}
        </div>
        <div className="col items-end gap-0" aria-label="Heure">
          <span className="num font-display text-[56px] leading-none font-bold">
            {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="sub first-letter:uppercase">
            {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        </div>
      </header>

      {requests.length > 0 ? (
        <ul className="col gap-4" aria-label="Documents à signer">
          {requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              readAt={pending.dataUpdatedAt}
              onSign={() => setSigning({ request, readAt: pending.dataUpdatedAt })}
            />
          ))}
        </ul>
      ) : (
        <div className="col grow items-center justify-center gap-3 text-center" role="status">
          <span className="grid size-24 place-items-center rounded-full bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]">
            <FileSignature className="size-10 text-primary" />
          </span>
          <p className="text-2xl font-semibold">Aucun document à signer pour le moment</p>
          <p className="sub max-w-md">
            Les devis et ordres de réparation envoyés par l’accueil s’affichent ici. Chaque demande reste 1
            minute.
          </p>
        </div>
      )}

      <Dialog open={signing !== null}>
        <DialogContent showCloseButton={false} className="max-h-[94dvh] overflow-y-auto sm:max-w-xl">
          {signing && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[22px]">{signatureTitle(signing.request)}</DialogTitle>
                <DialogDescription>
                  {signing.request.kind === 'quote'
                    ? 'En signant, vous acceptez ce devis et les travaux ci-dessous.'
                    : 'En signant, vous autorisez l’atelier à réaliser les travaux ci-dessous.'}
                </DialogDescription>
              </DialogHeader>
              <SignatureForm
                key={signing.request.id}
                request={signing.request}
                readAt={signing.readAt}
                onDone={close}
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      <button
        type="button"
        aria-label="Quitter la borne"
        onClick={() => setExitOpen(true)}
        className="ibtn ghost absolute right-3.5 bottom-3.5 opacity-50 hover:opacity-100"
      >
        <Settings className="size-[18px]" />
      </button>
      {exitOpen && <ExitDialog allowTv={false} onClose={() => setExitOpen(false)} />}
    </div>
  );
}
