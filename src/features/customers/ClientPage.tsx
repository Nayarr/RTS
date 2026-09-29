import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Receipt, Trash2, Truck } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useProfile } from '@/features/auth/useProfile';
import { GroupedInvoiceDialog } from '@/features/invoices/GroupedInvoiceDialog';
import { ClientPortalButtons } from './ClientPortalButtons';
import { InvoiceStatusBadge } from '@/features/invoices/PaymentStatusBadge';
import { QuoteStatusBadge } from '@/features/quotes/QuoteStatusBadge';
import { formatDate } from '@/features/repair-orders/constants';
import { StatusBadge } from '@/features/repair-orders/StatusBadge';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import { deleteClient, updateClient, type ClientDetail } from './api';
import { clientFromForm, clientSchema, clientToForm, type ClientValues } from './domain';
import { useClient, useCustomerMutation } from './hooks';

/** OR regroupables sur une facture : terminés ou à facturer. */
const BILLABLE = ['work_done', 'to_invoice'];

/** Fiche client : coordonnées, conditions commerciales, véhicules, OR, devis et factures. */
export function ClientPage() {
  const { id = '' } = useParams();
  const detail = useClient(id);

  if (detail.isPending) return <p className="text-muted-foreground">Chargement…</p>;
  if (detail.isError) return <p className="text-destructive">Impossible de charger le client.</p>;
  if (!detail.data) return <p className="text-muted-foreground">Client introuvable.</p>;
  return <ClientView detail={detail.data} key={detail.data.client.id} />;
}

