import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { useProfile } from '@/features/auth/useProfile';
import { MyLeaveSection } from '@/features/leave/MyLeaveSection';
import type { RepairOrderOverview } from '@/features/repair-orders/api';
import { formatDate, formatDuration } from '@/features/repair-orders/constants';
import { todayIso } from '@/features/repair-orders/schemas';
import { StatusBadge } from '@/features/repair-orders/StatusBadge';
import { taskSummary } from '@/features/repair-orders/tasks';
import { cn } from '@/lib/utils';
import { seenState, splitMyOrders, type SeenState } from './domain';
import { useMyRepairOrders, useSeen } from './hooks';

function plannedLabel(order: RepairOrderOverview) {
  if (!order.planned_start) return null;
  const start = order.planned_start.slice(0, 5);
  const day = order.planned_date === todayIso() ? 'prévu' : formatDate(order.planned_date);
  return order.planned_end ? `${day} ${start} → ${order.planned_end.slice(0, 5)}` : `${day} ${start}`;
}

function OrderCard({
  order,
  seen,
  dimmed,
}: {
  order: RepairOrderOverview;
  seen: SeenState;
  dimmed?: boolean;
}) {
  const planned = plannedLabel(order);
  return (
    <Link
      to={`/atelier/or/${order.id}`}
      className={cn(
        'card col gap-2 px-4 py-3.5 transition active:scale-[0.99]',
        seen && 'border-primary',
        dimmed && 'opacity-60',
      )}
    >
      <div className="row between gap-2">
        <span className="row min-w-0 gap-2">
          <span className="plate text-xl">{order.plate}</span>
          {seen === 'new' && <span className="badge solid s-green h-[22px]! text-[11.5px]!">Nouveau</span>}
          {seen === 'updated' && <span className="badge solid s-blue h-[22px]! text-[11.5px]!">Modifié</span>}
        </span>
        <StatusBadge status={order.status} />
      </div>
      <span className="line-clamp-3 text-sm">{taskSummary(order.requested_work)}</span>
      <span className="hint row wrap gap-x-1.5">
        {[order.client_name, planned].filter(Boolean).join(' · ')}
        {order.worked_seconds > 0 && (
          <span className={cn(order.running_since && 'font-semibold text-warning')}>
            · {order.running_since ? 'chrono en cours ' : ''}
            {formatDuration(order.worked_seconds)}
          </span>
        )}
      </span>
    </Link>
  );
}

function RunningCard({ order }: { order: RepairOrderOverview }) {
  return (
    <Link
      to={`/atelier/or/${order.id}`}
      className="card row gap-3 border-[color-mix(in_srgb,var(--primary)_40%,transparent)] bg-accent px-3.5 py-3 text-accent-foreground"
    >
      <span className="warn-t text-lg" aria-hidden>
        ●
      </span>
      <span className="col min-w-0 grow gap-0">
        <b>Chrono en cours · {order.plate}</b>
        <span className="truncate text-[12.5px] opacity-80">{taskSummary(order.requested_work)}</span>
      </span>
      <b className="num font-display text-[22px]">{formatDuration(order.worked_seconds)}</b>
    </Link>
  );
}

const TODAY_LABEL = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

/** Accueil du technicien : ses OR à faire, puis ceux terminés récemment, et ses congés. */
export function TechHomePage() {
  const { data: profile } = useProfile();
  const orders = useMyRepairOrders();
  const seen = useSeen();
  const [showDone, setShowDone] = useState(false);
  const { active, recentlyDone } = splitMyOrders(orders.data ?? []);
  const running = active.find((order) => order.running_since);
  const firstName = profile?.full_name?.split(' ')[0];
  const { hash } = useLocation();

  // Onglet « Congés » de la barre du bas : /#conges
  useEffect(() => {
    if (hash === '#conges') document.getElementById('conges')?.scrollIntoView?.({ behavior: 'smooth' });
  }, [hash]);

  return (
    <div className="col gap-[11px]">
      <div className="row between gap-2">
        <h1 className="title">Bonjour{firstName ? ` ${firstName}` : ''}</h1>
        <span className="sub text-[13px]! first-letter:uppercase">{TODAY_LABEL.format(new Date())}</span>
      </div>

      {running && <RunningCard order={running} />}

      <div className="row between">
        <h2 className="h2">Mes ordres de réparation</h2>
        {orders.isSuccess && <span className="cnt">{active.length}</span>}
      </div>

      {orders.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {orders.isError && <p className="text-destructive">Impossible de charger tes OR.</p>}
      {orders.isSuccess && active.length === 0 && (
        <p className="empty">Aucun OR à faire pour l’instant. 👍</p>
      )}

      <ul className="col gap-[11px]">
        {active.map((order) => (
          <li key={order.id}>
            <OrderCard order={order} seen={seenState(order, seen.data?.[order.id])} />
          </li>
        ))}
      </ul>

      {recentlyDone.length > 0 && (
        <>
          <Button
            variant="ghost"
            className="w-full justify-between"
            aria-expanded={showDone}
            aria-label={`${showDone ? 'Masquer' : 'Voir'} mes OR terminés (${recentlyDone.length} sur 7 jours)`}
            onClick={() => setShowDone((value) => !value)}
          >
            <span>Terminés ({recentlyDone.length})</span>
            <span className="link text-[13px]">{showDone ? 'Masquer' : 'Voir'}</span>
          </Button>
          {showDone && (
            <ul className="col gap-[11px]">
              {recentlyDone.map((order) => (
                <li key={order.id}>
                  <OrderCard order={order} seen={null} dimmed />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <MyLeaveSection />
    </div>
  );
}
