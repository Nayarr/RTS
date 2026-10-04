import { useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { initials } from '@/app/nav';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { todayIso } from '@/features/repair-orders/schemas';
import { downloadFile, toCsv } from '@/lib/csv';
import { AttendanceTabs } from './AttendanceTabs';
import { formatHoursMinutes } from './domain';
import { useTimesheet } from './hooks';
import { computeTimesheet, TIMESHEET_CSV_HEADERS, timesheetCsvRows } from './timesheet';

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

/** « 2026-10 » + n mois. */
function shiftMonth(month: string, delta: number) {
  const [year, value] = month.split('-').map(Number) as [number, number];
  const date = new Date(year, value - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month: string) {
  const label = new Date(`${month}-15T12:00:00`).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Relevé d'heures mensuel pour la paie (direction), avec export CSV. */
export function TimesheetPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('mois') ?? '';
  const month = /^\d{4}-\d{2}$/.test(requested) ? requested : todayIso().slice(0, 7);
  const data = useTimesheet(month);
  const go = (next: string) => setParams({ mois: next }, { replace: true });

  const sheets = (data.data?.technicians ?? []).map((technician) => ({
    id: technician.id,
    name: technician.display_name,
    timesheet: computeTimesheet(technician.id, month, data.data?.days ?? [], data.data?.leaves ?? []),
  }));
  const totals = sheets.reduce(
    (sum, { timesheet: { total } }) => ({
      days: sum.days + total.daysWorked,
      seconds: sum.seconds + total.seconds,
      overtime: sum.overtime + total.overtimeSeconds,
      late: sum.late + total.lateMinutes,
      absence: sum.absence + total.absenceDays,
    }),
    { days: 0, seconds: 0, overtime: 0, late: 0, absence: 0 },
  );
  const maxSeconds = Math.max(1, ...sheets.map(({ timesheet }) => timesheet.total.seconds));

  const exportCsv = () =>
    downloadFile(toCsv(TIMESHEET_CSV_HEADERS, timesheetCsvRows(month, sheets)), `releve_heures_${month}.csv`);

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Équipe' }, { label: 'Relevé d’heures' }]}
        title="Relevé d’heures"
        actions={
          <Button variant="outline" disabled={!sheets.length} onClick={exportCsv}>
            <Download /> Export CSV (paie)
          </Button>
        }
      />

      <div className="col gap-4">
        <div className="toolbar flex-wrap">
          <AttendanceTabs />
          <div className="row gap-2">
            <button
              type="button"
              className="ibtn"
              aria-label="Mois précédent"
              onClick={() => go(shiftMonth(month, -1))}
            >
              <ChevronLeft className="i" />
            </button>
            <h2 className="h2 min-w-[150px] justify-center">{monthLabel(month)}</h2>
            <button
              type="button"
              className="ibtn"
              aria-label="Mois suivant"
              onClick={() => go(shiftMonth(month, 1))}
            >
              <ChevronRight className="i" />
            </button>
          </div>
        </div>

        {data.isPending && <p className="text-muted-foreground">Chargement…</p>}
        {data.isError && <p className="text-destructive">Impossible de charger le relevé.</p>}
        {data.isSuccess && sheets.length === 0 && <p className="empty">Aucun technicien.</p>}

        {sheets.length > 0 && (
          <>
            <ul className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
              <li className="card kpi">
                <span className="kpi-l">Heures travaillées (équipe)</span>
                <span className="kpi-v">{formatHoursMinutes(totals.seconds)}</span>
              </li>
              <li className="card kpi">
                <span className="kpi-l">Heures sup. (après 18h30)</span>
                <span className="kpi-v warn-t">{formatHoursMinutes(totals.overtime)}</span>
              </li>
              <li className="card kpi">
                <span className="kpi-l">Retards cumulés</span>
                <span className="kpi-v">{totals.late} min</span>
              </li>
              <li className="card kpi">
                <span className="kpi-l">Jours d’absence</span>
                <span className="kpi-v">{totals.absence}</span>
              </li>
            </ul>

            <section
              data-slot="card"
              className="card tbl-wrap overflow-x-auto!"
              aria-label="Relevé par technicien"
            >
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Technicien</th>
                    <th className="r">Jours travaillés</th>
                    <th className="r">Heures</th>
                    <th className="r">Heures sup. (après 18h30)</th>
                    <th className="r">Retards</th>
                    <th className="r">Absences</th>
                    <th className="w-[220px]">Répartition</th>
                  </tr>
                </thead>
                <tbody>
                  {sheets.map(({ id, name, timesheet: { total } }) => (
                    <tr key={id} aria-label={name}>
                      <td>
                        <span className="who">
                          <span className="av sm">{initials(name)}</span>
                          <b>{name}</b>
                          {total.anomalies > 0 && (
                            <span className="badge s-warn h-[22px] text-[11.5px]">
                              {plural(total.anomalies, 'oubli')} de badge
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="r num">{total.daysWorked}</td>
                      <td className="r num b">{formatHoursMinutes(total.seconds)}</td>
                      <td className={`r num ${total.overtimeSeconds > 0 ? 'warn-t b' : ''}`}>
                        {formatHoursMinutes(total.overtimeSeconds)}
                      </td>
                      <td className="r num">
                        {total.lates ? `${plural(total.lates, 'retard')} (${total.lateMinutes} min)` : '-'}
                      </td>
                      <td className="r num">{total.absenceDays ? `${total.absenceDays} j` : '-'}</td>
                      <td>
                        <div className="bar" aria-hidden>
                          <i style={{ width: `${(total.seconds / maxSeconds) * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="r num">{totals.days}</td>
                    <td className="r num">{formatHoursMinutes(totals.seconds)}</td>
                    <td className="r num">{formatHoursMinutes(totals.overtime)}</td>
                    <td className="r num">{totals.late} min</td>
                    <td className="r num">{totals.absence} j</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </section>

            <details className="card">
              <summary className="card-h cursor-pointer border-b-0">
                <span className="h2">Détail par semaine</span>
              </summary>
              <div className="grid gap-3 border-t p-5 md:grid-cols-2">
                {sheets.map(({ id, name, timesheet: { weeks } }) => (
                  <article key={id} aria-label={`Semaines de ${name}`} className="col gap-2">
                    <b>{name}</b>
                    <table className="tbl dense rounded-[7px] border">
                      <thead>
                        <tr>
                          <th>Semaine</th>
                          <th className="r">Heures</th>
                          <th className="r">Heures sup.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weeks.map((week) => (
                          <tr key={week.week}>
                            <td>{week.week}</td>
                            <td className="r num">{formatHoursMinutes(week.seconds)}</td>
                            <td className="r num b">{formatHoursMinutes(week.overtimeSeconds)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </article>
                ))}
              </div>
            </details>
          </>
        )}
        <p className="hint">
          Heures calculées à partir des pointages de la borne et des corrections manuelles. Heures sup. :
          temps travaillé après 18h30, cumulé par semaine. Retard : première arrivée après l’heure prévue.
        </p>
      </div>
    </>
  );
}
