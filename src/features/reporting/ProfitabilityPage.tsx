import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { todayIso } from '@/features/repair-orders/schemas';
import { cn } from '@/lib/utils';
import {
  gapTone,
  groupByClient,
  hoursGapPercent,
  periodRange,
  realHourlyRate,
  revenue,
  type Period,
  type ProfitabilityFigures,
} from './analysis';
import { fetchProfitability } from './api';
import { formatEuroRounded } from './domain';
import { PeriodFilter } from './PeriodFilter';
import { ReportingHeader } from './ReportingTabs';
import { usePeriod } from './use-period';

const PERIODS: Period[] = ['mois', 'trimestre', 'annee', 'tout'];
const GAP_CLASS = { bad: 'down', good: 'up', neutral: '' } as const;

const hours = (value: number) => `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h`;

/** Colonnes chiffrées communes aux lignes client, véhicule et total. */
function FigureCells({ figures, unpaid }: { figures: ProfitabilityFigures; unpaid?: number }) {
  const gap = hoursGapPercent(figures);
  const rate = realHourlyRate(figures);
  return (
    <>
      <td className="r num">{figures.ro_count}</td>
      <td className="r num b">{formatEuroRounded(revenue(figures))}</td>
      <td className="r num">{formatEuroRounded(figures.labor_ht)}</td>
      <td className="r num">{formatEuroRounded(figures.parts_ht)}</td>
      <td className={cn('r num', figures.parts_margin_ht < 0 ? 'down' : '')}>
        {formatEuroRounded(figures.parts_margin_ht)}
      </td>
      <td className="r num">{hours(figures.billed_hours)}</td>
      <td className="r num">{hours(figures.worked_hours)}</td>
      <td className={cn('r num b', GAP_CLASS[gapTone(gap)])}>
        {gap === null ? '-' : `${gap > 0 ? '+' : ''}${Math.round(gap)} %`}
      </td>
      <td className="r num">{rate === null ? '-' : `${formatEuroRounded(rate)}/h`}</td>
      <td className={cn('r num', unpaid ? 'down' : 'muted')}>
        {unpaid === undefined ? '' : unpaid > 0 ? formatEuroRounded(unpaid) : '-'}
      </td>
    </>
  );
}

/** Rentabilité par client, puis par véhicule : CA, marge, temps facturé face au temps passé. */
export function ProfitabilityPage() {
  const [period, setPeriod] = usePeriod(PERIODS, 'annee');
  const range = periodRange(period, todayIso());
  const report = useQuery({
    queryKey: ['reporting', 'profitability', range],
    queryFn: () => fetchProfitability(range),
  });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const { clients, total } = groupByClient(report.data ?? []);

  return (
    <>
      <ReportingHeader />
      <div className="toolbar flex-wrap">
        <PeriodFilter periods={PERIODS} value={period} onChange={setPeriod} />
      </div>

      {report.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {report.isError && <p className="text-destructive">Impossible de charger la rentabilité.</p>}
      {report.isSuccess && clients.length === 0 && <p className="empty">Aucune facture sur la période.</p>}

      {clients.length > 0 && (
        <section data-slot="card" className="card tbl-wrap overflow-x-auto!" aria-label="Rentabilité">
          <table className="tbl dense">
            <thead>
              <tr>
                <th>Client / véhicule</th>
                <th className="r">OR</th>
                <th className="r">CA HT</th>
                <th className="r">MO</th>
                <th className="r">Pièces</th>
                <th className="r">Marge pièces</th>
                <th className="r">H. facturées</th>
                <th className="r">H. réelles</th>
                <th className="r">Écart</th>
                <th className="r">Taux réel</th>
                <th className="r">Impayés</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => {
                const key = client.client_id ?? '-';
                const expanded = open.has(key);
                return [
                  <tr key={key}>
                    <td>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        className="inline-flex cursor-pointer items-center gap-1 text-left font-semibold hover:underline"
                        onClick={() => toggle(key)}
                      >
                        {expanded ? <ChevronDown className="i xs" /> : <ChevronRight className="i xs" />}
                        {client.client_name}
                      </button>
                    </td>
                    <FigureCells figures={client} unpaid={client.unpaid_ttc} />
                  </tr>,
                  ...(expanded
                    ? client.vehicles.map((vehicle) => (
                        <tr key={`${key}-${vehicle.vehicle_id}`} className="bg-head">
                          <td className="pl-10!">
                            <Link to={`/vehicules/${vehicle.vehicle_id}`} className="plate hover:underline">
                              {vehicle.plate}
                            </Link>
                          </td>
                          <FigureCells figures={vehicle} />
                        </tr>
                      ))
                    : []),
                ];
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <FigureCells figures={total} unpaid={total.unpaid_ttc} />
              </tr>
            </tfoot>
          </table>
        </section>
      )}
      <p className="hint">
        Écart = heures réellement badgées comparées aux heures facturées (en rouge : plus de 20 % de temps
        passé en plus). Taux réel = main d’œuvre facturée ÷ heures réelles. Clique sur un client pour voir ses
        véhicules.
      </p>
    </>
  );
}
