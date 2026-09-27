import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CalendarClock, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RepairOrderOverview } from '@/features/repair-orders/api';
import { formatHours } from '@/features/repair-orders/constants';
import { todayIso } from '@/features/repair-orders/schemas';
import { cn } from '@/lib/utils';
import type { Appointment, PlanningData, PlanningTechnician } from './api';
import { AppointmentDialog } from './AppointmentDialog';
import { AssignOrderDialog } from './AssignOrderDialog';
import {
  addDays,
  dayLabel,
  eventSpan,
  isSunday,
  layoutDayEvents,
  lunchBreak,
  periodDays,
  periodLabel,
  shortTime,
  technicianColor,
  technicianOffLabel,
  timeToMinutes,
  type PlanningView,
  type TimedEvent,
} from './domain';
import { usePlanning } from './hooks';

const HOUR_HEIGHT = 56;
const APPOINTMENT_STYLE = {
  backgroundImage: 'repeating-linear-gradient(135deg, #7B4FB5 0 8px, #8d63c4 8px 16px)',
};

type Block = TimedEvent & ({ order: RepairOrderOverview } | { appointment: Appointment });

interface Column {
  key: string;
  header: ReactNode;
  /** Dimanche, ou technicien absent toute la journée (vue jour). */
  closed: boolean;
  offLabel: string | null;
  lunch: [number, number] | null;
  blocks: Block[];
}

type OpenDialog =
  | {
      kind: 'appointment';
      appointment: Appointment | null;
      preset?: { date?: string; technician_id?: string };
    }
  | { kind: 'assign'; date: string; technicianId?: string | undefined };

function orderBlocks(
  orders: RepairOrderOverview[],
  day: string,
  keep: (order: RepairOrderOverview) => boolean,
) {
  return orders.flatMap((order) => {
    const span =
      order.planned_date === day && keep(order) ? eventSpan(order.planned_start, order.planned_end) : null;
    return span ? [{ ...span, order }] : [];
  });
}

function appointmentBlocks(appointments: Appointment[], day: string, keep: (item: Appointment) => boolean) {
  return appointments.flatMap((appointment) => {
    const span =
      appointment.scheduled_date === day && keep(appointment)
        ? eventSpan(appointment.start_time, appointment.end_time)
        : null;
    return span ? [{ ...span, appointment }] : [];
  });
}

/** Colonnes de la grille : un jour par colonne (semaine), ou un technicien par colonne (jour). */
function buildColumns(
  view: PlanningView,
  days: string[],
  data: PlanningData,
  onAssign: (date: string, technicianId?: string) => void,
): Column[] {
  const { technicians, orders, appointments, leaves, hours, restReferenceMonday } = data;
  const offLabel = (technician: PlanningTechnician, day: string) =>
    technicianOffLabel(technician, day, leaves, restReferenceMonday);

  if (view === 'semaine') {
    return days.map((day) => {
      const closed = isSunday(day);
      const off = technicians.flatMap((technician) => {
        const label = offLabel(technician, day);
        return label ? [`${technician.display_name} (${label})`] : [];
      });
      return {
        key: day,
        header: (
          <>
            <span>{dayLabel(day)}</span>
            {!closed && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`Assigner un OR le ${dayLabel(day)}`}
                onClick={() => onAssign(day)}
              >
                <Plus />
              </Button>
            )}
          </>
        ),
        closed,
        offLabel: closed || off.length === 0 ? null : off.join(', '),
        lunch: closed ? null : lunchBreak(day, hours),
        blocks: closed
          ? []
          : [...orderBlocks(orders, day, () => true), ...appointmentBlocks(appointments, day, () => true)],
      };
    });
  }

  const day = days[0] ?? todayIso();
  const known = new Set(technicians.map((technician) => technician.id));
  const unassigned = appointmentBlocks(
    appointments,
    day,
    (item) => !item.technician_id || !known.has(item.technician_id),
  );
  const columns: Column[] = technicians.map((technician) => {
    const off = offLabel(technician, day);
    const closed = isSunday(day) || off !== null;
    return {
      key: technician.id,
      header: (
        <>
          <span style={{ color: technicianColor(technician) }}>{technician.display_name}</span>
          {!closed && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`Assigner un OR à ${technician.display_name}`}
              onClick={() => onAssign(day, technician.id)}
            >
              <Plus />
            </Button>
          )}
        </>
      ),
      closed,
      offLabel: off,
      lunch: closed ? null : lunchBreak(day, hours),
      blocks: closed
        ? []
        : [
            ...orderBlocks(orders, day, (order) => order.technician_id === technician.id),
            ...appointmentBlocks(appointments, day, (item) => item.technician_id === technician.id),
          ],
    };
  });
  if (unassigned.length) {
    columns.unshift({
      key: 'unassigned',
      header: <span className="text-[#7B4FB5]">RDV à assigner</span>,
      closed: false,
      offLabel: null,
      lunch: null,
      blocks: unassigned,
    });
  }
  return columns;
}

