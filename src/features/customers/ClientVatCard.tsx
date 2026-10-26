import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/features/repair-orders/constants';
import { invokeFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';

type VatStatus = 'unchecked' | 'valid' | 'format' | 'invalid' | 'unavailable';

interface ClientVat {
  vat_number: string | null;
  vat_status: VatStatus;
  vat_checked_at: string | null;
  vat_registered_name: string | null;
}

/** État de la vérification, tel qu'affiché sous le numéro. */
const VAT_STATUS: Record<VatStatus, { label: string; tone: string }> = {
  unchecked: { label: 'Pas encore vérifié', tone: 's-warn' },
  valid: { label: 'Valide (vérifié auprès de VIES)', tone: 's-ok' },
  format: { label: 'Format correct (hors Union européenne : pas de vérification en ligne)', tone: 's-ok' },
  invalid: { label: 'Invalide', tone: 's-bad' },
  unavailable: { label: 'VIES injoignable : réessaie plus tard', tone: 's-warn' },
};

async function fetchClientVat(clientId: string): Promise<ClientVat> {
  const { data, error } = await supabase
    .from('clients')
    .select('vat_number, vat_status, vat_checked_at, vat_registered_name')
    .eq('id', clientId)
    .single();
  if (error) throw error;
  return { ...data, vat_status: data.vat_status as VatStatus };
}

/**
 * N° de TVA du client (intracommunautaire ou étranger) et sa vérification. Client étranger au
 * numéro vérifié : ses factures partent sans TVA, avec la mention réglée dans Réglages › Facturation.
 */
export function ClientVatCard({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const key = ['clients', clientId, 'vat'];
  const vat = useQuery({ queryKey: key, queryFn: () => fetchClientVat(clientId) });
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? vat.data?.vat_number ?? '';

  const check = useMutation({
    mutationFn: async () => {
      if (!value.trim()) {
        const { error } = await supabase.from('clients').update({ vat_number: null }).eq('id', clientId);
        if (error) throw error;
        return null;
      }
      return invokeFunction<{ status: VatStatus }>('vat-check', { vat_number: value, client_id: clientId });
    },
    onSuccess: async (result) => {
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: key });
      if (result) toast.success(`N° de TVA : ${VAT_STATUS[result.status].label.toLowerCase()}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Vérification impossible'),
  });

  const status = vat.data?.vat_number ? VAT_STATUS[vat.data.vat_status] : null;
  return (
    <section data-slot="card" className="card" aria-labelledby="client-vat">
      <div className="card-h">
        <h2 className="h2" id="client-vat">
          <Receipt className="i" /> N° de TVA
        </h2>
      </div>
      <form
        className="card-b col gap-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          check.mutate();
        }}
      >
        <p className="hint">
          Client étranger : son n° de TVA vérifié fait partir ses factures sans TVA (autoliquidation dans
          l’Union européenne, exonération hors Union).
        </p>
        <div className="row gap-2">
          <Input
            aria-label="N° de TVA du client"
            className="num grow"
            placeholder="DE123456789, BE0123456789, CHE-123.456.789"
            value={value}
            disabled={!vat.isSuccess}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" variant="outline" disabled={!vat.isSuccess || check.isPending}>
            <BadgeCheck /> {check.isPending ? 'Vérification…' : 'Vérifier'}
          </Button>
        </div>
        {status && draft === null && (
          <p className="row wrap gap-2 text-[13px]" role="status">
            <span className={`badge ${status.tone}`}>{status.label}</span>
            {vat.data?.vat_registered_name && <b>{vat.data.vat_registered_name}</b>}
            {vat.data?.vat_checked_at && (
              <span className="muted">le {formatDate(vat.data.vat_checked_at)}</span>
            )}
          </p>
        )}
      </form>
    </section>
  );
}
