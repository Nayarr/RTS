import { useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CalendarDays,
  Link2,
  Plus,
  Receipt,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Truck,
  Wrench,
} from 'lucide-react';
import { initials } from '@/app/nav';
import { PageHeader } from '@/app/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useProfile } from '@/features/auth/useProfile';
import { GroupedInvoiceDialog } from '@/features/invoices/GroupedInvoiceDialog';
import { ClientLicensesCard } from '@/features/rentals/ClientLicensesCard';
import { ClientPortalButtons } from './ClientPortalButtons';
import { InvoiceStatusBadge } from '@/features/invoices/PaymentStatusBadge';
import { QuoteStatusBadge } from '@/features/quotes/QuoteStatusBadge';
import { AppointmentDialog } from '@/features/planning/AppointmentDialog';
import { formatDate, VEHICLE_TYPES } from '@/features/repair-orders/constants';
import { StatusBadge } from '@/features/repair-orders/StatusBadge';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import { deleteClient, updateClient, type ClientDetail } from './api';
import {
  CLIENT_KIND_LABELS,
  clientFromForm,
  clientSchema,
  clientToForm,
  MAX_OTHER_PHONES,
  type ClientValues,
} from './domain';
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
  const [booking, setBooking] = useState(false);
  const billable = orders.filter((order) => BILLABLE.includes(order.status));

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ClientValues>({ resolver: zodResolver(clientSchema), defaultValues: clientToForm(client) });
  const phones = useFieldArray({ control, name: 'other_phones' });
  const individual = useWatch({ control, name: 'kind' }) === 'individual';
  const save = useCustomerMutation(
    (values: ClientValues) => updateClient(client.id, clientFromForm(values, isDirection)),
    'Fiche client enregistrée',
  );
  const remove = useCustomerMutation((clientId: string) => deleteClient(clientId), 'Client supprimé');

  const kpis = [
    { icon: <Truck className="i s" />, value: String(client.vehicles_count), label: 'Véhicules' },
    { icon: <Wrench className="i s" />, value: String(client.orders_count), label: 'Ordres de réparation' },
    {
      icon: <TrendingUp className="i s" />,
      value: formatEuro(client.revenue_ht),
      label: 'Chiffre d’affaires HT',
    },
  ];
  const overdue = client.overdue_invoices_count;

  return (
    <>
      <PageHeader
        back={{ to: '/clients', label: 'Retour aux clients' }}
        leading={
          <span className="av lg bg-accent! text-accent-foreground!" aria-hidden>
            {initials(client.name)}
          </span>
        }
        crumbs={[{ label: 'Clients', to: '/clients' }, { label: 'Fiche client' }]}
        title={
          <span className="row flex-wrap gap-x-3 gap-y-1">
            {client.name}
            <span className="tag text-[12.5px]">{CLIENT_KIND_LABELS[client.kind ?? 'pro']}</span>
          </span>
        }
        actions={
          <>
            {isDirection && (
              <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Supprimer
              </Button>
            )}
            {billable.length > 1 && (
              <Button variant="outline" onClick={() => setGrouping(true)}>
                <Receipt /> Facture groupée ({billable.length} OR)
              </Button>
            )}
            <Button variant="outline" onClick={() => setBooking(true)}>
              <CalendarDays /> Prendre rendez-vous
            </Button>
            <Button asChild>
              <Link to="/or/nouveau">
                <Plus /> Nouvel OR
              </Link>
            </Button>
          </>
        }
      />

      <ul className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <li key={kpi.label} className="card kpi">
            <span className="kpi-ico">{kpi.icon}</span>
            <div className="col gap-1">
              <span className="kpi-v">{kpi.value}</span>
              <span className="kpi-l">{kpi.label}</span>
            </div>
          </li>
        ))}
        <li
          className="card kpi"
          role="status"
          style={
            client.balance_due > 0
              ? { borderColor: 'color-mix(in srgb, var(--destructive) 40%, transparent)' }
              : undefined
          }
        >
          <span className={cn('kpi-ico', client.balance_due > 0 && 'down')}>
            <TriangleAlert className="i s" />
          </span>
          <div className="col gap-1">
            <span className={cn('kpi-v', client.balance_due > 0 && 'down')}>
              {formatEuro(client.balance_due)}
            </span>
            <span className="kpi-l">
              Impayés TTC
              {overdue > 0 && ` · ${overdue} facture${overdue > 1 ? 's' : ''} en retard`}
            </span>
          </div>
        </li>
      </ul>

      <div className="split grid-cols-1! lg:grid-cols-[minmax(0,1fr)_380px]!">
        <section data-slot="card" className="card" aria-labelledby="client-form">
          <form
            noValidate
            onSubmit={handleSubmit((values) => save.mutate(values, { onSuccess: () => reset(values) }))}
          >
            <div className="card-h">
              <h2 className="h2" id="client-form">
                Fiche client
              </h2>
              <Button type="submit" size="sm" disabled={!isDirty || save.isPending}>
                Enregistrer
              </Button>
            </div>
            <div className="card-b col gap-3.5">
              {individual && (
                <div className="grid gap-3.5 sm:grid-cols-3">
                  <div className="field">
                    <Label htmlFor="client-civility">Civilité</Label>
                    <select id="client-civility" className="inp" {...register('civility')}>
                      <option value="">-</option>
                      <option value="Mme">Mme</option>
                      <option value="M.">M.</option>
                    </select>
                  </div>
                  <FormField
                    id="client-last-name"
                    label="Nom"
                    error={errors.last_name?.message}
                    {...register('last_name')}
                  />
                  <FormField
                    id="client-first-name"
                    label="Prénom"
                    error={errors.first_name?.message}
                    {...register('first_name')}
                  />
                  <FormField
                    id="client-birth-date"
                    label="Date de naissance"
                    type="date"
                    error={errors.birth_date?.message}
                    {...register('birth_date')}
                  />
                  <FormField
                    id="client-birth-place"
                    label="Lieu de naissance"
                    error={errors.birth_place?.message}
                    {...register('birth_place')}
                  />
                </div>
              )}
              <div className="grid gap-3.5 sm:grid-cols-2">
                {!individual && (
                  <FormField
                    id="client-name"
                    label="Nom"
                    error={errors.name?.message}
                    {...register('name')}
                  />
                )}
                {!individual && (
                  <FormField
                    id="client-siren"
                    label="SIREN"
                    inputMode="numeric"
                    placeholder="123 456 789"
                    className="num"
                    error={errors.siren?.message}
                    {...register('siren')}
                  />
                )}
                <FormField
                  id="client-email"
                  label="E-mail"
                  type="email"
                  placeholder="contact@client.fr"
                  error={errors.email?.message}
                  {...register('email')}
                />
              </div>
              <fieldset className="col gap-3">
                <legend className="lbl mb-2.5">Téléphones</legend>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  {!individual && (
                    <FormField
                      id="client-contact"
                      label="Contact de référence"
                      placeholder="Nom du contact"
                      error={errors.contact_name?.message}
                      {...register('contact_name')}
                    />
                  )}
                  <FormField
                    id="client-phone"
                    label={individual ? 'Téléphone mobile' : 'Téléphone du contact'}
                    type="tel"
                    placeholder="06 12 34 56 78"
                    className="num"
                    hint="Numéro utilisé pour les SMS"
                    {...register('phone')}
                  />
                </div>
                {phones.fields.map((field, index) => (
                  <div
                    key={field.id}
                    role="group"
                    aria-label={`Autre numéro ${index + 1}`}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-2.5 sm:gap-3.5"
                  >
                    <FormField
                      id={`client-other-label-${index}`}
                      label="Libellé"
                      placeholder="Comptabilité"
                      error={errors.other_phones?.[index]?.label?.message}
                      {...register(`other_phones.${index}.label`)}
                    />
                    <FormField
                      id={`client-other-phone-${index}`}
                      label="Numéro"
                      type="tel"
                      placeholder="01 23 45 67 89"
                      className="num"
                      error={errors.other_phones?.[index]?.phone?.message}
                      {...register(`other_phones.${index}.phone`)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-[19px]"
                      aria-label={`Retirer l’autre numéro ${index + 1}`}
                      onClick={() => phones.remove(index)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                {phones.fields.length < MAX_OTHER_PHONES && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => phones.append({ label: '', phone: '' }, { shouldFocus: true })}
                  >
                    <Plus /> Ajouter un numéro
                  </Button>
                )}
              </fieldset>
              <FormField
                id="client-address"
                label={individual ? 'Adresse' : 'Adresse de facturation'}
                placeholder="N°, rue, code postal, ville"
                {...register('billing_address')}
              />
              {isDirection && (
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <FormField
                    id="client-discount"
                    label="Remise client (%)"
                    inputMode="decimal"
                    placeholder="0"
                    className="num"
                    error={errors.discount_percent?.message}
                    {...register('discount_percent')}
                  />
                  <FormField
                    id="client-rate"
                    label="Taux horaire client (€ HT)"
                    inputMode="decimal"
                    placeholder="Taux standard"
                    className="num"
                    error={errors.hourly_rate?.message}
                    {...register('hourly_rate')}
                  />
                </div>
              )}
              <div className="field">
                <Label htmlFor="client-notes">Notes</Label>
                <Textarea id="client-notes" rows={3} {...register('notes')} />
              </div>
            </div>
          </form>
        </section>

        <div className="col gap-5">
          <ClientLicensesCard
            client={{
              id: client.id,
              kind: client.kind ?? 'pro',
              first_name: client.first_name,
              last_name: client.last_name,
            }}
          />
          <section data-slot="card" className="card" aria-labelledby="client-portal">
            <div className="card-h">
              <h2 className="h2" id="client-portal">
                <Link2 className="i" /> Espace client en ligne
              </h2>
            </div>
            <div className="card-b col gap-2.5">
              <p className="hint">
                Un lien sans mot de passe : le client y retrouve ses véhicules, ses devis à signer et ses
                factures.
              </p>
              <ClientPortalButtons clientId={client.id} clientName={client.name} />
            </div>
          </section>

          <section data-slot="card" className="card" aria-labelledby="client-vehicles">
            <div className="card-h">
              <h2 className="h2" id="client-vehicles">
                Véhicules{' '}
                <span className="cnt" aria-hidden>
                  {vehicles.length}
                </span>
              </h2>
            </div>
            {vehicles.length === 0 ? (
              <p className="card-b hint">Aucun véhicule.</p>
            ) : (
              <ul className="max-h-[360px] overflow-y-auto">
                {vehicles.map((vehicle) => (
                  <li key={vehicle.id}>
                    <Link to={`/vehicules/${vehicle.id}`} className="li hover:bg-hover">
                      <span className="col gap-0">
                        <b className="plate">{vehicle.plate}</b>
                        <span className="hint">
                          {[
                            [vehicle.brand, vehicle.model].filter(Boolean).join(' '),
                            VEHICLE_TYPES[vehicle.vehicle_type],
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <span className="hint">{vehicle.orders_count} OR</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section data-slot="card" className="card" aria-labelledby="client-orders">
          <div className="card-h">
            <h2 className="h2" id="client-orders">
              Ordres de réparation
            </h2>
            <span className="cnt">{orders.length}</span>
          </div>
          {orders.length === 0 ? (
            <p className="card-b hint">Aucun OR.</p>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto">
              {orders.map((order) => (
                <li key={order.id}>
                  <Link to={`/or/${order.id}`} className="li hover:bg-hover">
                    <span className="c2 min-w-0">
                      <b>
                        {order.number} · {order.plate}
                      </b>
                      <span>{formatDate(order.created_at)}</span>
                    </span>
                    <StatusBadge status={order.status} technicianId={order.technician_id} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section data-slot="card" className="card" aria-labelledby="client-quotes">
          <div className="card-h">
            <h2 className="h2" id="client-quotes">
              Devis
            </h2>
            <span className="cnt">{quotes.length}</span>
          </div>
          {quotes.length === 0 ? (
            <p className="card-b hint">Aucun devis.</p>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto">
              {quotes.map((quote) => (
                <li key={quote.id}>
                  <Link to={`/devis/${quote.id}`} className="li hover:bg-hover">
                    <span className="c2 min-w-0">
                      <b>
                        {quote.number ?? 'Brouillon'}
                        {quote.plate ? ` · ${quote.plate}` : ''}
                      </b>
                      <span>{formatEuro(quote.total_ttc)} TTC</span>
                    </span>
                    {quote.status && <QuoteStatusBadge status={quote.status} />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section data-slot="card" className="card" aria-labelledby="client-invoices">
          <div className="card-h">
            <h2 className="h2" id="client-invoices">
              Factures
            </h2>
            <span className="cnt">{invoices.length}</span>
          </div>
          {invoices.length === 0 ? (
            <p className="card-b hint">Aucune facture.</p>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto">
              {invoices.map((invoice) => (
                <li key={invoice.id}>
                  <Link to={`/factures/${invoice.id}`} className="li hover:bg-hover">
                    <span className="c2 min-w-0">
                      <b>{invoice.number ?? 'Brouillon'}</b>
                      <span>
                        {invoice.balance_due && invoice.balance_due > 0
                          ? `Reste dû ${formatEuro(invoice.balance_due)}`
                          : `${formatEuro(invoice.total_ttc)} TTC`}
                        {invoice.issued_at ? ` · ${formatDate(invoice.issued_at)}` : ''}
                      </span>
                    </span>
                    <InvoiceStatusBadge invoice={invoice} />
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
      {booking && (
        <AppointmentDialog
          appointment={null}
          preset={{ client_name: client.name }}
          onClose={() => setBooking(false)}
        />
      )}
    </>
  );
}
