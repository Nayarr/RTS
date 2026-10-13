import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { bookAppointment, fetchPublicBooking } from './booking-api';
import { Notice, PublicHeader } from './document-ui';

/** « 2026-10-14 » → « mercredi 14 octobre ». */
const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR');
/** « 09:30 » → « 9h30 ». */
const hour = (time: string) => `${Number(time.slice(0, 2))}h${time.slice(3, 5)}`;

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Demande impossible pour le moment : réessayez.';

/**
 * Prise de rendez-vous par le client (lien de l'e-mail d'échéance), sans compte : il choisit un
 * créneau libre de l'atelier ; le rendez-vous est « demandé » jusqu'à la confirmation du bureau.
 */
export function PublicBookingPage() {
  const { token = '' } = useParams();
  const queryClient = useQueryClient();
  const booking = useQuery({ queryKey: ['public-booking', token], queryFn: () => fetchPublicBooking(token) });
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const book = useMutation({
    mutationFn: () => bookAppointment(token, day!, time!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['public-booking', token] }),
  });

  const data = booking.data;
  const message = (text: string) => <p className="empty mx-auto mt-16 max-w-md px-4">{text}</p>;
  if (booking.isPending) return message('Chargement…');
  if (booking.isError)
    return (
      <div className="col mx-auto mt-16 max-w-md items-center gap-3 px-4 text-center">
        <p className="empty">Impossible de charger la page pour le moment.</p>
        <Button onClick={() => void booking.refetch()} disabled={booking.isFetching}>
          Réessayer
        </Button>
      </div>
    );
  if (!data)
    return message('Ce lien est introuvable ou a expiré : contactez l’atelier pour prendre rendez-vous.');

  const selectedDay = data.slots.find((slot) => slot.date === (day ?? data.slots[0]?.date)) ?? null;

  return (
    <div className="min-h-dvh bg-background">
      <PublicHeader company={data.company} subtitle="Prise de rendez-vous" />
      <main className="mx-auto flex w-full max-w-[880px] flex-col gap-5 px-4 py-6 sm:px-6">
        <section data-slot="card" className="card">
          <div className="card-b col gap-1.5">
            <h1 className="title xl">{data.reason}</h1>
            <p className="muted">
              {data.plate ? (
                <>
                  Véhicule <span className="plate">{data.plate}</span>
                </>
              ) : (
                'Votre véhicule'
              )}
              {data.due_date && <> · échéance le {shortDate(data.due_date)}</>}
            </p>
          </div>
        </section>

        {data.appointment ? (
          <Notice tone={data.appointment.status === 'requested' ? 's-blue' : 's-ok'}>
            {data.appointment.status === 'requested'
              ? `Demande envoyée pour le ${dayLabel(data.appointment.date)} à ${hour(data.appointment.time)}. L’atelier vous confirme le rendez-vous par e-mail.`
              : `Rendez-vous confirmé le ${dayLabel(data.appointment.date)} à ${hour(data.appointment.time)}.`}
          </Notice>
        ) : data.slots.length === 0 ? (
          <Notice tone="s-grey">
            Aucun créneau libre en ligne pour le moment : appelez l’atelier
            {data.company.phone ? ` au ${data.company.phone}` : ''}.
          </Notice>
        ) : (
          <section data-slot="card" className="card" aria-labelledby="booking-title">
            <div className="card-h">
              <h2 className="h2" id="booking-title">
                Choisissez votre créneau
              </h2>
            </div>
            <div className="card-b col gap-4">
              <div className="chips" role="group" aria-label="Jour">
                {data.slots.map((slot) => {
                  const on = slot.date === selectedDay?.date;
                  return (
                    <button
                      key={slot.date}
                      type="button"
                      className={cn('chip', on && 'on')}
                      aria-pressed={on}
                      onClick={() => {
                        setDay(slot.date);
                        setTime(null);
                      }}
                    >
                      {dayLabel(slot.date)}
                    </button>
                  );
                })}
              </div>
              {selectedDay && (
                <div className="chips" role="group" aria-label="Heure">
                  {selectedDay.times.map((slotTime) => {
                    const on = slotTime === time && selectedDay.date === (day ?? data.slots[0]?.date);
                    return (
                      <button
                        key={slotTime}
                        type="button"
                        className={cn('chip num', on && 'on')}
                        aria-pressed={on}
                        onClick={() => {
                          setDay(selectedDay.date);
                          setTime(slotTime);
                        }}
                      >
                        {hour(slotTime)}
                      </button>
                    );
                  })}
                </div>
              )}
              {book.isError && <Notice tone="s-bad">{errorMessage(book.error)}</Notice>}
              <div className="row justify-end">
                <Button disabled={!time || book.isPending} onClick={() => book.mutate()}>
                  <CalendarCheck />
                  {book.isPending
                    ? 'Envoi…'
                    : time && selectedDay
                      ? `Demander le ${dayLabel(selectedDay.date)} à ${hour(time)}`
                      : 'Choisissez une heure'}
                </Button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
