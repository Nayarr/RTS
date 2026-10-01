import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, TrendingUp, TriangleAlert } from 'lucide-react';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import { fetchTreasury } from './api';
import { BarChart } from './BarChart';
import { delayTone, formatDelay, formatEuroRounded, shortDayLabel } from './domain';
import { ReportingHeader } from './ReportingTabs';

const TONE_CLASS = { good: 'text-success', warning: 'text-warning', bad: 'text-destructive' } as const;
const TONE_BADGE = { good: 's-ok', warning: 's-warn', bad: 's-bad' } as const;

/** Trésorerie : encaissements, retards de paiement et habitudes des clients (montants TTC). */
export function TreasuryPage() {
  const treasury = useQuery({ queryKey: ['reporting', 'treasury'], queryFn: fetchTreasury });
  const data = treasury.data;
  const overdueInvoices = (data?.overdue_by_client ?? []).reduce((sum, row) => sum + row.invoice_count, 0);

  return (
    <>
      <ReportingHeader />

      {treasury.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {treasury.isError && <p className="text-destructive">Impossible de charger la trésorerie.</p>}

      {data && (
        <>
          <ul className="grid gap-3.5 sm:grid-cols-3">
            <li className="card kpi">
              <span className="kpi-ico up">
                <TrendingUp className="i s" />
              </span>
              <div className="col gap-1">
                <span className="kpi-v">{formatEuroRounded(data.collected_this_month)}</span>
                <span className="kpi-l">Encaissé ce mois</span>
              </div>
            </li>
            <li className="card kpi">
              <span className="kpi-ico">
                <CalendarClock className="i s" />
              </span>
              <div className="col gap-1">
                <span className="kpi-v">{formatEuroRounded(data.due_within_30_days)}</span>
                <span className="kpi-l">À encaisser sous 30 j</span>
              </div>
            </li>
            <li
              className="card kpi"
              style={
                data.overdue > 0
                  ? { borderColor: 'color-mix(in srgb, var(--destructive) 40%, transparent)' }
                  : undefined
              }
            >
              <span className="kpi-ico down">
                <TriangleAlert className="i s" />
              </span>
              <div className="col gap-1">
                <span className={cn('kpi-v', data.overdue > 0 && 'down')}>
                  {formatEuroRounded(data.overdue)}
                </span>
                <span className="kpi-l">En retard</span>
                {overdueInvoices > 0 && (
                  <span className="hint">
                    {overdueInvoices} facture{overdueInvoices > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </li>
          </ul>

          <section data-slot="card" className="card" aria-labelledby="treasury-weeks">
            <div className="card-h">
              <h2 className="h2" id="treasury-weeks">
                Encaissements attendus (8 prochaines semaines, TTC)
              </h2>
            </div>
            <div className="card-b overflow-x-auto">
              <div className="min-w-[560px]">
                <BarChart
                  label="Encaissements attendus par semaine"
                  height={210}
                  barWidth={76}
                  bars={data.weeks.map((week) => ({
                    key: week.starts_on,
                    label: shortDayLabel(week.starts_on),
                    valueLabel: week.amount > 0 ? formatEuroRounded(week.amount) : '',
                    title: `Semaine du ${shortDayLabel(week.starts_on)} : ${formatEuro(week.amount)}`,
                    segments: [{ value: week.amount, fill: 'var(--primary)' }],
                  }))}
                />
              </div>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section data-slot="card" className="card tbl-wrap" aria-labelledby="treasury-late">
              <div className="card-h">
                <h2 className="h2" id="treasury-late">
                  Impayés en retard par client
                </h2>
              </div>
              {data.overdue_by_client.length === 0 ? (
                <p className="card-b hint">Aucun impayé en retard.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="tbl dense">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th className="r">Factures</th>
                        <th className="r">Montant TTC</th>
                        <th className="r">Plus ancien retard</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.overdue_by_client.map((row) => (
                        <tr key={row.client_id}>
                          <td>
                            <Link to={`/clients/${row.client_id}`} className="b ul">
                              {row.client_name}
                            </Link>
                          </td>
                          <td className="r num">{row.invoice_count}</td>
                          <td className="r num b">{formatEuro(row.amount)}</td>
                          <td className="r">
                            <span className={cn('badge', row.max_days_late > 30 ? 's-bad' : 's-warn')}>
                              {row.max_days_late} j
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section data-slot="card" className="card tbl-wrap" aria-labelledby="treasury-habits">
              <div className="card-h flex-col items-start gap-0.5">
                <h2 className="h2" id="treasury-habits">
                  Habitudes de paiement
                </h2>
                <span className="hint">
                  Délai moyen du dernier paiement par rapport à l’échéance, sur les factures soldées.
                </span>
              </div>
              {data.payment_habits.length === 0 ? (
                <p className="card-b hint">Pas encore assez de paiements enregistrés.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="tbl dense">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th className="r">Factures payées</th>
                        <th className="r">Délai moyen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payment_habits.map((row) => {
                        const tone = delayTone(row.average_delay_days);
                        return (
                          <tr key={row.client_id}>
                            <td>
                              <Link to={`/clients/${row.client_id}`} className="b ul">
                                {row.client_name}
                              </Link>
                            </td>
                            <td className="r num">{row.invoice_count}</td>
                            <td className={cn('r', TONE_CLASS[tone])}>
                              <span className={cn('badge', TONE_BADGE[tone])}>
                                {formatDelay(row.average_delay_days)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
