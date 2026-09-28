import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchMonthlyStatistics, type MonthlyStatistics } from './api';
import { barPercent, compactAmount, formatEuroRounded, monthLabel } from './domain';
import { ReportingHeader } from './ReportingTabs';

/** Barres empilées : main d'œuvre / forfaits en bas, pièces au-dessus. */
function RevenueChart({ months }: { months: MonthlyStatistics[] }) {
  const max = Math.max(1, ...months.map((m) => m.labor_ht + m.parts_ht));
  return (
    <figure aria-label="Chiffre d’affaires HT par mois" className="space-y-2">
      <figcaption className="flex flex-wrap gap-4 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-primary" /> Main d’œuvre / forfaits
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-warning" /> Pièces
        </span>
      </figcaption>
      <div className="flex items-end gap-1 overflow-x-auto pb-1">
        {months.map((m) => (
          <div
            key={m.month}
            className="flex min-w-9 flex-1 flex-col items-center gap-1"
            title={`${monthLabel(m.month)} — main d’œuvre ${formatEuroRounded(m.labor_ht)}, pièces ${formatEuroRounded(m.parts_ht)}`}
          >
            <span className="text-xs text-muted-foreground tabular-nums">
              {compactAmount(m.labor_ht + m.parts_ht)}
            </span>
            <div className="flex h-44 w-3/4 flex-col justify-end">
              <div
                className="rounded-t-sm bg-warning"
                style={{ height: `${barPercent(m.parts_ht, max)}%` }}
              />
              <div className="bg-primary" style={{ height: `${barPercent(m.labor_ht, max)}%` }} />
            </div>
            <span className="text-xs font-bold whitespace-nowrap">{monthLabel(m.month)}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

/** Statistiques mensuelles : chiffre d'affaires des 12 derniers mois. */
export function StatisticsPage() {
  const stats = useQuery({ queryKey: ['reporting', 'monthly-statistics'], queryFn: fetchMonthlyStatistics });
  const months = stats.data ?? [];

  return (
    <div className="space-y-5">
      <ReportingHeader />

      {stats.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {stats.isError && <p className="text-destructive">Impossible de charger les statistiques.</p>}

      {stats.isSuccess && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2 className="text-xl font-bold">Chiffre d’affaires HT — 12 derniers mois</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RevenueChart months={months} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mois</TableHead>
                    <TableHead className="text-right">Factures</TableHead>
                    <TableHead className="text-right">MO HT</TableHead>
                    <TableHead className="text-right">Pièces HT</TableHead>
                    <TableHead className="text-right">Marge pièces</TableHead>
                    <TableHead className="text-right">Avoirs HT</TableHead>
                    <TableHead className="text-right">Total HT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...months].reverse().map((m) => (
                    <TableRow key={m.month}>
                      <TableCell className="font-medium">{monthLabel(m.month)}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.invoice_count}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatEuroRounded(m.labor_ht)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatEuroRounded(m.parts_ht)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatEuroRounded(m.parts_margin_ht)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.credit_notes_ht > 0 ? `−${formatEuroRounded(m.credit_notes_ht)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        {formatEuroRounded(m.total_ht)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-sm text-muted-foreground">
                Pièces : pièces, consommables et sous-traitance refacturés. Les avoirs sont déduits le mois de
                leur émission. Les factures reprises de l’ancienne appli sans détail sont comptées en main
                d’œuvre.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
