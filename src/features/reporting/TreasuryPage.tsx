import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import { fetchTreasury, type TreasuryOverview } from './api';
import { barPercent, delayTone, formatDelay, formatEuroRounded, shortDayLabel } from './domain';
import { ReportingHeader } from './ReportingTabs';

function StatBox({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="min-w-40 flex-1 rounded-lg border bg-card p-4 text-center">
      <p className={cn('text-2xl font-bold tabular-nums', className)}>{formatEuroRounded(value)}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function ExpectedPayments({ weeks }: { weeks: TreasuryOverview['weeks'] }) {
  const max = Math.max(1, ...weeks.map((week) => week.amount));
  return (
    <figure aria-label="Encaissements attendus par semaine" className="flex h-44 items-end gap-1.5">
      {weeks.map((week) => (
        <div
          key={week.starts_on}
          className="flex h-full flex-1 flex-col items-center justify-end gap-1"
          title={`Semaine du ${shortDayLabel(week.starts_on)} : ${formatEuro(week.amount)}`}
        >
          <span className="text-xs tabular-nums">
            {week.amount > 0 ? formatEuroRounded(week.amount) : ''}
          </span>
          <div
            className="w-full rounded-t-sm bg-primary"
            style={{ height: `${barPercent(week.amount, max) * 0.75}%` }}
          />
          <span className="text-xs font-bold">{shortDayLabel(week.starts_on)}</span>
        </div>
      ))}
    </figure>
  );
}

const TONE_CLASS = { good: 'text-success', warning: 'text-warning', bad: 'text-destructive' } as const;

/** Trésorerie : encaissements, retards de paiement et habitudes des clients (montants TTC). */
export function TreasuryPage() {
  const treasury = useQuery({ queryKey: ['reporting', 'treasury'], queryFn: fetchTreasury });
  const data = treasury.data;

  return (
    <div className="space-y-5">
      <ReportingHeader />

      {treasury.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {treasury.isError && <p className="text-destructive">Impossible de charger la trésorerie.</p>}

      {data && (
        <>
          <div className="flex flex-wrap gap-3">
            <StatBox label="Encaissé ce mois" value={data.collected_this_month} className="text-success" />
            <StatBox label="À encaisser sous 30 j" value={data.due_within_30_days} />
            <StatBox label="En retard" value={data.overdue} className="text-destructive" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2 className="text-xl font-bold">Encaissements attendus (8 prochaines semaines, TTC)</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ExpectedPayments weeks={data.weeks} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2 className="text-xl font-bold">Impayés en retard par client</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.overdue_by_client.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun impayé en retard.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-right">Factures</TableHead>
                      <TableHead className="text-right">Montant TTC</TableHead>
                      <TableHead className="text-right">Plus ancien retard</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.overdue_by_client.map((row) => (
                      <TableRow key={row.client_id}>
                        <TableCell>
                          <Link to={`/clients/${row.client_id}`} className="font-medium hover:underline">
                            {row.client_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.invoice_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatEuro(row.amount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.max_days_late} j</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2 className="text-xl font-bold">Habitudes de paiement</h2>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Délai moyen du dernier paiement par rapport à l’échéance, sur les factures soldées.
              </p>
            </CardHeader>
            <CardContent>
              {data.payment_habits.length === 0 ? (
                <p className="text-sm text-muted-foreground">Pas encore assez de paiements enregistrés.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-right">Factures payées</TableHead>
                      <TableHead className="text-right">Délai moyen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.payment_habits.map((row) => (
                      <TableRow key={row.client_id}>
                        <TableCell>
                          <Link to={`/clients/${row.client_id}`} className="font-medium hover:underline">
                            {row.client_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.invoice_count}</TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-bold tabular-nums',
                            TONE_CLASS[delayTone(row.average_delay_days)],
                          )}
                        >
                          {formatDelay(row.average_delay_days)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
