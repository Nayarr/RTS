import { useState } from 'react';
import { Percent } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { updateInvoiceDraft, type InvoiceOverview } from './api';
import { useInvoiceMutation } from './hooks';

async function setInvoiceVatExempt(invoiceId: string, exempt: boolean) {
  const { error } = await supabase.rpc('set_invoice_vat_exempt', {
    p_invoice_id: invoiceId,
    p_exempt: exempt,
  });
  if (error) throw error;
}

/**
 * TVA de la facture : « Sans TVA » met les lignes à 0 % avec la mention d'exonération (modifiable
 * sur le brouillon) ; client étranger au n° vérifié : coché d'office.
 */
export function InvoiceVatCard({ invoice }: { invoice: InvoiceOverview }) {
  const draft = invoice.status === 'draft';
  const toggle = useInvoiceMutation(
    (exempt: boolean) => setInvoiceVatExempt(invoice.id, exempt),
    (_, exempt) => (exempt ? 'Facture sans TVA' : 'TVA remise sur les lignes'),
  );
  const saveMention = useInvoiceMutation(
    (mention: string) => updateInvoiceDraft(invoice.id, { vat_exempt_mention: mention.trim() || null }),
    'Mention enregistrée',
  );
  const [mention, setMention] = useState<string | null>(null);

  if (!draft && !invoice.vat_exempt) return null;
  return (
    <section data-slot="card" className="card" aria-labelledby="invoice-vat">
      <div className="card-h">
        <h2 className="h2" id="invoice-vat">
          <Percent className="i" /> TVA
        </h2>
      </div>
      <div className="card-b col gap-2.5">
        {draft ? (
          <label className="row items-start gap-2 text-[13.5px]">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={invoice.vat_exempt === true}
              disabled={toggle.isPending}
              onChange={(event) => toggle.mutate(event.target.checked)}
            />
            <span>
              <b>Sans TVA</b> (exonération) : toutes les lignes à 0 %, avec la mention ci-dessous
            </span>
          </label>
        ) : (
          <p className="text-[13.5px]">
            <b>Facture sans TVA</b> (exonération)
          </p>
        )}
        {invoice.vat_exempt && (
          <>
            {invoice.client_vat_number && (
              <p className="hint">
                N° de TVA du client : <b className="num">{invoice.client_vat_number}</b>
              </p>
            )}
            {draft ? (
              <div className="field">
                <Label htmlFor="vat-exempt-mention">Mention sur la facture</Label>
                <Textarea
                  id="vat-exempt-mention"
                  rows={2}
                  value={mention ?? invoice.vat_exempt_mention ?? ''}
                  onChange={(event) => setMention(event.target.value)}
                  onBlur={() => {
                    if (mention !== null && mention !== (invoice.vat_exempt_mention ?? ''))
                      saveMention.mutate(mention);
                  }}
                />
              </div>
            ) : (
              invoice.vat_exempt_mention && <p className="hint">{invoice.vat_exempt_mention}</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
