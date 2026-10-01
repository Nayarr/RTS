import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Camera, ChevronLeft, ChevronRight, Plus, Tablet, Trash2, TriangleAlert } from 'lucide-react';
import { initials } from '@/app/nav';
import { PageHeader } from '@/app/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFileUrls } from '@/features/files/hooks';
import { LEAVE_LABELS } from '@/features/leave/domain';
import { addDays, dayLabel } from '@/features/planning/domain';
import { todayIso } from '@/features/repair-orders/schemas';
import { cn } from '@/lib/utils';
import { AttendanceTabs } from './AttendanceTabs';
import { deleteManualClockEvent, updatePhotoRetention, type ClockEvent, type TechnicianDay } from './api';
import { ClockPhotoDialog, ExitCodeDialog, ManualClockDialog } from './dialogs';
import { clockTime, formatHoursMinutes, formatLate, workedSeconds } from './domain';
import { useAttendanceDay, useAttendanceMutation, useKioskSettings } from './hooks';

type OpenDialog =
  | { kind: 'manual' }
  | { kind: 'exit-code' }
  | { kind: 'photo'; title: string; fileId: string }
  | { kind: 'delete'; event: ClockEvent; name: string };

const eventLabel = (event: ClockEvent) => (event.event_type === 'in' ? 'arrivée' : 'départ');

/** Pointages de la borne (direction) : présence du jour, photos, corrections, réglages de la borne. */
export function AttendancePage() {
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const requested = params.get('date') ?? '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today;
  const day = useAttendanceDay(date);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const remove = useAttendanceMutation((id: string) => deleteManualClockEvent(id), 'Correction supprimée');
  const photoIds = (day.data ?? []).flatMap((tech) =>
    tech.events.flatMap((event) =>
      event.photo_file_id && !event.photo_purged_at ? [event.photo_file_id] : [],
    ),
  );
  const photos = useFileUrls(photoIds);
  const go = (next: string) => setParams({ date: next }, { replace: true });

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Équipe' }, { label: 'Pointages' }]}
        title="Pointages"
        actions={
          <>
            <span className="sub hidden md:inline">Arrivées et départs enregistrés par la borne</span>
            <Button
              variant="outline"
              onClick={() => setDialog({ kind: 'manual' })}
              disabled={!day.data?.length}
            >
              <Plus /> Ajouter une correction
            </Button>
          </>
        }
      />

      <div className="col gap-4">
        <div className="toolbar flex-wrap">
          <AttendanceTabs />
          <div className="row flex-wrap gap-2">
            <button
              type="button"
              className="ibtn"
              aria-label="Jour précédent"
              onClick={() => go(addDays(date, -1))}
            >
              <ChevronLeft className="i" />
            </button>
            <h2 className="h2 justify-center sm:min-w-[220px]">{dayLabel(date)}</h2>
            <button
              type="button"
              className="ibtn disabled:opacity-40"
              aria-label="Jour suivant"
              disabled={date >= today}
              onClick={() => go(addDays(date, 1))}
            >
              <ChevronRight className="i" />
            </button>
            <Label htmlFor="attendance-date" className="sr-only">
              Jour
            </Label>
            <Input
              id="attendance-date"
              type="date"
              className="w-[150px]"
              value={date}
              max={today}
              onChange={(event) => event.target.value && go(event.target.value)}
            />
          </div>
        </div>

        <div className="split grid-cols-1! lg:grid-cols-[minmax(0,1fr)_320px]!">
          <div className="col gap-3">
            {day.isPending && <p className="text-muted-foreground">Chargement…</p>}
            {day.isError && <p className="text-destructive">Impossible de charger les pointages.</p>}
            {day.data?.length === 0 && <p className="empty">Aucun technicien.</p>}
            <ul className="col gap-3">
              {(day.data ?? []).map((tech) => (
                <li key={tech.id}>
                  <TechnicianCard
                    tech={tech}
                    isToday={date === today}
                    photoUrls={photos.data ?? {}}
                    onPhoto={(event) =>
                      event.photo_file_id &&
                      setDialog({
                        kind: 'photo',
                        fileId: event.photo_file_id,
                        title: `${tech.display_name} — ${eventLabel(event)} ${clockTime(event.occurred_at)}`,
                      })
                    }
                    onDelete={(event) => setDialog({ kind: 'delete', event, name: tech.display_name })}
                  />
                </li>
              ))}
            </ul>
          </div>
          <KioskSettingsCard onExitCode={() => setDialog({ kind: 'exit-code' })} />
        </div>
      </div>

      {dialog?.kind === 'manual' && day.data && (
        <ManualClockDialog date={date} technicians={day.data} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'exit-code' && <ExitCodeDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === 'photo' && (
        <ClockPhotoDialog title={dialog.title} fileId={dialog.fileId} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title="Supprimer cette correction ?"
          description={`${dialog.name} — ${eventLabel(dialog.event)} à ${clockTime(dialog.event.occurred_at)} (${dialog.event.reason ?? 'sans motif'}).`}
          confirmLabel="Supprimer"
          destructive
          pending={remove.isPending}
          onConfirm={() => remove.mutate(dialog.event.id, { onSuccess: () => setDialog(null) })}
        />
      )}
    </>
  );
}

