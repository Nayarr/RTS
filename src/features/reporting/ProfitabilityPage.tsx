import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
const GAP_CLASS = { bad: 'text-destructive', good: 'text-success', neutral: '' } as const;

const hours = (value: number) => `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h`;

/** Colonnes chiffrées communes aux lignes client, véhicule et total. */
function FigureCells({ figures, unpaid }: { figures: ProfitabilityFigures; unpaid?: number }) {
  const gap = hoursGapPercent(figures);
  const rate = realHourlyRate(figures);
  return (
    <>
      <TableCell className="text-right tabular-nums">{figures.ro_count}</TableCell>
      <TableCell className="text-right font-bold tabular-nums">
        {formatEuroRounded(revenue(figures))}
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatEuroRounded(figures.labor_ht)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatEuroRounded(figures.parts_ht)}</TableCell>
      <TableCell
        className={cn(
          'text-right tabular-nums',
          figures.parts_margin_ht < 0 ? 'text-destructive' : 'text-success',
        )}
      >
        {formatEuroRounded(figures.parts_margin_ht)}
      </TableCell>
      <TableCell className="text-right tabular-nums">{hours(figures.billed_hours)}</TableCell>
      <TableCell className="text-right tabular-nums">{hours(figures.worked_hours)}</TableCell>
      <TableCell className={cn('text-right font-bold tabular-nums', GAP_CLASS[gapTone(gap)])}>
        {gap === null ? '—' : `${gap > 0 ? '+' : ''}${Math.round(gap)} %`}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {rate === null ? '—' : `${formatEuroRounded(rate)}/h`}
      </TableCell>
      <TableCell className={cn('text-right tabular-nums', unpaid ? 'text-destructive' : '')}>
        {unpaid === undefined ? '' : unpaid > 0 ? formatEuroRounded(unpaid) : '—'}
      </TableCell>
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
    <div className="space-y-5">
      <ReportingHeader />
      <PeriodFilter periods={PERIODS} value={period} onChange={setPeriod} />
      <p className="text-sm text-muted-foreground">
        Écart = heures réellement badgées comparées aux heures facturées (en rouge : plus de 20 % de temps
        passé en plus). Taux réel = main d’œuvre facturée ÷ heures réelles. Clique sur un client pour voir ses
        véhicules.
      </p>

      {report.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {report.isError && <p className="text-destructive">Impossible de charger la rentabilité.</p>}
      {report.isSuccess && clients.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Aucune facture sur la période.
        </p>
      )}

      {clients.length > 0 && (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client / véhicule</TableHead>
                  <TableHead className="text-right">OR</TableHead>
                  <TableHead className="text-right">CA HT</TableHead>
                  <TableHead className="text-right">MO</TableHead>
                  <TableHead className="text-right">Pièces</TableHead>
                  <TableHead className="text-right">Marge pièces</TableHead>
                  <TableHead className="text-right">H. facturées</TableHead>
                  <TableHead className="text-right">H. réelles</TableHead>
                  <TableHead className="text-right">Écart</TableHead>
                  <TableHead className="text-right">Taux réel</TableHead>
                  <TableHead className="text-right">Impayés</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => {
                  const key = client.client_id ?? '—';
                  const expanded = open.has(key);
                  return [
                    <TableRow key={key}>
                      <TableCell>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          className="inline-flex items-center gap-1 text-left font-bold hover:underline"
                          onClick={() => toggle(key)}
                        >
                          {expanded ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                          {client.client_name}
                        </button>
                      </TableCell>
                      <FigureCells figures={client} unpaid={client.unpaid_ttc} />
                    </TableRow>,
                    ...(expanded
                      ? client.vehicles.map((vehicle) => (
                          <TableRow key={`${key}-${vehicle.vehicle_id}`} className="bg-muted/50">
                            <TableCell className="pl-8">
                              <Link to={`/vehicules/${vehicle.vehicle_id}`} className="hover:underline">
                                {vehicle.plate}
                              </Link>
                            </TableCell>
                            <FigureCells figures={vehicle} />
                          </TableRow>
                        ))
                      : []),
                  ];
                })}
                <TableRow className="border-t-2 font-bold">
                  <TableCell>Total</TableCell>
                  <FigureCells figures={total} unpaid={total.unpaid_ttc} />
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
