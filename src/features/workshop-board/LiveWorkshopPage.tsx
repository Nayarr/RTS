import { useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import { Clock, Truck, Tv, Users, UserX } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { initials } from '@/app/nav';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { useProfile } from '@/features/auth/useProfile';
import { formatDuration } from '@/features/repair-orders/constants';
import { useRepairOrders } from '@/features/repair-orders/hooks';
import { StatusBadge } from '@/features/repair-orders/StatusBadge';
import { taskSummary } from '@/features/repair-orders/tasks';
import { cn } from '@/lib/utils';
import { exitCodeIsSet } from './api';
import { setTvMode, workshopOrders } from './domain';

/** Atelier en direct : véhicules à l'atelier, technicien, badgeage ; accès à l'écran télé. */
export function LiveWorkshopPage() {
  const { data: profile } = useProfile();
  const orders = useRepairOrders();
  const navigate = useNavigate();
  const [confirmTv, setConfirmTv] = useState(false);
  const [checking, setChecking] = useState(false);
  const list = workshopOrders(orders.data ?? []);

  const startTv = async () => {
    setChecking(true);
    try {
      if (!(await exitCodeIsSet())) {
        toast.error(
          'Choisis d’abord le code de sortie de la borne (Pointages), il sert aussi à quitter la télé.',
        );
        return;
      }
      setTvMode(true);
      void navigate('/tele');
    } catch {
      toast.error('Vérification impossible : vérifie la connexion');
    } finally {
      setChecking(false);
      setConfirmTv(false);
    }
  };

  // Une colonne par technicien (ordre d'apparition), puis les OR non assignés.
  const lanes = new Map<string, { name: string; color: string; orders: typeof list }>();
  for (const order of list) {
    const key = order.technician_name ?? '';
    const lane = lanes.get(key) ?? {
      name: order.technician_name ?? 'Non assigné',
      color: order.technician_name ? (order.technician_color ?? '#6B7280') : '#9aa0a6',
      orders: [],
    };
    lane.orders.push(order);
    lanes.set(key, lane);
  }
  const columns = [...lanes.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'fr')))
    .map(([, lane]) => lane);
  const running = list.filter((order) => order.running_since).length;
  const unassigned = list.filter((order) => !order.technician_name).length;
  const technicians = columns.filter((lane) => lane.name !== 'Non assigné').length;

  const kpis = [
    { icon: <Truck className="i s" />, value: list.length, label: 'véhicules actuellement à l’atelier' },
    { icon: <Clock className="i s" />, value: running, label: 'badgeages en cours', tone: 'warn-t' },
    { icon: <Users className="i s" />, value: technicians, label: 'techniciens sur un OR' },
    { icon: <UserX className="i s" />, value: unassigned, label: 'OR non assigné', tone: 'down' },
  ];

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Atelier' }, { label: 'Atelier en direct' }]}
        title="Atelier en direct"
        actions={
          <>
            <span className="badge dot s-green h-[30px]">Mis à jour en continu</span>
            {profile?.role === 'direction' && (
              <Button variant="outline" onClick={() => setConfirmTv(true)}>
                <Tv /> Écran atelier (télé)
              </Button>
            )}
          </>
        }
      />

      {orders.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {orders.isError && <p className="text-destructive">Impossible de charger l’atelier.</p>}
      {orders.isSuccess && (
        <p className="sr-only">
          {`${list.length} véhicule${list.length > 1 ? 's' : ''} actuellement à l’atelier.`}
        </p>
      )}

      {orders.isSuccess && (
        <ul className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <li key={kpi.label} className="card kpi flex-row items-center px-4 py-3.5">
              <span className={cn('kpi-ico', kpi.tone)}>{kpi.icon}</span>
              <div className="col gap-0.5">
                <span className="kpi-v text-[26px]">{kpi.value}</span>
                <span className="kpi-l">{kpi.label}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {orders.isSuccess && list.length === 0 && (
        <p className="empty">Aucun véhicule à l’atelier en ce moment.</p>
      )}

      {/* Colonnes jamais plus larges que l'écran : le texte long est tronqué dans la carte. */}
      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {columns.map((lane) => (
          <section
            key={lane.name}
            aria-label={lane.name}
            className="col min-w-0 gap-2.5 rounded-[10px] bg-muted p-2.5"
            style={{ '--c': lane.color } as CSSProperties}
          >
            <div className="row mb-0.5 gap-2 border-b-[3px] border-(--c) px-1 pt-1 pb-1.5">
              <span className="av sm" style={{ '--c': lane.color } as CSSProperties}>
                {lane.name === 'Non assigné' ? '—' : initials(lane.name)}
              </span>
              <b className="grow">{lane.name}</b>
              <span className="cnt bg-card">{lane.orders.length}</span>
            </div>
            <ul className="col gap-2.5">
              {lane.orders.map((order) => (
                <li key={order.id} className="min-w-0">
                  <Link
                    to={`/or/${order.id}`}
                    aria-label={`${order.plate} — ${order.number}`}
                    className={cn(
                      'card col gap-2 px-3.5 py-3 hover:bg-hover',
                      order.running_since &&
                        'border-[color-mix(in_srgb,var(--primary)_55%,transparent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_12%,transparent)]',
                    )}
                  >
                    <div className="row between gap-2">
                      <span className="plate truncate">{order.plate}</span>
                      <StatusBadge status={order.status} className="h-[22px] px-2 text-[11.5px]" />
                    </div>
                    <span className="truncate text-[13px] font-medium">
                      {order.client_name ?? '—'}
                      <span className="sr-only"> — Technicien : {order.technician_name ?? '—'}</span>
                    </span>
                    {order.requested_work && (
                      <span className="muted truncate text-[12.5px]">
                        {taskSummary(order.requested_work)}
                      </span>
                    )}
                    {order.running_since ? (
                      <span className="row warn-t gap-1.5 text-[12.5px] font-semibold">
                        <Clock className="i xs" /> Badgeage en cours
                      </span>
                    ) : (
                      <span className="row muted num gap-1.5 text-[12.5px]">
                        <Clock className="i xs" /> {formatDuration(order.worked_seconds)} · {order.number}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <ConfirmDialog
        open={confirmTv}
        onOpenChange={setConfirmTv}
        title="Transformer cet appareil en écran d’atelier ?"
        description="Il n’affichera plus que le tableau de l’atelier. Pour en sortir : roue ⚙ en bas à droite, puis le code de sortie de la borne."
        confirmLabel="Passer en écran télé"
        pending={checking}
        onConfirm={() => void startTv()}
      />
    </>
  );
}