interface TechnicianCardProps {
  tech: TechnicianDay;
  isToday: boolean;
  photoUrls: Record<string, string>;
  onPhoto: (event: ClockEvent) => void;
  onDelete: (event: ClockEvent) => void;
}

/** Plages de présence de la journée (arrivée → départ), en % d'une journée de 6 h à 20 h. */
function presenceSpans(events: ClockEvent[], isToday: boolean) {
  const start = 6 * 60;
  const span = 14 * 60;
  const minutes = (iso: string) => {
    const date = new Date(iso);
    return date.getHours() * 60 + date.getMinutes();
  };
  const now = new Date();
  const spans: { left: number; width: number }[] = [];
  let opened: number | null = null;
  for (const event of events) {
    if (event.event_type === 'in') opened = minutes(event.occurred_at);
    else if (opened !== null) {
      spans.push({ left: opened, width: minutes(event.occurred_at) - opened });
      opened = null;
    }
  }
  if (opened !== null && isToday)
    spans.push({ left: opened, width: now.getHours() * 60 + now.getMinutes() - opened });
  return spans
    .filter((item) => item.width > 0)
    .map((item) => ({
      left: Math.max(0, ((item.left - start) / span) * 100),
      width: Math.min(100, (item.width / span) * 100),
    }));
}

