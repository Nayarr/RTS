import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, FileText, Plus, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ROLE_LABELS } from '@/features/auth/roles';
import { useProfile } from '@/features/auth/useProfile';
import { formatHours, STATUS_META, STATUS_ORDER } from '@/features/repair-orders/constants';
import { technicianColor } from '@/features/planning/domain';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import { fetchOfficeDashboard } from './api';

interface TileProps {
  to: string;
  value: ReactNode;
  label: string;
  color?: string | undefined;
  /** Mise en avant quand il y a quelque chose à faire. */
  urgent?: boolean;
}

function Tile({ to, value, label, color, urgent }: TileProps) {
  return (
    <li>
      <Link
        to={to}
        className="flex h-full flex-col justify-between gap-1 rounded-lg border bg-card p-3 transition hover:bg-muted"
      >
        <span
          className={cn('text-2xl font-bold tabular-nums', urgent && 'text-destructive')}
          style={urgent ? undefined : { color }}
        >
          {value}
        </span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </Link>
    </li>
  );
}

/** Accueil du bureau : ce qui attend une action, charge de l'atelier, raccourcis. */
export function OfficeDashboardPage() {
  const { data: profile } = useProfile();
  const dashboard = useQuery({
    queryKey: ['office-dashboard'],
    queryFn: fetchOfficeDashboard,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const data = dashboard.data;
  const isDirection = profile?.role === 'direction';
  const openStatuses = STATUS_ORDER.filter((status) => status !== 'invoiced');
  const totalHours = (data?.workload ?? []).reduce((sum, row) => sum + Number(row.hours), 0);
  const activeOrders = openStatuses.reduce((sum, status) => sum + (data?.repair_orders[status] ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Bonjour {profile?.full_name || profile?.email}</h1>
          <p className="text-muted-foreground">Espace {profile ? ROLE_LABELS[profile.role] : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/or/nouveau">
              <Plus /> Nouvel OR
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/devis/nouveau">
              <FileText /> Nouveau devis
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/rendez-vous">
              <CalendarClock /> Rendez-vous
            </Link>
          </Button>
        </div>
      </div>

      {dashboard.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {dashboard.isError && <p className="text-destructive">Impossible de charger le tableau de bord.</p>}

      {data && (
        <>
          <section aria-labelledby="dashboard-orders" className="space-y-2">
            <h2 id="dashboard-orders" className="flex items-center gap-2 text-lg font-bold">
              <Wrench className="size-5" /> Ordres de réparation
            </h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {openStatuses.map((status) => (
                <Tile
                  key={status}
                  to={`/or?filtre=${status}`}
                  value={data.repair_orders[status] ?? 0}
                  label={STATUS_META[status].label}
                  color={STATUS_META[status].color}
                />
              ))}
              <Tile
                to="/or?filtre=parts"
                value={data.parts_to_order}
                label="Pièces à commander"
                urgent={data.parts_to_order > 0}
              />
            </ul>
          </section>

          <section aria-labelledby="dashboard-todo" className="space-y-2">
            <h2 id="dashboard-todo" className="text-lg font-bold">
              À suivre
            </h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Tile
                to="/devis?filtre=sent"
                value={data.quotes_awaiting_response}
                label="Devis en attente de réponse"
              />
              <Tile
                to="/devis?filtre=accepted"
                value={data.quotes_to_convert}
                label="Devis acceptés à transformer en OR"
                urgent={data.quotes_to_convert > 0}
              />
              <Tile
                to="/factures?filtre=overdue"
                value={data.overdue_invoices.count}
                label={`Factures en retard${data.overdue_invoices.count ? ` (${formatEuro(data.overdue_invoices.balance_due)})` : ''}`}
                urgent={data.overdue_invoices.count > 0}
              />
              <Tile to="/planning?vue=jour" value={data.appointments_today} label="Rendez-vous aujourd’hui" />
              <Tile
                to="/rendez-vous"
                value={data.reminders_to_send}
                label="Rappels à envoyer (RDV de demain)"
                urgent={data.reminders_to_send > 0}
              />
              {isDirection && (
                <Tile
                  to="/pointages/conges"
                  value={data.leave_requests}
                  label="Demandes de congé à traiter"
                  urgent={data.leave_requests > 0}
                />
              )}
            </ul>
          </section>

          <section aria-labelledby="dashboard-workload" className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="dashboard-workload" className="text-lg font-bold">
                Charge de travail atelier
              </h2>
              <span className="text-sm text-muted-foreground">
                {formatHours(totalHours)} déclarées · {activeOrders} OR en cours
              </span>
            </div>
            {data.workload.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ajoute des techniciens pour voir la charge de travail.
              </p>
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2">
                {data.workload.map((row) => (
                  <li
                    key={row.technician_id}
                    className="rounded-lg border bg-card p-3 text-center"
                    style={{
                      borderTopColor: technicianColor({ display_name: row.name, color: row.color }),
                      borderTopWidth: 3,
                    }}
                  >
                    <div className="text-xl font-bold tabular-nums">{formatHours(Number(row.hours))}</div>
                    <div className="truncate text-sm text-muted-foreground">
                      {row.name} ({row.orders} OR)
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