/** Planning de l'atelier : OR planifiés et rendez-vous, par semaine ou par jour. */
export function PlanningPage() {
  const [params, setParams] = useSearchParams();
  const view: PlanningView = params.get('vue') === 'jour' ? 'jour' : 'semaine';
  const requested = params.get('date') ?? '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : todayIso();
  const days = periodDays(view, date);
  const from = days[0] ?? date;
  const to = days[days.length - 1] ?? date;
  const planning = usePlanning(from, to);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);

  const go = (next: { vue?: PlanningView; date?: string }) =>
    setParams({ vue: next.vue ?? view, date: next.date ?? date }, { replace: true });
  const step = view === 'jour' ? 1 : 7;

  const columns = planning.data
    ? buildColumns(view, days, planning.data, (day, technicianId) =>
        setDialog({ kind: 'assign', date: day, technicianId }),
      )
    : [];

  const workload = useMemo(
    () =>
      (planning.data?.technicians ?? []).map((technician) => ({
        technician,
        hours: (planning.data?.orders ?? [])
          .filter((order) => order.technician_id === technician.id)
          .reduce((sum, order) => sum + Number(order.declared_hours), 0),
      })),
    [planning.data],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Planning</h1>
          <p className="text-muted-foreground">OR planifiés et rendez-vous de l’atelier.</p>
        </div>
        <Button
          size="lg"
          onClick={() =>
            setDialog({
              kind: 'appointment',
              appointment: null,
              preset: { date: isSunday(date) ? addDays(date, 1) : date },
            })
          }
        >
          <CalendarClock /> Nouveau rendez-vous
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label={view === 'jour' ? 'Jour précédent' : 'Semaine précédente'}
            onClick={() => go({ date: addDays(date, -step) })}
          >
            <ChevronLeft />
          </Button>
          <h2 className="min-w-48 text-center font-bold" aria-live="polite">
            {periodLabel(view, days)}
          </h2>
          <Button
            variant="outline"
            size="icon"
            aria-label={view === 'jour' ? 'Jour suivant' : 'Semaine suivante'}
            onClick={() => go({ date: addDays(date, step) })}
          >
            <ChevronRight />
          </Button>
          <Button variant="ghost" onClick={() => go({ date: todayIso() })}>
            Aujourd’hui
          </Button>
        </div>
        <div role="group" aria-label="Affichage" className="flex gap-2">
          {(['semaine', 'jour'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => go({ vue: value })}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition',
                view === value ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              {value === 'semaine' ? 'Semaine' : 'Jour'}
            </button>
          ))}
        </div>
      </div>

      {planning.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {planning.isError && <p className="text-destructive">Impossible de charger le planning.</p>}

      {planning.data && (
        <>
          <section aria-label="Charge de travail" className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase">
              Charge de travail ({view === 'jour' ? 'jour' : 'semaine'}, en heures déclarées)
            </h3>
            <ul className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2">
              {workload.map(({ technician, hours }) => (
                <li key={technician.id} className="rounded-lg border bg-card p-3 text-center">
                  <div className="text-xl font-bold tabular-nums">{formatHours(hours)}</div>
                  <div className="truncate text-sm text-muted-foreground">{technician.display_name}</div>
                </li>
              ))}
            </ul>
          </section>

          {columns.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              Aucun technicien à afficher.
            </p>
          ) : (
            <PlanningGrid
              columns={columns}
              dayStart={timeToMinutes(planning.data.hours.workday_start) ?? 9 * 60}
              dayEnd={timeToMinutes(planning.data.hours.workday_end) ?? 18 * 60}
              detailed={view === 'jour'}
              onOpenAppointment={(appointment) => setDialog({ kind: 'appointment', appointment })}
            />
          )}
          <p className="text-sm text-muted-foreground">
            Blocs hachurés violets : rendez-vous. Zone grisée : pause déjeuner.
          </p>
        </>
      )}

      {dialog?.kind === 'appointment' && (
        <AppointmentDialog
          appointment={dialog.appointment}
          preset={dialog.preset}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'assign' && planning.data && (
        <AssignOrderDialog
          date={dialog.date}
          technicianId={dialog.technicianId}
          technicians={planning.data.technicians}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

interface PlanningGridProps {
  columns: Column[];
  dayStart: number;
  dayEnd: number;
  /** Vue jour : heures de fin et client affichés dans les blocs. */
  detailed: boolean;
  onOpenAppointment: (appointment: Appointment) => void;
}

function PlanningGrid({ columns, dayStart, dayEnd, detailed, onOpenAppointment }: PlanningGridProps) {
  const totalHeight = ((dayEnd - dayStart) / 60) * HOUR_HEIGHT;
  const hours = Array.from({ length: Math.floor((dayEnd - dayStart) / 60) + 1 }, (_, i) => dayStart / 60 + i);
  const toPx = (minutes: number) => ((minutes - dayStart) / 60) * HOUR_HEIGHT;

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <div style={{ minWidth: `${3.5 + columns.length * 8.5}rem` }}>
        <div className="sticky top-0 z-10 flex border-b bg-card">
          <div className="w-14 shrink-0" />
          {columns.map((column) => (
            <div
              key={column.key}
              role="columnheader"
              className={cn(
                'flex min-w-0 flex-1 items-center justify-center gap-1 border-l px-1 py-2 text-center text-sm font-bold',
                column.closed && 'bg-muted text-muted-foreground',
              )}
            >
              {column.header}
            </div>
          ))}
        </div>
        <div className="flex py-2">
          <div className="relative w-14 shrink-0" style={{ height: totalHeight }}>
            {hours.map((hour, index) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums"
                style={{ top: index * HOUR_HEIGHT }}
              >
                {String(hour).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          {columns.map((column) => (
            <div
              key={column.key}
              data-testid={`planning-column-${column.key}`}
              className={cn('relative min-w-0 flex-1 border-l', column.closed && 'bg-muted')}
              style={{
                height: totalHeight,
                backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${HOUR_HEIGHT}px)`,
              }}
            >
              {column.offLabel && (
                <div className="absolute inset-x-0.5 top-0.5 z-20 truncate rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900">
                  {column.offLabel}
                </div>
              )}
              {column.lunch && (
                <div
                  aria-hidden
                  className="absolute inset-x-0 flex items-center justify-center bg-muted/70 text-xs text-muted-foreground"
                  style={{
                    top: toPx(column.lunch[0]),
                    height: toPx(column.lunch[1]) - toPx(column.lunch[0]),
                  }}
                >
                  Pause
                </div>
              )}
              {layoutDayEvents(column.blocks).map((block) => {
                const width = 100 / block.columns;
                const style = {
                  top: Math.min(Math.max(0, toPx(block.start)), Math.max(0, totalHeight - 18)),
                  height: Math.max(18, toPx(block.end) - toPx(block.start) - 2),
                  left: `${block.column * width}%`,
                  width: `calc(${width}% - 3px)`,
                };
                const className =
                  'absolute z-10 overflow-hidden rounded px-1.5 py-0.5 text-left text-xs leading-tight text-white shadow-sm hover:brightness-110';
                if ('appointment' in block) {
                  const item = block.appointment;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={`Rendez-vous ${shortTime(item.start_time)} ${item.plate ?? item.client_name ?? ''}`}
                      className={cn(className, 'border-2 border-dashed border-white')}
                      style={{ ...style, ...APPOINTMENT_STYLE }}
                      onClick={() => onOpenAppointment(item)}
                    >
                      <strong>
                        <CalendarClock className="inline size-3" /> {shortTime(item.start_time)}
                      </strong>{' '}
                      {item.plate}
                      <br />
                      <span className="opacity-90">
                        RDV {item.client_name ?? ''}
                        {item.technician_name ? ` — ${item.technician_name}` : ''}
                      </span>
                    </button>
                  );
                }
                const order = block.order;
                return (
                  <Link
                    key={order.id}
                    to={`/or/${order.id}`}
                    className={className}
                    style={{
                      ...style,
                      background: technicianColor(
                        order.technician_name
                          ? { display_name: order.technician_name, color: order.technician_color }
                          : null,
                      ),
                    }}
                    title={`${order.plate} — ${order.technician_name ?? 'non assigné'} — ${shortTime(order.planned_start)}${order.planned_end ? ` → ${shortTime(order.planned_end)}` : ''}`}
                  >
                    <strong>
                      {shortTime(order.planned_start)}
                      {detailed && order.planned_end ? ` - ${shortTime(order.planned_end)}` : ''}
                    </strong>{' '}
                    {order.plate}
                    <br />
                    <span className="opacity-85">
                      {detailed
                        ? (order.client_name ?? order.number)
                        : (order.technician_name ?? 'Non assigné')}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
