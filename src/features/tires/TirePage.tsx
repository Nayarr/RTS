import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowDown, ArrowUp, ListChecks, Pencil, Truck, Wrench } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import type { TireMovement } from './api';
import { CATEGORY_LABELS, CONDITION_LABELS, PROFILE_LABELS, tiresCount } from './domain';
import { useTireLot, useTireMovements } from './hooks';
import { Seg } from './Seg';
import { CorrectionDialog, ReceiveDialog } from './StockDialogs';
import { TireDialog } from './TireDialog';

type MovementFilter = 'all' | 'in' | 'out';

const WHEN = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const SHOWN = 8;

function Fact({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="row justify-between gap-3 border-b px-4 py-2.5 text-[13.5px] last:border-b-0">
      <dt className="muted">{label}</dt>
      <dd className={cn('b text-right', mono && 'num')}>{value || '-'}</dd>
    </div>
  );
}

function MovementRow({ movement, balance }: { movement: TireMovement; balance: number }) {
  const sale = movement.reason === 'sale';
  const title = sale
    ? `Posés sur ${movement.repair_order_number ?? movement.note ?? 'facture'}${movement.plate ? ` · ${movement.plate}` : ''}`
    : movement.reason === 'entry'
      ? movement.supplier_name
        ? `Réception fournisseur ${movement.supplier_name}`
        : 'Entrée en stock'
      : movement.quantity < 0
        ? 'Sortie de stock'
        : 'Correction d’inventaire';
  const detail = sale
    ? [movement.client_name, movement.note].filter(Boolean).join(' · ')
    : movement.reason === 'entry'
      ? [
          movement.reference && `Bon de livraison ${movement.reference}`,
          movement.unit_purchase_price !== null && `${formatEuro(movement.unit_purchase_price)} HT le pneu`,
        ]
          .filter(Boolean)
          .join(' · ')
      : movement.note;
  const Icon = sale ? Wrench : movement.reason === 'entry' ? Truck : ListChecks;
  return (
    <li className="row items-start gap-3 border-b px-4 py-3 last:border-b-0">
      <span className={cn('kpi-ico shrink-0', movement.reason === 'correction' && 'down')}>
        <Icon className="i s" />
      </span>
      <div className="col min-w-0 flex-1">
        {sale && movement.repair_order_id ? (
          <Link to={`/or/${movement.repair_order_id}`} className="b link">
            {title}
          </Link>
        ) : (
          <b className={cn(sale && 'text-primary')}>{title}</b>
        )}
        {detail && <span className="muted text-xs">{detail}</span>}
      </div>
      <div className="col items-end text-xs">
        <span>{WHEN.format(new Date(movement.created_at))}</span>
        <span className="muted">{movement.author_name ?? ''}</span>
      </div>
      <div className="col w-[64px] items-end">
        <b className={cn('num text-[15px]', movement.quantity > 0 ? 'up' : 'down')}>
          {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
        </b>
        <span className="muted text-xs">reste {balance}</span>
      </div>
    </li>
  );
}

/** Fiche d'un lot de pneus (P03) : chiffres, caractéristiques et mouvements de stock. */
export function TirePage() {
  const { id = '' } = useParams();
  const lot = useTireLot(id);
  const movements = useTireMovements(id);
  const [filter, setFilter] = useState<MovementFilter>('all');
  const [all, setAll] = useState(false);
  const [dialog, setDialog] = useState<'edit' | 'receive' | 'correct' | null>(null);
  const [since90] = useState(() => new Date(Date.now() - 90 * 86_400_000).toISOString());

  // Stock après chaque mouvement (les plus récents d'abord)
  const rows = useMemo(() => {
    const list = movements.data ?? [];
    const stock = lot.data?.stock_qty ?? 0;
    return list
      .map((movement, index) => ({
        movement,
        balance: stock - list.slice(0, index).reduce((sum, previous) => sum + previous.quantity, 0),
      }))
      .filter(
        ({ movement }) =>
          filter === 'all' || (filter === 'in' ? movement.quantity > 0 : movement.quantity < 0),
      );
  }, [movements.data, lot.data?.stock_qty, filter]);

  if (lot.isPending) return <p className="text-muted-foreground">Chargement…</p>;
  if (lot.isError) return <p className="text-destructive">Impossible de charger ce pneu.</p>;
  if (!lot.data) return <p className="empty">Pneu introuvable.</p>;
  const t = lot.data;
  const orders = new Set(
    (movements.data ?? [])
      .filter((movement) => movement.reason === 'sale' && movement.created_at >= since90)
      .map((movement) => movement.repair_order_id)
      .filter(Boolean),
  ).size;
  const margin =
    t.purchase_price && t.sale_price !== null
      ? Math.round(((t.sale_price - t.purchase_price) / t.purchase_price) * 100)
      : null;
  const name = [t.brand_name, t.model].filter(Boolean).join(' ');

  return (
    <>
      <PageHeader
        back={{ to: '/stock/pneumatiques', label: 'Retour au stock des pneus' }}
        crumbs={[{ label: 'Pneumatiques', to: '/stock/pneumatiques' }, { label: t.size }]}
        title={
          <span className="row flex-wrap items-center gap-x-2.5 gap-y-1">
            {name} · {t.size}
            <span className="badge text-xs font-medium">
              {CATEGORY_LABELS[t.category]} · {PROFILE_LABELS[t.profile]}
            </span>
            <span className="badge s-green text-xs font-medium">{CONDITION_LABELS[t.condition]}</span>
          </span>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setDialog('edit')}>
              <Pencil /> Modifier
            </Button>
            <Button variant="outline" onClick={() => setDialog('correct')}>
              <ArrowUp /> Sortie / correction
            </Button>
            <Button onClick={() => setDialog('receive')}>
              <ArrowDown /> Entrée de stock
            </Button>
          </>
        }
      />

      <div className="col gap-4">
        <ul className="grid grid-cols-2 gap-3.5 xl:grid-cols-4" aria-label="Chiffres du pneu">
          <li className="card kpi">
            <span className="kpi-v">{t.stock_qty}</span>
            <span className="col">
              <span className="text-[13.5px] font-medium">En stock</span>
              <span className="kpi-l">
                {[`mini ${t.min_qty ?? 0}`, t.reserved_qty > 0 && `${t.reserved_qty} réservés`, t.location]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
          </li>
          <li className="card kpi">
            <span className="kpi-v">{t.sold_90d}</span>
            <span className="col">
              <span className="text-[13.5px] font-medium">Posés sur 90 jours</span>
              <span className="kpi-l">{orders} OR</span>
            </span>
          </li>
          <li className="card kpi">
            <span className="kpi-v">{formatEuro(t.sale_price)}</span>
            <span className="col">
              <span className="text-[13.5px] font-medium">Prix de vente HT</span>
              <span className="kpi-l">
                achat {formatEuro(t.purchase_price)}
                {margin !== null && ` · marge ${margin} %`}
              </span>
            </span>
          </li>
          <li className="card kpi">
            <span className="kpi-v">{formatEuro((t.purchase_price ?? 0) * t.stock_qty)}</span>
            <span className="col">
              <span className="text-[13.5px] font-medium">Valeur du stock</span>
              <span className="kpi-l">au prix d’achat HT</span>
            </span>
          </li>
        </ul>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <section data-slot="card" className="card self-start p-0!" aria-label="Caractéristiques">
            <h2 className="sec-t border-b px-4 py-3">Caractéristiques</h2>
            <dl>
              <Fact label="Dimension" value={t.size} mono />
              <Fact label="Indices charge / vitesse" value={t.load_index} mono />
              <Fact label="Profil" value={PROFILE_LABELS[t.profile]} />
              <Fact label="État" value={CONDITION_LABELS[t.condition]} />
              <Fact label="DOT (fabrication)" value={t.dot} mono />
              <Fact label="Fournisseur habituel" value={t.supplier_name} />
              <Fact label="Emplacement" value={t.location} />
              <Fact label="Stock mini (taille et profil)" value={tiresCount(t.min_qty ?? 0)} />
            </dl>
            <p className="hint border-t px-4 py-3">
              Proposé au devis quand le technicien relève la taille {t.size} sur la fiche de contrôle.
            </p>
          </section>

          <section data-slot="card" className="card p-0!" aria-label="Mouvements de stock">
            <div className="row flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <h2 className="sec-t">Mouvements de stock</h2>
              <Seg
                label="Mouvements affichés"
                value={filter}
                options={[
                  { value: 'all', label: 'Tout' },
                  { value: 'in', label: 'Entrées' },
                  { value: 'out', label: 'Sorties' },
                ]}
                onChange={setFilter}
              />
            </div>
            {movements.isPending && <p className="muted px-4 py-3">Chargement…</p>}
            {rows.length === 0 && movements.isSuccess && <p className="empty">Aucun mouvement.</p>}
            <ul aria-label="Mouvements">
              {(all ? rows : rows.slice(0, SHOWN)).map(({ movement, balance }) => (
                <MovementRow key={movement.id} movement={movement} balance={balance} />
              ))}
            </ul>
            {!all && rows.length > SHOWN && (
              <button
                type="button"
                className="b link px-4 py-3 text-left text-[13.5px]"
                onClick={() => setAll(true)}
              >
                Voir tout l’historique ({rows.length} mouvements)
              </button>
            )}
          </section>
        </div>
      </div>

      {dialog === 'edit' && <TireDialog lot={t} onClose={() => setDialog(null)} />}
      {dialog === 'receive' && <ReceiveDialog lot={t} onClose={() => setDialog(null)} />}
      {dialog === 'correct' && <CorrectionDialog lot={t} onClose={() => setDialog(null)} />}
    </>
  );
}
