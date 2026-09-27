import { useState } from 'react';
import { Link } from 'react-router';
import { CalendarClock, Timer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useProfile } from '@/features/auth/useProfile';
import { MyLeaveSection } from '@/features/leave/MyLeaveSection';
import type { RepairOrderOverview } from '@/features/repair-orders/api';
import { formatDate, formatDuration } from '@/features/repair-orders/constants';
import { StatusBadge } from '@/features/repair-orders/StatusBadge';
import { cn } from '@/lib/utils';
import { seenState, splitMyOrders, type SeenState } from './domain';
import { useMyRepairOrders, useSeen } from './hooks';

function OrderCard({
  order,
  seen,
  dimmed,
}: {
  order: RepairOrderOverview;
  seen: SeenState;
  dimmed?: boolean;
}) {
  return (
    <Link
      to={`/atelier/or/${order.id}`}
      className={cn(
        'block rounded-xl border bg-card p-4 shadow-xs transition active:scale-[0.99]',
        seen && 'border-primary ring-1 ring-primary',
        dimmed && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-2xl font-bold tracking-wide">{order.plate}</div>
          <div className="text-muted-foreground">{order.client_name ?? ''}</div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge status={order.status} />
          {seen === 'new' && <Badge>Nouveau</Badge>}
          {seen === 'updated' && <Badge variant="outline">Modifié</Badge>}
        </div>
      </div>
      <p className="mt-2 line-clamp-3 text-base">{order.requested_work}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {order.planned_start && (
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-4" />
            {formatDate(order.planned_date)} à {order.planned_start.slice(0, 5)}
          </span>
        )}
        <span
          className={cn(
            'inline-flex items-center gap-1',
            order.running_since && 'font-semibold text-warning',
          )}
        >
          <Timer className="size-4" />
          {order.running_since ? 'Chrono en cours · ' : ''}
          {formatDuration(order.worked_seconds)}
        </span>
        <span>{order.number}</span>
      </div>
    </Link>
  );
}

/** Accueil du technicien : ses OR à faire, puis ceux terminés récemment. */
export function TechHomePage() {
  const { data: profile } = useProfile();
  const orders = useMyRepairOrders();
  const seen = useSeen();
  const [showDone, setShowDone] = useState(false);
  const { active, recentlyDone } = splitMyOrders(orders.data ?? []);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-3xl font-bold">Mes ordres de réparation</h1>
        <p className="text-muted-foreground">
          Espace Technicien{profile?.full_name ? ` · ${profile.full_name}` : ''}
        </p>
      </div>

      {orders.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {orders.isError && <p className="text-destructive">Impossible de charger tes OR.</p>}
      {orders.isSuccess && active.length === 0 && (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          Aucun OR à faire pour l’instant. 👍
        </p>
      )}

      <ul className="space-y-3">
        {active.map((order) => (
          <li key={order.id}>
            <OrderCard order={order} seen={seenState(order, seen.data?.[order.id])} />
          </li>
        ))}
      </ul>

      {recentlyDone.length > 0 && (
        <div className="space-y-3">
          <Button variant="ghost" className="w-full" onClick={() => setShowDone((value) => !value)}>
            {showDone ? 'Masquer' : 'Voir'} mes OR terminés ({recentlyDone.length} sur 7 jours)
          </Button>
          {showDone && (
            <ul className="space-y-3">
              {recentlyDone.map((order) => (
                <li key={order.id}>
                  <OrderCard order={order} seen={null} dimmed />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <MyLeaveSection />
    </div>
  );
}
