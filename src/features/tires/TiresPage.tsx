import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  BellRing,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Percent,
  Plus,
  Tags,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { SearchField } from '@/components/ListControls';
import { Button } from '@/components/ui/button';
import { CatalogTabs } from '@/features/catalogs/CatalogTabs';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import { setTireMinQty, type TireLine, type TireLot } from './api';
import { BrandsDialog } from './BrandsDialog';
import {
  lineLabel,
  CATEGORY_LABELS,
  CONDITION_LABELS,
  PROFILE_LABELS,
  STATUS_LABELS,
  salesTrend,
  statusClass,
  tiresCount,
  tireSizeKey,
  type TireCategory,
  type TireProfile,
} from './domain';
import { useTireKpis, useTireLines, useTireLots, useTireMutation } from './hooks';
import { Seg } from './Seg';
import { TireDialog } from './TireDialog';

type CategoryFilter = 'all' | TireCategory;
type ProfileFilter = 'all' | Exclude<TireProfile, 'toutes'>;
type StockFilter = 'all' | 'low';

function Kpi({
  icon,
  value,
  label,
  detail,
  alert = false,
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
  detail: ReactNode;
  alert?: boolean;
}) {
  return (
    <li
      className="card kpi"
      style={alert ? { borderColor: 'color-mix(in srgb, var(--destructive) 40%, transparent)' } : undefined}
    >
      <span className={cn('kpi-ico', alert && 'down')}>{icon}</span>
      <div className="col gap-1">
        <span className={cn('kpi-v', alert && 'down')}>{value}</span>
        <span className="text-[13.5px] font-medium">{label}</span>
        <span className="kpi-l">{detail}</span>
      </div>
    </li>
  );
}

/** Seuil mini modifiable sur la ligne : enregistré en quittant le champ (ou Entrée). */
function MinQtyInput({ line }: { line: TireLine }) {
  const [draft, setDraft] = useState<string | null>(null);
  const save = useTireMutation(
    (value: number) => setTireMinQty(line.id, value),
    (_data, value) => `Seuil mini ${lineLabel(line)} : ${tiresCount(value)}`,
  );
  const commit = () => {
    if (draft === null) return;
    const value = Number(draft);
    if (/^\d{1,4}$/.test(draft.trim()) && value !== line.min_qty)
      save.mutate(value, { onSettled: () => setDraft(null) });
    else setDraft(null);
  };
  return (
    <label className="row inline-flex h-8 w-[92px] items-center gap-1 rounded-md border bg-card px-2">
      <span className="sr-only">Seuil mini {lineLabel(line)}</span>
      <input
        className="num w-8 bg-transparent text-[13.5px] font-semibold outline-none"
        inputMode="numeric"
        value={draft ?? String(line.min_qty)}
        disabled={save.isPending}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, '').slice(0, 4))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') setDraft(null);
        }}
      />
      <span className="muted text-xs">pneus</span>
    </label>
  );
}

function LotRows({ lots }: { lots: TireLot[] }) {
  if (lots.length === 0) {
    return (
      <tr className="bg-muted/40">
        <td colSpan={8} className="muted text-[13px]">
          Aucun lot : ajoute des pneus de cette taille avec « Entrée de pneus ».
        </td>
      </tr>
    );
  }
  return lots.map((lot) => (
    <tr key={lot.id} className="bg-muted/40" aria-label={`${lot.brand_name} ${lot.model}`}>
      <td colSpan={2} className="pl-8">
        <Link to={`/stock/pneumatiques/${lot.id}`} className="b link">
          {lot.brand_name} {lot.model}
        </Link>
        <span className="muted block text-xs">
          {CONDITION_LABELS[lot.condition]}
          {lot.location ? ` · ${lot.location}` : ''}
          {lot.supplier_name ? ` · ${lot.supplier_name}` : ''}
        </span>
      </td>
      <td className="num">
        {lot.stock_qty}
        {lot.reserved_qty > 0 && (
          <span className="muted block text-xs">dont {lot.reserved_qty} réservés</span>
        )}
      </td>
      <td />
      <td className="num text-[13px]">vente {formatEuro(lot.sale_price)}</td>
      <td className="num text-[13px]">{formatEuro(lot.purchase_price)}</td>
      <td className="num">
        {lot.sold_90d > 0 ? <span className="muted text-xs">{lot.sold_90d} sur 90 j</span> : null}
      </td>
      <td className="r">
        <Link
          to={`/stock/pneumatiques/${lot.id}`}
          className="ibtn sm ghost"
          aria-label={`Ouvrir ${lot.brand_name} ${lot.model}`}
        >
          <ChevronRight className="i s" />
        </Link>
      </td>
    </tr>
  ));
}

