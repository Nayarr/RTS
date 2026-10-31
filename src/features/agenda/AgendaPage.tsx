import { useEffect, useState, type MouseEvent } from 'react';
import { useSearchParams } from 'react-router';
import { CalendarPlus, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { layoutDayEvents, weekdayIndex } from '@/features/planning/domain';
import { todayIso } from '@/features/repair-orders/schemas';
import { useIsDesktop } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import {
  addMonths,
  clock,
  daySpan,
  eventsOfDay,
  GRID_END,
  GRID_START,
  longDay,
  monthGrid,
  nextSlot,
  periodLabel,
  shiftDate,
  slotAt,
  timeLabel,
  viewDays,
  viewRange,
  WEEKDAYS_SHORT,
  type AgendaView,
  type PersonalEvent,
} from './domain';
import { EventDialog } from './EventDialog';
import { useAgenda } from './hooks';
import type { EventPreset } from './schemas';

const HOUR_HEIGHT = 48;
const VIEWS: { value: AgendaView; label: string }[] = [
  { value: 'jour', label: 'Jour' },
  { value: 'semaine', label: 'Semaine' },
  { value: 'mois', label: 'Mois' },
];

type OpenDialog = { event: PersonalEvent | null; preset: EventPreset };

const toPx = (minutes: number) => ((minutes - GRID_START) / 60) * HOUR_HEIGHT;
const dayNumber = (iso: string) => Number(iso.slice(8, 10));

/** Minutes écoulées depuis minuit, mises à jour chaque minute (trait de l'heure actuelle). */
function useNowMinutes() {
  const read = () => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  };
  const [minutes, setMinutes] = useState(read);
  useEffect(() => {
    const timer = window.setInterval(() => setMinutes(read()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return minutes;
}

/** Agenda personnel du compte connecté : jour, semaine ou mois, comme Outlook. */
export function AgendaPage() {
  const isDesktop = useIsDesktop();
  const [params, setParams] = useSearchParams();
  const requestedView = params.get('vue');
  const view: AgendaView =
    requestedView === 'jour' || requestedView === 'semaine' || requestedView === 'mois'
      ? requestedView
      : isDesktop
        ? 'semaine'
        : 'jour';
  const requested = params.get('date') ?? '';
  const today = todayIso();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today;
  const range = viewRange(view, date);
  const agenda = useAgenda(range.from, range.to);
  const events = agenda.data ?? [];
  const [dialog, setDialog] = useState<OpenDialog | null>(null);

  const go = (next: { vue?: AgendaView; date?: string }) =>
    setParams({ vue: next.vue ?? view, date: next.date ?? date }, { replace: true });

  const newEvent = (preset?: Partial<EventPreset>) => {
    const slot = date === today ? nextSlot(new Date()) : { start: '09:00', end: '10:00' };
    setDialog({ event: null, preset: { date, ...slot, ...preset } });
  };
  const openEvent = (event: PersonalEvent) =>
    setDialog({ event, preset: { date, start: '09:00', end: '10:00' } });

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Mon agenda' }]}
        title="Mon agenda"
        actions={
          <>
            <span className="sub hidden xl:inline">Tes rendez-vous : personne d’autre ne les voit</span>
            <Button onClick={() => newEvent()}>
              <CalendarPlus /> Nouveau rendez-vous
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[264px_minmax(0,1fr)]">
        <aside className="col order-last gap-4 lg:order-first" aria-label="Calendrier">
          <MiniCalendar selected={date} today={today} onPick={(day) => go({ date: day })} />
          <DayList
            day={date}
            events={eventsOfDay(events, date)}
            loading={agenda.isPending}
            onOpen={openEvent}
          />
        </aside>

        <div className="col min-w-0 gap-4">
          <div className="toolbar flex-wrap">
            <div className="row flex-wrap gap-2">
              <Button variant="outline" onClick={() => go({ date: today })}>
                Aujourd’hui
              </Button>
              <button
                type="button"
                className="ibtn"
                aria-label="Période précédente"
                onClick={() => go({ date: shiftDate(view, date, -1) })}
              >
                <ChevronLeft className="i" />
              </button>
              <button
                type="button"
                className="ibtn"
                aria-label="Période suivante"
                onClick={() => go({ date: shiftDate(view, date, 1) })}
              >
                <ChevronRight className="i" />
              </button>
              <h2 className="h2 first-letter:uppercase" aria-live="polite">
                {periodLabel(view, date)}
              </h2>
            </div>
            <div className="seg" role="group" aria-label="Affichage">
              {VIEWS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  className={cn(view === value && 'on')}
                  onClick={() => go({ vue: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {agenda.isError && <p className="text-destructive">Impossible de charger ton agenda.</p>}

          {view === 'mois' ? (
            <MonthGrid
              date={date}
              today={today}
              events={events}
              onPickDay={(day) => go({ vue: 'jour', date: day })}
              onOpen={openEvent}
            />
          ) : (
            <TimeGrid
              days={viewDays(view, date)}
              today={today}
              events={events}
              onSlot={(day, minutes) => setDialog({ event: null, preset: { date: day, ...slotAt(minutes) } })}
              onPickDay={(day) => go({ vue: 'jour', date: day })}
              onOpen={openEvent}
            />
          )}
        </div>
      </div>

      {dialog && <EventDialog event={dialog.event} preset={dialog.preset} onClose={() => setDialog(null)} />}
    </>
  );
}

/** Petit calendrier du mois : choisir un jour, changer de mois. */
function MiniCalendar({
  selected,
  today,
  onPick,
}: {
  selected: string;
  today: string;
  onPick: (day: string) => void;
}) {
  // Mois affiché : celui du jour choisi, ou celui parcouru avec les flèches
  const [shown, setShown] = useState({ selected, month: selected.slice(0, 7) });
  if (shown.selected !== selected) setShown({ selected, month: selected.slice(0, 7) });
  const month = shown.selected === selected ? shown.month : selected.slice(0, 7);
  const setMonth = (value: string) => setShown({ selected, month: value });
  const first = `${month}-01`;
  const days = monthGrid(first);
  return (
    <section data-slot="card" className="card px-3 py-3" aria-label="Choisir un jour">
      <div className="row between mb-2">
        <b className="pl-1 text-[13.5px] first-letter:uppercase">{periodLabel('mois', first)}</b>
        <div className="row gap-0.5">
          <button
            type="button"
            className="ibtn sm ghost"
            aria-label="Mois précédent"
            onClick={() => setMonth(addMonths(first, -1).slice(0, 7))}
          >
            <ChevronLeft className="i" />
          </button>
          <button
            type="button"
            className="ibtn sm ghost"
            aria-label="Mois suivant"
            onClick={() => setMonth(addMonths(first, 1).slice(0, 7))}
          >
            <ChevronRight className="i" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground" aria-hidden>
        {WEEKDAYS_SHORT.map((name) => (
          <span key={name} className="py-1">
            {name.charAt(0).toUpperCase()}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {days.map((day) => (
          <button
            key={day}
            type="button"
            aria-label={longDay(day)}
            aria-pressed={day === selected}
            className={cn(
              'mx-auto grid size-8 place-items-center rounded-md text-[12.5px] tabular-nums hover:bg-muted',
              day.slice(0, 7) !== month && 'text-muted-foreground/60',
              day === today && 'font-bold text-primary',
              day === selected && 'bg-primary font-semibold text-primary-foreground hover:bg-primary',
            )}
            onClick={() => onPick(day)}
          >
            {dayNumber(day)}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Rendez-vous du jour choisi, en liste (sous le petit calendrier). */
function DayList({
  day,
  events,
  loading,
  onOpen,
}: {
  day: string;
  events: PersonalEvent[];
  loading: boolean;
  onOpen: (event: PersonalEvent) => void;
}) {
  return (
    <section data-slot="card" className="card px-4 py-3" aria-label={`Rendez-vous du ${longDay(day)}`}>
      <span className="overline first-letter:uppercase">{longDay(day)}</span>
      {!loading && events.length === 0 && <p className="hint mt-1.5">Aucun rendez-vous.</p>}
      <ul className="col mt-1.5 gap-1">
        {events.map((event) => (
          <li key={event.id}>
            <button
              type="button"
              className="flex w-full items-start gap-2.5 rounded-md px-1.5 py-1.5 text-left hover:bg-muted"
              onClick={() => onOpen(event)}
            >
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
              <span className="col min-w-0 gap-0">
                <b className="truncate text-[13.5px]">{event.title}</b>
                <span className="hint">
                  {timeLabel(event)}
                  {event.location ? ` · ${event.location}` : ''}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Nom lu par le lecteur d'écran : objet, horaire, lieu. */
const eventLabel = (event: PersonalEvent) =>
  `${event.title}, ${timeLabel(event).toLowerCase()}${event.location ? `, ${event.location}` : ''}`;

/** Grille horaire (jour ou semaine) : journées entières en haut, rendez-vous à leur heure. */
function TimeGrid({
  days,
  today,
  events,
  onSlot,
  onPickDay,
  onOpen,
}: {
  days: string[];
  today: string;
  events: PersonalEvent[];
  onSlot: (day: string, minutes: number) => void;
  onPickDay: (day: string) => void;
  onOpen: (event: PersonalEvent) => void;
}) {
  const now = useNowMinutes();
  const totalHeight = ((GRID_END - GRID_START) / 60) * HOUR_HEIGHT;
  const hours = Array.from({ length: (GRID_END - GRID_START) / 60 }, (_, index) => GRID_START / 60 + index);
  const allDay = days.map((day) => eventsOfDay(events, day).filter((event) => event.all_day));
  const single = days.length === 1;

  const clickSlot = (day: string) => (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const offset = event.clientY - event.currentTarget.getBoundingClientRect().top;
    onSlot(day, GRID_START + (offset / HOUR_HEIGHT) * 60);
  };

  return (
    <section data-slot="card" className="card overflow-x-auto" aria-label="Grille de l’agenda">
      <div style={{ minWidth: single ? undefined : '44rem' }}>
        <div className="flex border-b bg-card">
          <div className="w-14 shrink-0" />
          {days.map((day) => (
            <button
              key={day}
              type="button"
              role="columnheader"
              className={cn(
                'flex h-12 min-w-0 flex-1 items-center gap-1.5 border-l px-3 text-left text-[13px] hover:bg-muted',
                day === today && 'text-primary',
              )}
              onClick={() => onPickDay(day)}
            >
              <span className="text-muted-foreground">{WEEKDAYS_SHORT[weekdayIndex(day)]}</span>
              <b
                className={cn(
                  'grid size-7 place-items-center rounded-full text-[14px] tabular-nums',
                  day === today && 'bg-primary text-primary-foreground',
                )}
              >
                {dayNumber(day)}
              </b>
            </button>
          ))}
        </div>
        {allDay.some((list) => list.length > 0) && (
          <div className="flex border-b bg-card">
            <div className="flex w-14 shrink-0 items-center justify-end pr-2 text-right text-[10.5px] leading-[1.15] text-muted-foreground">
              Journée
            </div>
            {days.map((day, index) => (
              <ul
                key={day}
                className="col min-w-0 flex-1 gap-1 border-l p-1.5"
                aria-label={`Journée du ${longDay(day)}`}
              >
                {allDay[index]!.map((event) => (
                  <li key={event.id}>
                    <button
                      type="button"
                      aria-label={eventLabel(event)}
                      className="w-full truncate rounded-md bg-primary/12 px-2 py-0.5 text-left text-[12px] font-semibold text-primary hover:bg-primary/20"
                      onClick={() => onOpen(event)}
                    >
                      {event.title}
                    </button>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        )}
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
          {days.map((day) => {
            const timed = eventsOfDay(events, day)
              .filter((event) => !event.all_day)
              .map((event) => ({ event, ...daySpan(event, day) }));
            return (
              <div
                key={day}
                data-testid={`agenda-day-${day}`}
                className={cn(
                  'relative min-w-0 flex-1 cursor-pointer border-l',
                  day === today && 'bg-accent/40',
                )}
                style={{
                  height: totalHeight,
                  backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${HOUR_HEIGHT / 2}px, color-mix(in srgb, var(--border) 45%, transparent) ${HOUR_HEIGHT / 2}px ${HOUR_HEIGHT / 2 + 1}px, transparent ${HOUR_HEIGHT / 2 + 1}px ${HOUR_HEIGHT}px)`,
                }}
                onClick={clickSlot(day)}
              >
                {day === today && now >= GRID_START && now <= GRID_END && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-destructive before:absolute before:-top-[3px] before:-left-1 before:size-2 before:rounded-full before:bg-destructive"
                    style={{ top: toPx(now) }}
                  />
                )}
                {layoutDayEvents(timed).map((block) => {
                  const width = 100 / block.columns;
                  const height = Math.max(20, toPx(block.end) - toPx(block.start) - 2);
                  return (
                    <button
                      key={block.event.id}
                      type="button"
                      aria-label={eventLabel(block.event)}
                      className="absolute z-10 overflow-hidden rounded-[7px] border-l-[3px] border-primary bg-[color-mix(in_srgb,var(--primary)_14%,var(--card))] px-[7px] py-1 text-left text-[11.5px] leading-[1.3] hover:bg-[color-mix(in_srgb,var(--primary)_22%,var(--card))]"
                      style={{
                        top: toPx(block.start),
                        height,
                        left: `calc(${block.column * width}% + 3px)`,
                        width: `calc(${width}% - 6px)`,
                      }}
                      onClick={() => onOpen(block.event)}
                    >
                      <b className="block truncate">{block.event.title}</b>
                      {height >= 34 && (
                        <span className="block truncate text-muted-foreground">
                          {clock(new Date(block.event.starts_at))} - {clock(new Date(block.event.ends_at))}
                          {block.event.location && (
                            <>
                              {' · '}
                              <MapPin className="inline size-3" /> {block.event.location}
                            </>
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Vue du mois : six semaines, trois rendez-vous par jour au plus, le reste en « + n ». */
function MonthGrid({
  date,
  today,
  events,
  onPickDay,
  onOpen,
}: {
  date: string;
  today: string;
  events: PersonalEvent[];
  onPickDay: (day: string) => void;
  onOpen: (event: PersonalEvent) => void;
}) {
  const month = date.slice(0, 7);
  return (
    <section data-slot="card" className="card overflow-hidden" aria-label="Mois">
      <div className="grid grid-cols-7 border-b bg-card text-[12px] text-muted-foreground" aria-hidden>
        {WEEKDAYS_SHORT.map((name) => (
          <span key={name} className="px-2 py-2 first-letter:uppercase">
            {name}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {monthGrid(date).map((day, index) => {
          const list = eventsOfDay(events, day);
          return (
            <div
              key={day}
              data-testid={`agenda-month-${day}`}
              className={cn(
                'min-h-[92px] min-w-0 border-b p-1 sm:min-h-[112px]',
                index % 7 !== 0 && 'border-l',
                day.slice(0, 7) !== month && 'bg-muted/40',
              )}
            >
              <button
                type="button"
                aria-label={`Voir le ${longDay(day)}`}
                className={cn(
                  'mb-0.5 grid size-6 place-items-center rounded-full text-[12px] tabular-nums hover:bg-muted',
                  day.slice(0, 7) !== month && 'text-muted-foreground',
                  day === today && 'bg-primary font-bold text-primary-foreground hover:bg-primary',
                )}
                onClick={() => onPickDay(day)}
              >
                {dayNumber(day)}
              </button>
              <ul className="col gap-0.5">
                {list.slice(0, 3).map((event) => (
                  <li key={event.id} className="min-w-0">
                    <button
                      type="button"
                      aria-label={eventLabel(event)}
                      className={cn(
                        'flex w-full min-w-0 items-center gap-1 truncate rounded px-1 py-px text-left text-[11.5px] hover:bg-muted',
                        event.all_day && 'bg-primary/12 font-semibold text-primary',
                      )}
                      onClick={() => onOpen(event)}
                    >
                      {!event.all_day && (
                        <span className="hidden shrink-0 text-muted-foreground tabular-nums xl:inline">
                          {clock(new Date(event.starts_at))}
                        </span>
                      )}
                      <span className="truncate">{event.title}</span>
                    </button>
                  </li>
                ))}
                {list.length > 3 && (
                  <li>
                    <button
                      type="button"
                      className="px-1 text-[11.5px] font-semibold text-muted-foreground hover:text-foreground"
                      onClick={() => onPickDay(day)}
                    >
                      + {list.length - 3} autre{list.length - 3 > 1 ? 's' : ''}
                    </button>
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
