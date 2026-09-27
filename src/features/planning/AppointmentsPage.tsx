import { useState } from 'react';
import { Link } from 'react-router';
import { CalendarDays, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { todayIso } from '@/features/repair-orders/schemas';
import type { Appointment } from './api';
import { AppointmentDialog } from './AppointmentDialog';
import { needsReminder, shortTime } from './domain';
import { useUpcomingAppointments } from './hooks';

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

/** Rendez-vous à venir, avec les rappels à envoyer la veille. */
export function AppointmentsPage() {
  const today = todayIso();
  const appointments = useUpcomingAppointments(today);
  const [open, setOpen] = useState<{ appointment: Appointment | null } | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Rendez-vous</h1>
          <p className="text-muted-foreground">Rendez-vous à venir. Le rappel se fait la veille.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" variant="outline" asChild>
            <Link to="/planning">
              <CalendarDays /> Planning
            </Link>
          </Button>
          <Button size="lg" onClick={() => setOpen({ appointment: null })}>
            <Plus /> Nouveau rendez-vous
          </Button>
        </div>
      </div>

      {appointments.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {appointments.isError && <p className="text-destructive">Impossible de charger les rendez-vous.</p>}
      {appointments.isSuccess && appointments.data.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Aucun rendez-vous à venir.
        </p>
      )}

      {appointments.data && appointments.data.length > 0 && (
        <ul className="space-y-2">
          {appointments.data.map((appointment) => (
            <li key={appointment.id}>
              <button
                type="button"
                className="block w-full rounded-lg border bg-card p-4 text-left transition hover:bg-muted"
                onClick={() => setOpen({ appointment })}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>
                    {longDate(appointment.scheduled_date)} à {shortTime(appointment.start_time)} —{' '}
                    {appointment.plate ?? 'sans immatriculation'}
                  </strong>
                  {needsReminder(appointment, today) ? (
                    <Badge className="bg-amber-500 text-white">Rappel à envoyer</Badge>
                  ) : (
                    appointment.reminder_sent_at && (
                      <span className="text-sm text-muted-foreground">Rappel envoyé</span>
                    )
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  {[appointment.client_name, appointment.reason, appointment.technician_name ?? 'à assigner']
                    .filter(Boolean)
                    .join(' — ')}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && <AppointmentDialog appointment={open.appointment} onClose={() => setOpen(null)} />}
    </div>
  );
}
