import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  ChevronRight,
  CircleCheck,
  FileText,
  MessageSquare,
  Plus,
  Send,
  TriangleAlert,
  Users,
  Wrench,
} from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { AlertsBell } from '@/features/alerts/AlertsBell';
import { ROLE_LABELS } from '@/features/auth/roles';
import { useProfile } from '@/features/auth/useProfile';
import { STATUS_META, STATUS_ORDER } from '@/features/repair-orders/constants';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import { fetchOfficeDashboard } from './api';
import { WorkloadCard } from './WorkloadCard';

/** « Mercredi 30 septembre » */
function todayLabel() {
  const label = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

interface TileProps {
  to: string;
  value: number;
  label: string;
  color: string;
  /** Mise en avant quand il y a quelque chose à faire. */
  urgent?: boolean;
  /** Couleur de pastille imposée (sinon celle de la tuile). */
  badgeClass?: string;
}

function Tile({ to, value, label, color, urgent, badgeClass }: TileProps) {
  return (
    <li>
      <Link
        to={to}
        className={cn('tile h-full transition-colors hover:bg-hover', urgent && 'hot')}
        style={{ '--c': color } as CSSProperties}
      >
        <span className={cn('badge dot self-start', badgeClass)}>{label}</span>
        <span className={cn('kpi-v', urgent && 'down')}>{value}</span>
      </Link>
    </li>
  );
}

interface TodoProps {
  to: string;
  icon: ReactNode;
  label: ReactNode;
  value: number;
  /** Nombre en pastille rouge (quelque chose attend une action) plutôt qu'en chiffre. */
  urgent?: boolean;
  badge?: string;
}

function Todo({ to, icon, label, value, urgent, badge }: TodoProps) {
  return (
    <li>
      <Link className="li" to={to}>
        <span className="row">
          <span className="kpi-ico">{icon}</span>
          <span>{label}</span>
        </span>
        <span className="row gap-2">
          {urgent && value > 0 ? (
            <span className="badge s-bad">{badge ?? value}</span>
          ) : (
            <b className="num text-[15px] font-semibold">{value}</b>
          )}
          <ChevronRight className="size-4 text-muted-foreground" />
        </span>
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
  const todoCount = data
    ? [
        data.quotes_awaiting_response,
        data.quotes_to_convert,
        data.overdue_invoices.count,
        data.appointments_today,
        data.reminders_to_send,
        isDirection ? data.leave_requests : 0,
      ].filter((value) => value > 0).length
    : 0;

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Accueil' }]}
        title="Tableau de bord"
        actions={
          <>
            <span className="tag hidden h-8 px-3 text-[13px] sm:inline-flex">
              <CalendarDays className="size-3.5" />
              {todayLabel()}
            </span>
            <AlertsBell />
            <Button variant="outline" asChild>
              <Link to="/rendez-vous">
                <CalendarDays /> Rendez-vous
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/devis/nouveau">
                <FileText /> Nouveau devis
              </Link>
            </Button>
            <Button asChild>
              <Link to="/or/nouveau">
                <Plus /> Nouvel OR
              </Link>
            </Button>
          </>
        }
      />

      <div className="col gap-1">
        <h2 className="title xl">Bonjour {profile?.full_name || profile?.email}</h2>
        <p className="sub">
          Espace {profile ? ROLE_LABELS[profile.role] : ''} · voici ce qui attend une action aujourd’hui.
        </p>
      </div>

      {dashboard.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {dashboard.isError && <p className="text-destructive">Impossible de charger le tableau de bord.</p>}

      {data && (
        <>
          <section aria-labelledby="dashboard-orders" className="col gap-2.5">
            <div className="row between">
              <h2 id="dashboard-orders" className="h2">
                <Wrench className="i" /> Ordres de réparation
              </h2>
              <Link className="link text-[13.5px]" to="/or">
                Voir tous les OR →
              </Link>
            </div>
            <ul className="kstrip grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
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
                color="#B5453A"
                badgeClass="s-bad"
                urgent={data.parts_to_order > 0}
              />
            </ul>
          </section>

          <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <section data-slot="card" className="card flat" aria-labelledby="dashboard-todo">
              <div className="card-h">
                <h2 className="h2" id="dashboard-todo">
                  À suivre
                </h2>
                <span className="cnt">{todoCount}</span>
              </div>
              <ul>
                <Todo
                  to="/devis?filtre=sent"
                  icon={<Send className="size-4" />}
                  label="Devis en attente de réponse"
                  value={data.quotes_awaiting_response}
                />
                <Todo
                  to="/devis?filtre=accepted"
                  icon={<CircleCheck className="size-4" />}
                  label="Devis acceptés à transformer en OR"
                  value={data.quotes_to_convert}
                  urgent
                  badge={`${data.quotes_to_convert} à traiter`}
                />
                <Todo
                  to="/factures?filtre=overdue"
                  icon={<TriangleAlert className="size-4" />}
                  label={
                    <>
                      Factures en retard
                      {data.overdue_invoices.count > 0 && (
                        <span className="muted"> ({formatEuro(data.overdue_invoices.balance_due)})</span>
                      )}
                    </>
                  }
                  value={data.overdue_invoices.count}
                  urgent
                />
                <Todo
                  to="/planning?vue=jour"
                  icon={<CalendarDays className="size-4" />}
                  label="Rendez-vous aujourd’hui"
                  value={data.appointments_today}
                />
                <Todo
                  to="/rendez-vous"
                  icon={<MessageSquare className="size-4" />}
                  label={
                    <>
                      Rappels à envoyer <span className="muted">(RDV de demain)</span>
                    </>
                  }
                  value={data.reminders_to_send}
                  urgent
                />
                {isDirection && (
                  <Todo
                    to="/pointages/conges"
                    icon={<Users className="size-4" />}
                    label="Demandes de congé à traiter"
                    value={data.leave_requests}
                    urgent
                  />
                )}
              </ul>
            </section>

            <WorkloadCard />
          </div>
        </>
      )}
    </>
  );
}