function TechnicianCard({ tech, isToday, photoUrls, onPhoto, onDelete }: TechnicianCardProps) {
  const present = isToday && tech.events[tech.events.length - 1]?.event_type === 'in';
  const attendance = tech.attendance;
  const spans = presenceSpans(tech.events, isToday);

  return (
    <article aria-label={tech.display_name} className="card">
      <div className="card-h flex-wrap">
        <span className="who flex-wrap">
          <span className="av">{initials(tech.display_name)}</span>
          <b className="text-[15px]">{tech.display_name}</b>
          {present && <span className="badge s-ok dot">Présent</span>}
          {tech.leaveType && (
            <span className="badge s-warn">
              {LEAVE_LABELS[tech.leaveType]}
              {tech.events.length > 0 && <span className="sr-only"> — a badgé pendant son absence</span>}
            </span>
          )}
          {attendance && attendance.late_minutes > 0 && (
            <span className="warn-t b text-[13px]">Retard : {formatLate(attendance.late_minutes)}</span>
          )}
          {attendance && attendance.overtime_seconds > 0 && (
            <span className="b text-[13px] text-[#4750B5] dark:text-[#9aa2ef]">
              Heures sup. : {formatHoursMinutes(attendance.overtime_seconds)}
            </span>
          )}
          {!tech.hasPin && (
            <Link to="/equipe" className="text-[13px] font-semibold text-destructive hover:underline">
              Pas de code PIN
            </Link>
          )}
        </span>
        <span className="muted num text-[13px]">
          {tech.leaveType && tech.events.length > 0 ? (
            <b className="down">a badgé pendant son absence</b>
          ) : tech.events.length ? (
            <>
              <b className="text-foreground">
                {formatHoursMinutes(workedSeconds(tech, isToday, new Date()))}
              </b>
              {isToday ? ' aujourd’hui' : ''}
            </>
          ) : (
            '—'
          )}
        </span>
      </div>

      <div className="card-b col gap-3">
        {attendance && attendance.anomalies > 0 && (
          <div className="alert s-warn px-3 py-2">
            <TriangleAlert className="i" />
            <span>Pointage incomplet (arrivée ou départ manquant)</span>
          </div>
        )}
        {spans.length > 0 && (
          <div className="relative h-2 rounded bg-muted" aria-hidden>
            {spans.map((item, index) => (
              <i
                key={index}
                className="absolute inset-y-0 rounded bg-primary"
                style={{ left: `${item.left}%`, width: `${item.width}%` }}
              />
            ))}
          </div>
        )}
        {tech.events.length === 0 ? (
          <p className="hint">Aucun pointage</p>
        ) : (
          <ul className="row wrap gap-2" aria-label={`Pointages de ${tech.display_name}`}>
            {tech.events.map((event) => {
              const url = event.photo_file_id ? photoUrls[event.photo_file_id] : undefined;
              const label = `${event.event_type === 'in' ? 'Arrivée' : 'Départ'} ${clockTime(event.occurred_at)}`;
              const thumb = (
                <span className="flex size-8 items-center justify-center overflow-hidden rounded-[7px] bg-muted text-muted-foreground">
                  {url && !event.photo_purged_at ? (
                    <img src={url} alt="" className="size-full object-cover" />
                  ) : (
                    <Camera className="i xs" />
                  )}
                </span>
              );
              const chip =
                'inline-flex h-10 items-center gap-2 rounded-[10px] border bg-card pr-3 pl-1 text-[13px] font-medium';
              return (
                <li key={event.id}>
                  {url && !event.photo_purged_at ? (
                    <button
                      type="button"
                      className={cn(chip, 'cursor-zoom-in hover:bg-hover')}
                      onClick={() => onPhoto(event)}
                      aria-label={`Photo : ${label}`}
                    >
                      {thumb}
                      {label}
                    </button>
                  ) : (
                    <span className={chip} title={event.reason ?? undefined}>
                      {thumb}
                      {label}
                      {event.source === 'manual' && <span className="tag">Manuel</span>}
                      {event.photo_purged_at && <span className="tag">Photo supprimée</span>}
                      {event.source === 'manual' && (
                        <button
                          type="button"
                          className="ibtn sm ghost size-6! text-destructive"
                          aria-label={`Supprimer la correction : ${label}`}
                          onClick={() => onDelete(event)}
                        >
                          <Trash2 className="i xs" />
                        </button>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </article>
  );
}

const RETENTION_OPTIONS = [1, 3, 6, 12];

function KioskSettingsCard({ onExitCode }: { onExitCode: () => void }) {
  const settings = useKioskSettings();
  const retention = useAttendanceMutation(
    (months: number) => updatePhotoRetention(months),
    'Durée de conservation enregistrée',
  );

  return (
    <section data-slot="card" className="card" aria-labelledby="kiosk-settings">
      <div className="card-h">
        <h2 className="h2" id="kiosk-settings">
          <Tablet className="i" /> Borne de pointage
        </h2>
      </div>
      <div className="card-b col gap-4">
        <p className="hint">
          Sur la tablette de l’atelier, connecte-toi avec le compte « Borne atelier » : l’écran de pointage
          s’ouvre en plein écran. Les codes PIN des techniciens se règlent dans{' '}
          <Link to="/equipe" className="link">
            Équipe
          </Link>
          .
        </p>
        <div className="row between">
          <div className="col gap-0.5">
            <span className="lbl">Code de sortie</span>
            {settings.data ? (
              <span className={cn('badge dot self-start', settings.data.exitCodeSet ? 's-ok' : 's-bad')}>
                {settings.data.exitCodeSet ? 'Défini' : 'Non défini'}
              </span>
            ) : (
              <span className="hint">…</span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onExitCode}>
            {settings.data?.exitCodeSet ? 'Changer le code' : 'Définir le code'}
          </Button>
        </div>
        <div className="field">
          <Label htmlFor="photo-retention">Garder les photos</Label>
          <select
            id="photo-retention"
            className="inp"
            disabled={!settings.data || retention.isPending}
            value={settings.data?.photoRetentionMonths ?? 3}
            onChange={(event) => retention.mutate(Number(event.target.value))}
          >
            {RETENTION_OPTIONS.map((months) => (
              <option key={months} value={months}>
                {months} mois
              </option>
            ))}
          </select>
          <span className="hint">Les photos plus anciennes sont supprimées automatiquement.</span>
        </div>
      </div>
    </section>
  );
}
