import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { BadgeEuro, FileDown, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormField } from '@/components/FormField';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SearchField } from '@/components/ListControls';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useClients } from '@/features/customers/hooks';
import { formatDateTime } from '@/features/repair-orders/constants';
import { fetchSettings } from '@/features/settings/api';
import { useSettings } from '@/features/settings/hooks';
import { downloadFile } from '@/lib/csv';
import { decimalField, decimalValue, formatEuro } from '@/lib/numbers';
import { pdfFileName } from '@/lib/pdf';
import { cn } from '@/lib/utils';
import { CERFA_URL, fillCerfa } from './cerfa-cession';
import {
  cancelFleetSale,
  sellFleetVehicle,
  type FleetSale,
  type FleetVatScheme,
  type FleetVehicle,
} from './fleet-api';
import { hasEngine, marginVat, vehicleTitle } from './fleet-domain';
import { useFleetMutation, useFleetSale } from './fleet-hooks';
import { NewClientInline } from './NewClientInline';

const saleSchema = z.object({
  sold_at: z.string().min(1, 'Indique la date et l’heure de la vente'),
  mileage: z.string().regex(/^\s*\d*\s*$/, 'Kilométrage en chiffres'),
  price: decimalField({ required: true, positive: true }),
  purchase_price: decimalField(),
});
type SaleValues = z.infer<typeof saleSchema>;

const SCHEMES: { value: FleetVatScheme; label: string; hint: string }[] = [
  {
    value: 'normal',
    label: 'TVA normale',
    hint: 'Le véhicule a été acheté avec une TVA récupérée : prix HT, TVA sur la totalité.',
  },
  {
    value: 'margin',
    label: 'TVA sur la marge',
    hint: 'Véhicule d’occasion acheté sans TVA récupérable : facture au prix TTC, sans TVA ni marge affichées.',
  },
];

