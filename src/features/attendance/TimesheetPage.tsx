import { useSearchParams } from 'react-router';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { todayIso } from '@/features/repair-orders/schemas';
import { downloadFile, toCsv } from '@/lib/csv';
import { AttendanceTabs } from './AttendanceTabs';
import { formatHoursMinutes } from './domain';
import { useTimesheet } from './hooks';
import { computeTimesheet, TIMESHEET_CSV_HEADERS, timesheetCsvRows } from './timesheet';

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

/** Relevé d'heures mensuel pour la paie (direction), avec export CSV. */
export function TimesheetPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('mois') ?? '';
  const month = /^\d{4}-\d{2}$/.test(requested) ? requested : todayIso().slice(0, 7);
  const data = useTimesheet(month);

  const sheets = (data.data?.technicians ?? []).map((technician) => ({
    id: technician.id,
    name: technician.display_name,
    timesheet: computeTimesheet(technician.id, month, data.data?.days ?? [], data.data?.leaves ?? []),
  }));

  const exportCsv = () =>
    downloadFile(toCsv(TIMESHEET_CSV_HEADERS, timesheetCsvRows(month, sheets)), `releve_heures_${month}.csv`);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Relevé d’heures</h1>
          <p className="text-muted-foreground">
            Heures sup. : temps travaillé après 18h30, cumulé par semaine. Retard : première arrivée après
            9h05.
          </p>
        </div>
        <Button size="lg" variant="outline" disabled={!sheets.length} onClick={exportCsv}>
          <Download /> Export CSV (paie)
        </Button>
      </div>
      <AttendanceTabs />

      <div className="space-y-1">
        <Label htmlFor="timesheet-month">Mois</Label>
        <Input
          id="timesheet-month"
          type="month"
          className="h-9 w-48"
          value={month}
          onChange={(event) =>
            event.target.value && setParams({ mois: event.target.value }, { replace: true })
          }
        />
      </div>

      {data.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {data.isError && <p className="text-destructive">Impossible de charger le relevé.</p>}
      {data.isSuccess && sheets.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Aucun technicien.
        </p>
      )}

      <ul className="space-y-3">
        {sheets.map(({ id, name, timesheet: { weeks, total } }) => (
          <li key={id}>
            <article aria-label={name} className="space-y-3 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-lg">{name}</strong>
                <p className="text-sm text-muted-foreground">
                  {plural(total.daysWorked, 'jour')} travaillé{total.daysWorked > 1 ? 's' : ''} —{' '}
                  {formatHoursMinutes(total.seconds)} — HS :{' '}
                  <strong className="text-foreground">{formatHoursMinutes(total.overtimeSeconds)}</strong> —{' '}
                  {plural(total.lates, 'retard')}
                  {total.lates ? ` (${total.lateMinutes} min)` : ''}
                  {total.absenceDays ? ` — ${total.absenceDays} j d’absence` : ''}
                  {total.anomalies ? (
                    <span className="text-amber-700"> — {plural(total.anomalies, 'oubli')} de badge</span>
                  ) : null}
                </p>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Semaine</TableHead>
                      <TableHead className="text-right">Heures</TableHead>
                      <TableHead className="text-right">Heures sup. (après 18h30)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weeks.map((week) => (
                      <TableRow key={week.week}>
                        <TableCell>{week.week}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatHoursMinutes(week.seconds)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatHoursMinutes(week.overtimeSeconds)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
