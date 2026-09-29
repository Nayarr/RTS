import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Clock, Tv } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { useProfile } from '@/features/auth/useProfile';
import { formatDuration, STATUS_META } from '@/features/repair-orders/constants';
import { useRepairOrders } from '@/features/repair-orders/hooks';
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

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Atelier en direct</h1>
          <p className="text-muted-foreground">
            {orders.isSuccess &&
              `${list.length} véhicule${list.length > 1 ? 's' : ''} actuellement à l’atelier.`}
          </p>
        </div>
        {profile?.role === 'direction' && (
          <Button variant="outline" size="lg" onClick={() => setConfirmTv(true)}>
            <Tv /> Écran atelier (télé)
          </Button>
        )}
      </div>

      {orders.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {orders.isError && <p className="text-destructive">Impossible de charger l’atelier.</p>}
      {orders.isSuccess && list.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Aucun véhicule à l’atelier en ce moment.
        </p>
      )}

      <ul className="grid gap-3 md:grid-cols-2">
        {list.map((order) => {
          const meta = STATUS_META[order.status];
          return (
            <li key={order.id}>
              <Link
                to={`/or/${order.id}`}
                aria-label={`${order.plate} — ${order.number}`}
                className="block space-y-1 rounded-lg border bg-card p-4 transition hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <strong className="text-lg">{order.plate}</strong>
                  <span className="text-sm font-bold" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                </div>
                <p>
                  {order.client_name ?? '—'} — Technicien :{' '}
                  <span className="font-medium">{order.technician_name ?? '—'}</span>
                </p>
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  {order.running_since ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-warning">
                      <Clock className="size-4" /> Badgeage en cours
                    </span>
                  ) : (
                    formatDuration(order.worked_seconds)
                  )}
                  {order.requested_work && <span className="truncate">— {order.requested_work}</span>}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={confirmTv}
        onOpenChange={setConfirmTv}
        title="Transformer cet appareil en écran d’atelier ?"
        description="Il n’affichera plus que le tableau de l’atelier. Pour en sortir : roue ⚙ en bas à droite, puis le code de sortie de la borne."
        confirmLabel="Passer en écran télé"
        pending={checking}
        onConfirm={() => void startTv()}
      />
    </div>
  );
}