/**
 * Stock des pneumatiques (P01) : compté par taille et profil, quelle que soit la marque ou le
 * fournisseur. Seuil mini modifiable sur chaque ligne ; en dessous, la ligne est « À commander »
 * (ou « Rupture ») et la direction et la réception sont prévenues.
 */
export function TiresPage() {
  const [params, setParams] = useSearchParams();
  const lines = useTireLines();
  const lots = useTireLots();
  const kpis = useTireKpis();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [profile, setProfile] = useState<ProfileFilter>('all');
  const stockFilter: StockFilter = params.get('filtre') === 'seuil' ? 'low' : 'all';
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [brands, setBrands] = useState(false);

  const setStockFilter = (value: StockFilter) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === 'low') next.set('filtre', 'seuil');
        else next.delete('filtre');
        return next;
      },
      { replace: true },
    );

  const low = useMemo(() => (lines.data ?? []).filter((line) => line.status !== 'ok'), [lines.data]);
  const rows = useMemo(() => {
    const term = tireSizeKey(search);
    return (lines.data ?? []).filter(
      (line) =>
        (!term || tireSizeKey(line.size).startsWith(term)) &&
        (category === 'all' || line.category === category) &&
        (profile === 'all' || line.profile === profile) &&
        (stockFilter === 'all' || line.status !== 'ok'),
    );
  }, [lines.data, search, category, profile, stockFilter]);
  const lotsByLine = useMemo(() => {
    const map = new Map<string, TireLot[]>();
    for (const lot of lots.data ?? []) map.set(lot.line_id, [...(map.get(lot.line_id) ?? []), lot]);
    return map;
  }, [lots.data]);

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const k = kpis.data;
  const trend = k ? salesTrend(k.sold_30d, k.sold_prev_30d) : null;

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Stock et catalogues' }, { label: 'Pneumatiques' }]}
        title="Pneumatiques"
        actions={
          <>
            <Button variant="outline" onClick={() => setBrands(true)}>
              <Tags /> Marques et dimensions
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus /> Entrée de pneus
            </Button>
          </>
        }
      />

      <div className="col gap-4">
        <div className="toolbar flex-wrap">
          <CatalogTabs />
        </div>

        {k && (
          <ul className="grid grid-cols-2 gap-3.5 xl:grid-cols-4" aria-label="Chiffres du stock des pneus">
            <Kpi
              icon={<CircleDot className="i s" />}
              value={k.stock_qty}
              label="Pneus en stock"
              detail={`${k.sizes} taille${k.sizes > 1 ? 's' : ''} · ${k.lots} lot${k.lots > 1 ? 's' : ''}`}
            />
            <Kpi
              icon={<TriangleAlert className="i s" />}
              value={k.to_order + k.out}
              label="Sous le seuil mini"
              detail={`${k.to_order} à commander · ${k.out} en rupture`}
              alert={k.to_order + k.out > 0}
            />
            <Kpi
              icon={<TrendingUp className="i s" />}
              value={k.sold_30d}
              label="Pneus vendus sur 30 jours"
              detail={[`${formatEuro(k.revenue_30d)} HT`, trend].filter(Boolean).join(' · ')}
            />
            <Kpi
              icon={<Percent className="i s" />}
              value={k.margin_percent === null ? '-' : `${String(k.margin_percent).replace('.', ',')} %`}
              label="Marge moyenne"
              detail={`(vente - achat) / achat · ${formatEuro(k.margin_30d)} HT`}
            />
          </ul>
        )}

        {low.length > 0 && (
          <div className="alert s-bad row flex-wrap items-center gap-3" role="status">
            <BellRing className="i s shrink-0" />
            <span className="min-w-0 flex-1">
              {low.length} taille{low.length > 1 ? 's' : ''} sous le seuil : {low.map(lineLabel).join(', ')}.
              Alerte envoyée à la direction et à la réception (cloche et push).
            </span>
          </div>
        )}

        <div className="toolbar flex-wrap">
          <SearchField
            className="sm:w-[260px]"
            aria-label="Rechercher une taille"
            placeholder="Taille (31580225)…"
            inputMode="numeric"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Seg
            label="Catégorie"
            value={category}
            options={[
              { value: 'all', label: 'Tous' },
              { value: 'pl', label: 'PL' },
              { value: 'vul', label: 'VUL' },
            ]}
            onChange={setCategory}
          />
          <Seg
            label="Profil"
            value={profile}
            options={[
              { value: 'all', label: 'Tous profils' },
              { value: 'avant', label: 'Avant' },
              { value: 'arriere', label: 'Arrière' },
              { value: 'remorque', label: 'Remorque' },
            ]}
            onChange={setProfile}
          />
          <Seg
            label="Seuil"
            className="sm:ml-auto"
            value={stockFilter}
            options={[
              { value: 'all', label: 'Toutes' },
              { value: 'low', label: 'Sous le seuil' },
            ]}
            onChange={setStockFilter}
          />
        </div>

        {lines.isPending && <p className="text-muted-foreground">Chargement…</p>}
        {lines.isError && <p className="text-destructive">Impossible de charger le stock des pneus.</p>}
        {lines.data?.length === 0 && (
          <p className="empty">Aucun pneu en stock : ajoute le premier arrivage avec « Entrée de pneus ».</p>
        )}
        {lines.data && lines.data.length > 0 && (
          <div className="card tbl-wrap overflow-x-auto!">
            {rows.length === 0 ? (
              <p className="empty">Aucune taille ne correspond aux filtres.</p>
            ) : (
              <table className="tbl" aria-label="Stock des pneus">
                <thead>
                  <tr>
                    <th>Taille</th>
                    <th>Profil</th>
                    <th>En stock</th>
                    <th>Seuil mini</th>
                    <th>Lots par marque</th>
                    <th>Prix d’achat moyen</th>
                    <th>Vendus 30 j</th>
                    <th className="w-[48px]">
                      <span className="sr-only">Lots</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((line) => {
                    const expanded = open.has(line.id);
                    return (
                      <Fragment key={line.id}>
                        <tr aria-label={lineLabel(line)}>
                          <td>
                            <span className="c2">
                              <b className="num font-medium">{line.size}</b>
                              <span>{CATEGORY_LABELS[line.category]}</span>
                            </span>
                          </td>
                          <td>{PROFILE_LABELS[line.profile]}</td>
                          <td>
                            <span className="row gap-2">
                              <b className={cn('num text-[15px]', line.status !== 'ok' && 'down')}>
                                {line.stock_qty}
                              </b>
                              {(line.min_qty > 0 || line.stock_qty > 0) && (
                                <span className={cn('badge', statusClass(line.status))}>
                                  {STATUS_LABELS[line.status]}
                                </span>
                              )}
                            </span>
                            {line.reserved_qty > 0 && (
                              <span className="muted block text-xs">dont {line.reserved_qty} réservés</span>
                            )}
                          </td>
                          <td>
                            <MinQtyInput line={line} />
                          </td>
                          <td className={cn(!line.brands && 'muted')}>
                            {line.brands ?? 'Plus de lot en stock'}
                          </td>
                          <td className="num muted">
                            {line.avg_purchase_price === null
                              ? '-'
                              : `${formatEuro(line.avg_purchase_price)} HT`}
                          </td>
                          <td className="num b">{line.sold_30d}</td>
                          <td className="r">
                            <button
                              type="button"
                              className="ibtn sm ghost"
                              aria-expanded={expanded}
                              aria-label={`${expanded ? 'Masquer' : 'Voir'} les lots ${lineLabel(line)}`}
                              onClick={() => toggle(line.id)}
                            >
                              {expanded ? <ChevronDown className="i s" /> : <ChevronRight className="i s" />}
                            </button>
                          </td>
                        </tr>
                        {expanded && <LotRows lots={lotsByLine.get(line.id) ?? []} />}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="hint border-t px-4 py-2.5">
              Le stock se compte par taille et profil, quelle que soit la marque ou le fournisseur. Seuil mini
              modifiable sur chaque ligne ; les pneus au devis ou sur un OR sont réservés et sortent du stock
              quand la facture est émise.
            </p>
          </div>
        )}
      </div>

      {adding && <TireDialog onClose={() => setAdding(false)} />}
      {brands && <BrandsDialog onClose={() => setBrands(false)} />}
    </>
  );
}