function ClientView({ detail }: { detail: ClientDetail }) {
  const { client, vehicles, orders, invoices, quotes } = detail;
  const { data: profile } = useProfile();
  const isDirection = profile?.role === 'direction';
  const navigate = useNavigate();
  const [grouping, setGrouping] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const billable = orders.filter((order) => BILLABLE.includes(order.status));

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ClientValues>({ resolver: zodResolver(clientSchema), defaultValues: clientToForm(client) });
  const save = useCustomerMutation(
    (values: ClientValues) => updateClient(client.id, clientFromForm(values, isDirection)),
    'Fiche client enregistrée',
  );
  const remove = useCustomerMutation((clientId: string) => deleteClient(clientId), 'Client supprimé');

  return (
    <div className="space-y-5">
      <Link
        to="/clients"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="size-4" /> Clients
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{client.name}</h1>
          <p className="text-muted-foreground">
            {client.vehicles_count} véhicule{client.vehicles_count > 1 ? 's' : ''} — {client.orders_count} OR
            — CA HT : {formatEuro(client.revenue_ht)}
            {client.last_visit ? ` — Dernière visite le ${formatDate(client.last_visit)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ClientPortalButtons clientId={client.id} clientName={client.name} />
          {billable.length > 1 && (
            <Button onClick={() => setGrouping(true)}>
              <Receipt /> Facture groupée ({billable.length} OR)
            </Button>
          )}
          {isDirection && (
            <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Supprimer
            </Button>
          )}
        </div>
      </div>

      {client.balance_due > 0 && (
        <p
          role="status"
          className={cn(
            'rounded-lg border p-3 font-semibold',
            client.overdue_invoices_count > 0
              ? 'border-destructive/40 bg-destructive/5 text-destructive'
              : 'border-amber-500/40 bg-amber-50 text-amber-800',
          )}
        >
          Reste dû : {formatEuro(client.balance_due)} TTC
          {client.overdue_invoices_count > 0 &&
            ` — ${client.overdue_invoices_count} facture${client.overdue_invoices_count > 1 ? 's' : ''} en retard`}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Fiche client</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            className="space-y-4"
            onSubmit={handleSubmit((values) => save.mutate(values, { onSuccess: () => reset(values) }))}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="client-name" label="Nom" error={errors.name?.message} {...register('name')} />
              <FormField
                id="client-siren"
                label="SIREN"
                inputMode="numeric"
                placeholder="123 456 789"
                error={errors.siren?.message}
                {...register('siren')}
              />
              <FormField
                id="client-email"
                label="E-mail"
                type="email"
                placeholder="contact@client.fr"
                error={errors.email?.message}
                {...register('email')}
              />
              <FormField
                id="client-phone"
                label="Téléphone"
                type="tel"
                placeholder="06 12 34 56 78"
                {...register('phone')}
              />
            </div>
            <FormField
              id="client-address"
              label="Adresse de facturation"
              placeholder="N°, rue, code postal, ville"
              {...register('billing_address')}
            />
            {isDirection && (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  id="client-discount"
                  label="Remise client (%)"
                  inputMode="decimal"
                  placeholder="0"
                  error={errors.discount_percent?.message}
                  {...register('discount_percent')}
                />
                <FormField
                  id="client-rate"
                  label="Taux horaire client (€ HT)"
                  inputMode="decimal"
                  placeholder="Taux standard"
                  error={errors.hourly_rate?.message}
                  {...register('hourly_rate')}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="client-notes">Notes</Label>
              <Textarea id="client-notes" rows={3} {...register('notes')} />
            </div>
            <Button type="submit" disabled={!isDirty || save.isPending}>
              Enregistrer
            </Button>
          </form>
        </CardContent>
      </Card>

      <section aria-labelledby="client-vehicles" className="space-y-2">
        <h2 id="client-vehicles" className="text-lg font-bold">
          Véhicules
        </h2>
        {vehicles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun véhicule.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {vehicles.map((vehicle) => (
              <li key={vehicle.id}>
                <Link
                  to={`/vehicules/${vehicle.id}`}
                  className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm font-semibold hover:bg-muted"
                >
                  <Truck className="size-4" /> {vehicle.plate}
                  <span className="font-normal text-muted-foreground">({vehicle.orders_count} OR)</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="client-orders" className="space-y-2">
        <h2 id="client-orders" className="text-lg font-bold">
          Ordres de réparation ({orders.length})
        </h2>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun OR.</p>
        ) : (
          <ul className="space-y-2">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  to={`/or/${order.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3 hover:bg-muted"
                >
                  <span>
                    <strong>{order.number}</strong> — {order.plate} — {formatDate(order.created_at)}
                    <span className="block text-sm text-muted-foreground">{order.requested_work}</span>
                  </span>
                  <StatusBadge status={order.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="client-invoices" className="space-y-2">
          <h2 id="client-invoices" className="text-lg font-bold">
            Factures ({invoices.length})
          </h2>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune facture.</p>
          ) : (
            <ul className="space-y-2">
              {invoices.map((invoice) => (
                <li key={invoice.id}>
                  <Link
                    to={`/factures/${invoice.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3 hover:bg-muted"
                  >
                    <span>
                      <strong>{invoice.number ?? 'Brouillon'}</strong> — {formatDate(invoice.issued_at)}
                      <span className="block text-sm text-muted-foreground">
                        {formatEuro(invoice.total_ttc)} TTC
                        {invoice.balance_due && invoice.balance_due > 0
                          ? ` — reste ${formatEuro(invoice.balance_due)}`
                          : ''}
                      </span>
                    </span>
                    <InvoiceStatusBadge invoice={invoice} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="client-quotes" className="space-y-2">
          <h2 id="client-quotes" className="text-lg font-bold">
            Devis ({quotes.length})
          </h2>
          {quotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun devis.</p>
          ) : (
            <ul className="space-y-2">
              {quotes.map((quote) => (
                <li key={quote.id}>
                  <Link
                    to={`/devis/${quote.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3 hover:bg-muted"
                  >
                    <span>
                      <strong>{quote.number ?? 'Sans numéro'}</strong> — {formatDate(quote.created_at)}
                      <span className="block text-sm text-muted-foreground">
                        {formatEuro(quote.total_ttc)} TTC{quote.plate ? ` — ${quote.plate}` : ''}
                      </span>
                    </span>
                    {quote.status && <QuoteStatusBadge status={quote.status} />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {grouping && <GroupedInvoiceDialog clientId={client.id} onClose={() => setGrouping(false)} />}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Supprimer ${client.name} ?`}
        description="Possible seulement pour un client sans OR, devis ni facture. Ses véhicules restent enregistrés."
        confirmLabel="Supprimer"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate(client.id, { onSuccess: () => void navigate('/clients') })}
      />
    </div>
  );
}
