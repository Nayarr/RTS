import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Tablet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { fetchKioskStatus, kioskStatusKey } from '@/features/signature/api';
import { kioskPresence, remainingPercent } from '@/features/signature/domain';
import { useCountdown } from '@/features/signature/use-countdown';
import { fetchQuoteSignatureRequest, requestQuoteKioskSignature, type QuoteOverview } from '../api';
import { quoteKey } from '../hooks';

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Demande impossible';

/**
 * Client présent : le devis s'affiche sur la borne pendant 1 minute ; sa signature l'accepte,
 * comme la signature en ligne. Suivi en direct jusqu'à la réponse.
 */
export function QuoteKioskButton({ quote, disabled }: { quote: QuoteOverview; disabled: boolean }) {
  const queryClient = useQueryClient();
  const key = ['quotes', quote.id, 'kiosk-signature'] as const;
  const request = useQuery({
    queryKey: key,
    queryFn: () => fetchQuoteSignatureRequest(quote.id),
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 2000 : false),
  });
  const kiosk = useQuery({ queryKey: kioskStatusKey, queryFn: fetchKioskStatus, refetchInterval: 30_000 });
  const presence = kiosk.data ? kioskPresence(kiosk.data.seconds_ago) : null;
  const pending = request.data?.status === 'pending';
  const seconds = useCountdown(request.data?.seconds_left ?? 0, request.dataUpdatedAt, pending);

  // Signé sur la borne : le devis est rechargé (accepté, avec la signature)
  const signed = request.data?.status === 'signed';
  useEffect(() => {
    if (signed) {
      toast.success('Devis signé sur la borne');
      void queryClient.invalidateQueries({ queryKey: quoteKey(quote.id) });
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
    }
  }, [signed, quote.id, queryClient]);

  const ask = useMutation({
    mutationFn: () => requestQuoteKioskSignature(quote.id),
    onSuccess: (created) => {
      queryClient.setQueryData(key, created);
      void queryClient.invalidateQueries({ queryKey: quoteKey(quote.id) });
      toast.success('Devis affiché sur la borne pendant 1 minute');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (pending) {
    return (
      <div className="col w-[220px] gap-1" role="status" aria-label="Signature sur la borne">
        <span className="hint">Sur la borne : {seconds} s</span>
        <div className="h-1.5 overflow-hidden rounded bg-muted">
          <i className="block h-full rounded bg-primary" style={{ width: `${remainingPercent(seconds)}%` }} />
        </div>
      </div>
    );
  }
  return (
    <Button
      variant="outline"
      disabled={disabled || ask.isPending}
      title={presence?.label}
      onClick={() => ask.mutate()}
    >
      <Tablet /> Faire signer sur la borne
    </Button>
  );
}
