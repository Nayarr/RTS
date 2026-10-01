import { useQuery } from '@tanstack/react-query';
import { fetchMonthlyStatistics } from './api';
import { BarChart } from './BarChart';
import { compactAmount, formatEuroRounded, monthLabel } from './domain';
import { ReportingHeader } from './ReportingTabs';

const LABOR_FILL = 'var(--primary)';
const PARTS_FILL = 'color-mix(in srgb, var(--primary) 40%, var(--card))';

/** Statistiques mensuelles : chiffre d'affaires des 12 derniers mois. */
export function StatisticsPage() {
  const stats = useQuery({ queryKey: ['reporting', 'monthly-statistics'], queryFn: fetchMonthlyStatistics });
  const months = stats.data ?? [];
  const sum = (pick: (m: (typeof months)[number]) => number) =>
    months.reduce((total, m) => total + pick(m), 0);
  const total = sum((m) => m.total_ht);
  const parts = sum((m) => m.parts_ht);
  const margin = sum((m) => m.parts_margin_ht);

  return (
    <>
      <ReportingHeader />

      {stats.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {stats.isError && <p className="text-destructive">Impossible de charger les statistiques.</p>}

      {stats.isSuccess && (
        <>
          <ul className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
            <li className="card kpi">
              <span className="kpi-l">CA HT — 12 derniers mois</span>
              <span className="kpi-v">{formatEuroRounded(total)}</span>
            </li>
            <li className="card kpi">
              <span className="kpi-l">Main d’œuvre HT</span>
              <span className="kpi-v">{formatEuroRounded(sum((m) => m.labor_ht))}</span>
            </li>
            <li className="card kpi">
              <span className="kpi-l">Marge pièces</span>
              <span className="kpi-v">
                {formatEuroRounded(margin)}
                {parts > 0 && <span className="delta muted">{Math.round((margin / parts) * 100)} %</span>}
              </span>
            </li>
            <li className="card kpi">
              <span className="kpi-l">Factures émises</span>
              <span className="kpi-v">{sum((m) => m.invoice_count)}</span>
            </li>
          </ul>

          <section data-slot="card" className="card" aria-labelledby="stats-chart">
            <div className="card-h flex-wrap">
              <h2 className="h2" id="stats-chart">
                Chiffre d’affaires HT — 12 derniers mois
              </h2>
              <span className="row gap-3.5 text-[12.5px] text-muted-foreground">
                <span className="row gap-1.5">
                  <i className="inline-block size-2.5 rounded-[3px]" style={{ background: LABOR_FILL }} />
                  Main d’œuvre / forfaits
                </span>
                <span className="row gap-1.5">
                  <i className="inline-block size-2.5 rounded-[3px]" style={{ background: PARTS_FILL }} />
                  Pièces
                </span>
              </span>
            </div>
            <div className="card-b overflow-x-auto">
              <div className="min-w-[640px]">
                <BarChart
                  label="Chiffre d’affaires HT par mois"
                  bars={months.map((m) => ({
                    key: m.month,
                    label: monthLabel(m.month),
                    valueLabel: compactAmount(m.labor_ht + m.parts_ht),
                    title: `${monthLabel(m.month)} — main d’œuvre ${formatEuroRounded(m.labor_ht)}, pièces ${formatEuroRounded(m.parts_ht)}`,
                    segments: [
                      { value: m.labor_ht, fill: LABOR_FILL },
                      { value: m.parts_ht, fill: PARTS_FILL },
                    ],
                  }))}
                />
              </div>
            </div>
          </section>

          <section data-slot="card" className="card tbl-wrap overflow-x-auto!" aria-label="Détail par mois">
            <table className="tbl dense">
              <thead>
                <tr>
                  <th>Mois</th>
                  <th className="r">Factures</th>
                  <th className="r">MO HT</th>
                  <th className="r">Pièces HT</th>
                  <th className="r">Marge pièces</th>
                  <th className="r">Avoirs HT</th>
                  <th className="r">Total HT</th>
                </tr>
              </thead>
              <tbody>
                {[...months].reverse().map((m) => (
                  <tr key={m.month}>
                    <td className="b">{monthLabel(m.month)}</td>
                    <td className="r num">{m.invoice_count}</td>
                    <td className="r num">{formatEuroRounded(m.labor_ht)}</td>
                    <td className="r num">{formatEuroRounded(m.parts_ht)}</td>
                    <td className="r num">{formatEuroRounded(m.parts_margin_ht)}</td>
                    <td className={`r num ${m.credit_notes_ht > 0 ? 'down' : ''}`}>
                      {m.credit_notes_ht > 0 ? `−${formatEuroRounded(m.credit_notes_ht)}` : '—'}
                    </td>
                    <td className="r num b">{formatEuroRounded(m.total_ht)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <p className="hint">
            Pièces : pièces, consommables et sous-traitance refacturés. Les avoirs sont déduits le mois de
            leur émission. Les factures reprises de l’ancienne appli sans détail sont comptées en main
            d’œuvre.
          </p>
        </>
      )}
    </>
  );
}