/** Date et heure locales pour le champ de saisie. */
function localNow() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** Vente : acheteur, date, kilométrage, régime de TVA, prix. La facture part en brouillon. */
export function FleetSaleDialog({ vehicle, onClose }: { vehicle: FleetVehicle; onClose: () => void }) {
  const navigate = useNavigate();
  const clients = useClients();
  const rate = useSettings().data?.company.default_vat_rate ?? 20;
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const [newClient, setNewClient] = useState(false);
  const [clientError, setClientError] = useState(false);
  const [scheme, setScheme] = useState<FleetVatScheme>('normal');
  const form = useForm<SaleValues>({
    resolver: zodResolver(saleSchema),
    defaultValues: {
      sold_at: localNow(),
      mileage: vehicle.mileage === null ? '' : String(vehicle.mileage),
      price: '',
      purchase_price: '',
    },
  });
  const [price, purchase] = useWatch({ control: form.control, name: ['price', 'purchase_price'] });
  const margin = scheme === 'margin';
  const priceValue = decimalValue(price) ?? 0;
  const purchaseValue = decimalValue(purchase);
  const engine = hasEngine(vehicle.category);

  const list = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (clients.data ?? [])
      .filter((item) =>
        needle ? `${item.name} ${item.phone ?? ''} ${item.email ?? ''}`.toLowerCase().includes(needle) : true,
      )
      .slice(0, 6);
  }, [clients.data, search]);
  const client = (clients.data ?? []).find((item) => item.id === clientId) ?? null;

  const sell = useFleetMutation(
    (values: SaleValues) =>
      sellFleetVehicle({
        vehicleId: vehicle.id,
        clientId,
        soldAt: new Date(values.sold_at).toISOString(),
        mileage: engine && values.mileage.trim() ? Number(values.mileage.trim()) : null,
        scheme,
        price: decimalValue(values.price) ?? 0,
        purchasePrice: margin ? decimalValue(values.purchase_price) : null,
      }),
    'Véhicule vendu : facture prête en brouillon',
  );

  const submit = form.handleSubmit((values) => {
    setClientError(!clientId);
    if (!clientId) return;
    if (margin && decimalValue(values.purchase_price) === null) {
      form.setError('purchase_price', { message: 'Indique le prix d’achat : la TVA en dépend' });
      return;
    }
    sell.mutate(values, { onSuccess: (invoiceId) => void navigate(`/factures/${invoiceId}`) });
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Vendre {vehicle.plate}</DialogTitle>
          <DialogDescription>
            {vehicleTitle(vehicle)} sort de la flotte et la facture est préparée en brouillon. Le certificat
            de cession est ensuite disponible sur la fiche du véhicule.
          </DialogDescription>
        </DialogHeader>

        <section className="col gap-2" aria-label="Acheteur">
          <span className="text-sm font-medium">Acheteur</span>
          {client ? (
            <div className="row gap-2 rounded-lg border p-2.5">
              <span className="c2 grow">
                <b>{client.name}</b>
                <span>{client.billing_address ?? 'Adresse à compléter avant d’émettre la facture'}</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => setClientId('')}>
                Changer
              </Button>
            </div>
          ) : newClient ? (
            <NewClientInline
              initialName={search.trim()}
              onCreated={(id) => {
                setNewClient(false);
                setClientId(id);
              }}
              onCancel={() => setNewClient(false)}
            />
          ) : (
            <>
              <SearchField
                aria-label="Rechercher l’acheteur"
                placeholder="Nom, téléphone, e-mail…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <ul className="col" aria-label="Clients">
                {list.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="li w-full cursor-pointer text-left hover:bg-hover"
                      onClick={() => {
                        setClientId(item.id);
                        setClientError(false);
                      }}
                    >
                      <span className="c2">
                        <b>{item.name}</b>
                        <span>{item.phone ?? item.email ?? ''}</span>
                      </span>
                      <span className="tag">{item.kind === 'individual' ? 'Particulier' : 'Pro'}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <Button
                variant="link"
                size="sm"
                className="h-auto self-start p-0"
                onClick={() => setNewClient(true)}
              >
                Créer un nouveau client
              </Button>
            </>
          )}
          {clientError && !clientId && <p className="text-sm text-destructive">Choisis l’acheteur.</p>}
        </section>

        <form id="fleet-sale-form" noValidate className="space-y-4" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              id="sale-date"
              label="Date et heure de la vente"
              type="datetime-local"
              error={form.formState.errors.sold_at?.message}
              {...form.register('sold_at')}
            />
            {engine && (
              <FormField
                id="sale-mileage"
                label="Kilométrage au compteur"
                inputMode="numeric"
                className="num"
                error={form.formState.errors.mileage?.message}
                {...form.register('mileage')}
              />
            )}
          </div>

          <div className="col gap-2">
            <div className="seg self-start" role="group" aria-label="Régime de TVA">
              {SCHEMES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(scheme === option.value && 'on')}
                  aria-pressed={scheme === option.value}
                  onClick={() => setScheme(option.value)}
                >
                  {option.label}
                  {option.value === 'normal' && ` ${String(rate).replace('.', ',')} %`}
                </button>
              ))}
            </div>
            <p className="hint">{SCHEMES.find((option) => option.value === scheme)?.hint}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              id="sale-price"
              label={margin ? 'Prix de vente TTC (€)' : 'Prix de vente HT (€)'}
              inputMode="decimal"
              className="num"
              error={form.formState.errors.price?.message}
              {...form.register('price')}
            />
            {margin && (
              <FormField
                id="sale-purchase"
                label="Prix d’achat TTC (€)"
                inputMode="decimal"
                className="num"
                error={form.formState.errors.purchase_price?.message}
                {...form.register('purchase_price')}
              />
            )}
          </div>
          {margin && priceValue > 0 && purchaseValue !== null && (
            <p className="alert s-blue" aria-label="TVA sur la marge">
              Marge {formatEuro(Math.max(priceValue - purchaseValue, 0))} · TVA à reverser{' '}
              {formatEuro(marginVat(priceValue, purchaseValue, rate))} (non affichée sur la facture).
            </p>
          )}
          {!margin && priceValue > 0 && (
            <p className="hint">
              Soit {formatEuro(Math.round(priceValue * (100 + rate)) / 100)} TTC pour l’acheteur.
            </p>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="fleet-sale-form" disabled={sell.isPending}>
            {sell.isPending ? 'Enregistrement…' : 'Vendre et préparer la facture'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Genre de la civilité enregistrée, pour la case M / F du cerfa. */
const sexOf = (civility: string | null | undefined): 'M' | 'F' | null => {
  const value = (civility ?? '').toLowerCase();
  if (value.startsWith('mme') || value.startsWith('madame')) return 'F';
  if (value === 'm' || value === 'm.' || value.startsWith('monsieur')) return 'M';
  return null;
};

async function downloadCerfa(vehicle: FleetVehicle, sale: FleetSale) {
  const [{ company }, template] = await Promise.all([
    fetchSettings(),
    fetch(CERFA_URL).then((response) => {
      if (!response.ok) throw new Error('Formulaire introuvable');
      return response.arrayBuffer();
    }),
  ]);
  const individual = sale.client?.kind === 'individual';
  const bytes = await fillCerfa(template, {
    plate: vehicle.plate,
    vin: vehicle.vin,
    firstRegistration: vehicle.first_registration,
    brand: vehicle.brand,
    model: vehicle.model,
    category: vehicle.category,
    mileage: sale.mileage,
    soldAt: new Date(sale.sold_at),
    seller: {
      name: company.legal_name,
      isCompany: true,
      siret: company.siret,
      address: `${company.address_line}, ${company.postal_code} ${company.city}`,
    },
    sellerCity: company.city,
    buyer: {
      name: sale.client?.name ?? '',
      isCompany: !individual,
      siret: sale.client?.siret ?? null,
      address: sale.client?.billing_address ?? '',
      ...(individual
        ? {
            sex: sexOf(sale.client?.civility),
            birthDate: sale.client?.birth_date ?? null,
            birthPlace: sale.client?.birth_place ?? null,
          }
        : {}),
    },
  });
  downloadFile(
    new Blob([bytes.slice().buffer], { type: 'application/pdf' }),
    pdfFileName('Certificat-de-cession', vehicle.plate),
  );
}

/** Fiche d'un véhicule vendu : acheteur, facture, certificat de cession, annulation. */
export function FleetSaleCard({ vehicle }: { vehicle: FleetVehicle }) {
  const sale = useFleetSale(vehicle.id);
  const [cancelling, setCancelling] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const cancel = useFleetMutation(
    () => cancelFleetSale(vehicle.id),
    'Vente annulée : véhicule remis en flotte',
  );
  if (!sale.data) return null;
  const { invoice, client } = sale.data;
  const download = async (data: FleetSale) => {
    setDownloading(true);
    try {
      await downloadCerfa(vehicle, data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Certificat de cession indisponible');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section data-slot="card" className="card" aria-labelledby="fleet-sale">
      <div className="card-h flex-wrap">
        <h2 className="h2" id="fleet-sale">
          <BadgeEuro className="i s text-muted-foreground" /> Vente
        </h2>
        <div className="row flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={downloading}
            onClick={() => sale.data && void download(sale.data)}
          >
            <FileDown /> Certificat de cession (cerfa)
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCancelling(true)}>
            <Undo2 /> Annuler la vente
          </Button>
        </div>
      </div>
      <div className="card-b">
        <dl className="dl grid-cols-[130px_1fr]!">
          <dt>Acheteur</dt>
          <dd>
            {client ? (
              <Link className="ul" to={`/clients/${sale.data.client_id}`}>
                {client.name}
              </Link>
            ) : (
              '-'
            )}
          </dd>
          <dt>Vendu le</dt>
          <dd>{formatDateTime(sale.data.sold_at)}</dd>
          <dt>Prix de vente</dt>
          <dd>
            {formatEuro(sale.data.sale_price)} {sale.data.vat_scheme === 'margin' ? 'TTC' : 'HT'}
          </dd>
          <dt>TVA</dt>
          <dd>{sale.data.vat_scheme === 'margin' ? 'Sur la marge' : 'Normale'}</dd>
          <dt>Facture</dt>
          <dd>
            <Link className="ul" to={`/factures/${sale.data.invoice_id}`}>
              {invoice?.number ?? 'Brouillon à émettre'}
            </Link>
          </dd>
        </dl>
      </div>
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title="Annuler cette vente ?"
        description="Le véhicule revient dans la flotte. Brouillon : la facture est supprimée. Facture émise : fais d’abord un avoir de la totalité."
        confirmLabel="Annuler la vente"
        destructive
        pending={cancel.isPending}
        onConfirm={() => cancel.mutate(undefined, { onSuccess: () => setCancelling(false) })}
      />
    </section>
  );
}
