import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { CalendarDays, ChevronRight, MessageSquare, Plus } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { todayIso } from '@/features/repair-orders/schemas';
import type { Appointment } from './api';
import { AppointmentDialog } from './AppointmentDialog';
import { addDays, needsReminder, shortTime } from './domain';
import { useUpcomingAppointments } from './hooks';

const dayName = (iso: string) => {
  const label = new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/** « Aujourd’hui — mercredi 30 septembre », « Demain — … », « Lundi 5 octobre ». */
function dayLabel(iso: string, today: string) {
  if (iso === today) return `Aujourd’hui — ${dayName(iso).toLowerCase()}`;
  if (iso === addDays(today, 1)) return `Demain — ${dayName(iso).toLowerCase()}`;
  return dayName(iso);
}

/** Rendez-vous à venir, avec les rappels à envoyer la veille. */
export function AppointmentsPage() {
  const today = todayIso();
  const appointments = useUpcomingAppointments(today);
  const [open, setOpen] = useState<{ appointment: Appointment | null } | null>(null);

  const list = appointments.data ?? [];
  const days = new Map<string, Appointment[]>();
  for (const appointment of list) {
    days.set(appointment.scheduled_date, [...(days.get(appointment.scheduled_date) ?? []), appointment]);
  }
  const reminders = list.filter((appointment) => needsReminder(appointment, today)).length;

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Atelier' }, { label: 'Rendez-vous' }]}
        title="Rendez-vous"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/planning">
                <CalendarDays /> Planning
              </Link>
            </Button>
            <Button onClick={() => setOpen({ appointment: null })}>
              <Plus /> Nouveau rendez-vous
            </Button>
          </>
        }
      />

      {reminders > 0 && (
        <div className="alert s-warn">
          <MessageSquare className="i" />
          <div className="grow">
            <b>
              {reminders} rappel{reminders > 1 ? 's' : ''} à envoyer
            </b>{' '}
            <span className="muted">
              pour les rendez-vous de demain. Le rappel se fait la veille, par e-mail ou SMS depuis ton
              téléphone.
            </span>
          </div>
        </div>
      )}

      {appointments.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {appointments.isError && <p className="text-destructive">Impossible de charger les rendez-vous.</p>}
      {appointments.isSuccess && list.length === 0 && <p className="empty">Aucun rendez-vous à venir.</p>}

      {list.length > 0 && (
        <section data-slot="card" className="card overflow-hidden" aria-label="Rendez-vous à venir">
          {[...days.entries()].map(([day, items]) => (
            <div key={day}>
              <div className="row gap-2.5 border-b bg-head px-5 py-2.5">
                <b>{dayLabel(day, today)}</b>
                <span className="cnt">{items.length}</span>
              </div>
              <ul>
                {items.map((appointment) => {
                  const reminder = needsReminder(appointment, today);
                  return (
                    <li key={appointment.id}>
                      <button
                        type="button"
                        className="li w-full cursor-pointer flex-wrap gap-[18px] border-b text-left hover:bg-hover sm:flex-nowrap"
                        onClick={() => setOpen({ appointment })}
                      >
                        <span className="flex h-[52px] w-16 shrink-0 flex-col items-center justify-center rounded-[7px] border bg-card">
                          <b className="num font-display text-xl leading-none">
                            {shortTime(appointment.start_time)}
                          </b>
                          {appointment.end_time && (
                            <span className="hint text-[11px]">→ {shortTime(appointment.end_time)}</span>
                          )}
                        </span>
                        <span className="col grow gap-[3px]">
                          <span className="row gap-2.5">
                            <span className="plate">{appointment.plate ?? 'sans immatriculation'}</span>
                            <span className="b">{appointment.client_name}</span>
                          </span>
                          <span className="muted text-[13px]">{appointment.reason}</span>
                        </span>
                        <span className="who w-[150px]">
                          <span
                            className="tdot"
                            style={
                              {
                                '--c': appointment.technician_name
                                  ? (appointment.technician_color ?? '#6B7280')
                                  : '#9aa0a6',
                              } as CSSProperties
                            }
                          />
                          <span className={appointment.technician_name ? '' : 'muted'}>
                            {appointment.technician_name ?? 'à assigner'}
                          </span>
                        </span>
                        <span className="flex w-[150px] justify-end">
                          {reminder ? (
                            <span className="badge s-warn">Rappel à envoyer</span>
                          ) : appointment.reminder_sent_at ? (
                            <span className="badge s-ok dot">Rappel envoyé</span>
                          ) : (
                            <span className="hint">Rappel la veille</span>
                          )}
                        </span>
                        <ChevronRight className="i s muted" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      )}

      {open && <AppointmentDialog appointment={open.appointment} onClose={() => setOpen(null)} />}
    </>
  );
}
