import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, PenLine } from 'lucide-react';
import { SignaturePad } from '@/components/SignaturePad';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSignaturePad } from '@/components/use-signature-pad';
import { uploadFile } from '@/features/files/api';
import { TaskList } from '@/features/repair-orders/TaskList';
import { fetchKioskPendingSignature, kioskSign, kioskSignatureKey, type KioskSignatureRequest } from './api';
import { remainingPercent } from './domain';
import { useCountdown } from './use-countdown';
import { formatEuro } from '@/lib/numbers';

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Signature non enregistrée : réessayez.';

/** Fenêtre de signature : l'OR, le nom du client, la zone de signature et le temps restant. */
function SignatureForm({
  request,
  readAt,
  onDone,
}: {
  request: KioskSignatureRequest;
  readAt: number;
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
      <div className="col gap-1.5" role="timer" aria-label={`Temps restant : ${seconds} secondes`}>
        <div className="h-2 overflow-hidden rounded bg-muted">
          <i
            className="block h-full rounded bg-primary transition-[width] duration-300 ease-linear"
            style={{ width: `${remainingPercent(seconds)}%` }}
          />
        </div>
        <span className="hint text-right">Cette fenêtre se ferme dans {seconds} s</span>
      </div>
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
  );
}

/**
 * Borne : demande de signature envoyée par l'accueil (client sur place). La fenêtre s'affiche
 * par-dessus le pointage et disparaît au bout d'une minute.
 */
export function KioskSignatureDialog() {
  const queryClient = useQueryClient();
  const pending = useQuery({
    queryKey: kioskSignatureKey,
    queryFn: fetchKioskPendingSignature,
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });
  // Demande affichée : gardée jusqu'à sa fermeture (le « merci » reste après la signature),
  // puis plus réaffichée (signée ou minute écoulée).
  const [active, setActive] = useState<{ request: KioskSignatureRequest; readAt: number } | null>(null);
  const [closedId, setClosedId] = useState<string | null>(null);
  const data = pending.data;
  if (
    data &&
    data.id !== closedId &&
    (active === null || (active.request.id === data.id && active.readAt !== pending.dataUpdatedAt))
  ) {
    setActive({ request: data, readAt: pending.dataUpdatedAt });
  }
  const request = active?.request ?? null;

  const close = () => {
    if (active) setClosedId(active.request.id);
    setActive(null);
    void queryClient.invalidateQueries({ queryKey: kioskSignatureKey });
  };

  return (
    <Dialog open={request !== null}>
      <DialogContent showCloseButton={false} className="max-h-[94dvh] overflow-y-auto sm:max-w-xl">
        {request && (
          <>
            <DialogHeader>
              <DialogTitle className="text-[22px]">
                {request.kind === 'quote'
                  ? `Signature du devis ${request.number}`
                  : `Signature de l’ordre de réparation ${request.number}`}
              </DialogTitle>
              <DialogDescription>
                {request.kind === 'quote'
                  ? 'En signant, vous acceptez ce devis et les travaux ci-dessous.'
                  : 'En signant, vous autorisez l’atelier à réaliser les travaux ci-dessous.'}
              </DialogDescription>
            </DialogHeader>
            <SignatureForm key={request.id} request={request} readAt={active?.readAt ?? 0} onDone={close} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
