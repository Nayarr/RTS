import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CalendarClock, ChevronLeft, ChevronRight, List, Plus } from 'lucide-react';
import { initials } from '@/app/nav';
import { PageHeader } from '@/app/PageHeader';
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

const HOUR_HEIGHT = 44;
const APPOINTMENT_STYLE = {
  backgroundImage: 'repeating-linear-gradient(135deg, #7B4FB5 0 8px, #8d63c4 8px 16px)',
};

type Block = TimedEvent & ({ order: RepairOrderOverview } | { appointment: Appointment });

interface Column {
  key: string;
  header: ReactNode;
  /** Colonne d'aujourd'hui (vue semaine), mise en avant. */
  today?: boolean;
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
        today: day === todayIso(),
        header: (
          <>
            <span className="truncate">
              {dayLabel(day).replace(/^(\p{L}{3})\p{L}*/u, '$1')}
              {day === todayIso() && ' · aujourd’hui'}
              {closed && ' · fermé'}
            </span>
            {!closed && (
              <button
                type="button"
                className="ibtn sm ghost"
                aria-label={`Assigner un OR le ${dayLabel(day)}`}
                onClick={() => onAssign(day)}
              >
                <Plus className="i s" />
              </button>
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
          <span className="who truncate">
            <span className="av sm" style={{ '--c': technicianColor(technician) } as CSSProperties}>
              {initials(technician.display_name)}
            </span>
            {technician.display_name}
          </span>
          {!closed && (
            <button
              type="button"
              className="ibtn sm ghost"
              aria-label={`Assigner un OR à ${technician.display_name}`}
              onClick={() => onAssign(day, technician.id)}
            >
              <Plus className="i s" />
            </button>
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

  const toAssign = (planning.data?.appointments ?? []).filter((item) => !item.technician_id);
  const newAppointment = () =>
    setDialog({
      kind: 'appointment',
      appointment: null,
      preset: { date: isSunday(date) ? addDays(date, 1) : date },
    });

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Atelier' }, { label: 'Planning' }]}
        title="Planning"
        actions={
          <>
            <span className="sub hidden xl:inline">OR planifiés et rendez-vous de l’atelier</span>
            <Button variant="outline" asChild>
              <Link to="/rendez-vous">
                <List /> Liste des rendez-vous
              </Link>
            </Button>
            <Button onClick={newAppointment}>
              <CalendarClock /> Nouveau rendez-vous
            </Button>
          </>
        }
      />

      <div className="col gap-4">
        <div className="toolbar flex-wrap">
          <div className="row flex-wrap gap-2">
            <button
              type="button"
              className="ibtn"
              aria-label={view === 'jour' ? 'Jour précédent' : 'Semaine précédente'}
              onClick={() => go({ date: addDays(date, -step) })}
            >
              <ChevronLeft className="i" />
            </button>
            <h2 className="h2 justify-center sm:min-w-[230px]" aria-live="polite">
              {periodLabel(view, days)}
            </h2>
            <button
              type="button"
              className="ibtn"
              aria-label={view === 'jour' ? 'Jour suivant' : 'Semaine suivante'}
              onClick={() => go({ date: addDays(date, step) })}
            >
              <ChevronRight className="i" />
            </button>
            <Button variant="ghost" onClick={() => go({ date: todayIso() })}>
              Aujourd’hui
            </Button>
          </div>
          <div className="seg" role="group" aria-label="Affichage">
            {(['semaine', 'jour'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                className={cn(view === value && 'on')}
                onClick={() => go({ vue: value })}
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
            <div className="flex flex-wrap items-stretch gap-3">
              <section
                aria-label="Charge de travail"
                className="card row grow flex-wrap gap-[18px] px-3.5 py-2.5"
              >
                <span className="w-[120px] leading-[1.3] overline">
                  Charge {view === 'jour' ? 'du jour' : 'de la semaine'}
                </span>
                <ul className="row wrap gap-[18px]">
                  {workload.map(({ technician, hours }) => (
                    <li key={technician.id} className="who">
                      <span className="av sm" style={{ '--c': technicianColor(technician) } as CSSProperties}>
                        {initials(technician.display_name)}
                      </span>
                      <span className="col gap-0">
                        <b className="num">{formatHours(hours)}</b>
                        <span className="hint">{technician.display_name}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              {toAssign.length > 0 && (
                <section
                  aria-label="RDV à assigner"
                  className="card row w-full gap-3 px-3.5 py-2.5 lg:w-[420px]"
                >
                  <span className="kpi-ico border-0 text-white" style={APPOINTMENT_STYLE}>
                    <CalendarClock className="i s" />
                  </span>
                  <div className="col grow gap-0">
                    <b>{toAssign.length > 1 ? `${toAssign.length} RDV à assigner` : 'RDV à assigner'}</b>
                    <span className="hint truncate">
                      {[
                        `${dayLabel(toAssign[0]!.scheduled_date)} ${shortTime(toAssign[0]!.start_time)}`,
                        toAssign[0]!.client_name,
                        toAssign[0]!.reason,
                      ]
                        .filter(Boolean)
                        .join(' — ')}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDialog({ kind: 'appointment', appointment: toAssign[0]! })}
                  >
                    Assigner
                  </Button>
                </section>
              )}
            </div>

            {columns.length === 0 ? (
              <p className="empty">Aucun technicien à afficher.</p>
            ) : (
              <PlanningGrid
                columns={columns}
                dayStart={timeToMinutes(planning.data.hours.workday_start) ?? 9 * 60}
                dayEnd={timeToMinutes(planning.data.hours.workday_end) ?? 18 * 60}
                detailed={view === 'jour'}
                onOpenAppointment={(appointment) => setDialog({ kind: 'appointment', appointment })}
              />
            )}
            <p className="hint row wrap gap-4">
              <span className="row gap-1.5">
                <span
                  className="size-3.5 rounded"
                  style={{
                    backgroundImage: 'repeating-linear-gradient(135deg, #7B4FB5 0 4px, #8d63c4 4px 8px)',
                  }}
                />
                Rendez-vous
              </span>
              <span className="row gap-1.5">
                <span className="size-3.5 rounded border bg-muted" />
                Pause déjeuner
              </span>
              <span>Couleur du bloc = technicien. Clique sur « + » pour assigner un OR.</span>
            </p>
          </>
        )}
      </div>

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
    </>
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
    <section data-slot="card" className="card overflow-x-auto">
      <div style={{ minWidth: `${3.5 + columns.length * 8.5}rem` }}>
        <div className="flex border-b bg-card">
          <div className="w-14 shrink-0" />
          {columns.map((column) => (
            <div
              key={column.key}
              role="columnheader"
              className={cn(
                'flex h-12 min-w-0 flex-1 items-center justify-between gap-1 border-l pr-1.5 pl-3 text-[13px] font-semibold',
                column.today && 'bg-accent text-accent-foreground',
                column.closed && 'bg-muted text-muted-foreground',
              )}
            >
              {column.header}
            </div>
          ))}
        </div>
        <div className="flex pt-2 pb-2.5">
          <div className="relative w-14 shrink-0" style={{ height: totalHeight }}>
            {hours.map((hour, index) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-[11.5px] text-muted-foreground tabular-nums"
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
                <div className="absolute inset-x-[3px] top-[3px] z-20 truncate rounded-md bg-[#fdf1d3] px-2 py-[3px] text-[11.5px] font-semibold text-[#7a5200] dark:bg-[#3b3011] dark:text-[#f2d68a]">
                  {column.offLabel}
                </div>
              )}
              {column.lunch && (
                <div
                  aria-hidden
                  className="absolute inset-x-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--muted)_75%,transparent)] text-[11px] text-muted-foreground"
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
                  left: `calc(${block.column * width}% + 3px)`,
                  width: `calc(${width}% - 5px)`,
                };
                const className =
                  'absolute z-10 overflow-hidden rounded-[7px] px-[7px] py-1 text-left text-[11.5px] leading-[1.3] text-white shadow-[0_1px_2px_rgba(0,0,0,.15)] hover:brightness-110 [&_strong]:font-bold';
                if ('appointment' in block) {
                  const item = block.appointment;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={`Rendez-vous ${shortTime(item.start_time)} ${item.plate ?? item.client_name ?? ''}`}
                      className={cn(className, 'border-2 border-dashed border-white/90')}
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
    </section>
  );
}
