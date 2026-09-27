import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Pointages</h1>
          <p className="text-muted-foreground">Arrivées et départs enregistrés par la borne.</p>
        </div>
        <Button size="lg" onClick={() => setDialog({ kind: 'manual' })} disabled={!day.data?.length}>
          <Plus /> Correction manuelle
        </Button>
      </div>

      <AttendanceTabs />

      <div className="flex flex-wrap items-end gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Jour précédent"
          onClick={() => go(addDays(date, -1))}
        >
          <ChevronLeft />
        </Button>
        <div className="space-y-1">
          <Label htmlFor="attendance-date">Jour</Label>
          <Input
            id="attendance-date"
            type="date"
            className="h-9 w-44"
            value={date}
            max={today}
            onChange={(event) => event.target.value && go(event.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Jour suivant"
          disabled={date >= today}
          onClick={() => go(addDays(date, 1))}
        >
          <ChevronRight />
        </Button>
        <h2 className="ml-2 self-center font-bold">{dayLabel(date)}</h2>
      </div>

      {day.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {day.isError && <p className="text-destructive">Impossible de charger les pointages.</p>}
      {day.data?.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Aucun technicien.
        </p>
      )}

      <ul className="space-y-3">
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

      <KioskSettingsCard onExitCode={() => setDialog({ kind: 'exit-code' })} />

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
    </div>
  );
}

interface TechnicianCardProps {
  tech: TechnicianDay;
  isToday: boolean;
  photoUrls: Record<string, string>;
  onPhoto: (event: ClockEvent) => void;
  onDelete: (event: ClockEvent) => void;
}

function TechnicianCard({ tech, isToday, photoUrls, onPhoto, onDelete }: TechnicianCardProps) {
  const present = isToday && tech.events[tech.events.length - 1]?.event_type === 'in';
  const attendance = tech.attendance;

  return (
    <article aria-label={tech.display_name} className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-lg">{tech.display_name}</strong>
          {present && <Badge className="bg-emerald-700 text-white">Présent</Badge>}
          {!tech.hasPin && (
            <Link to="/equipe" className="text-sm text-destructive hover:underline">
              Pas de code PIN
            </Link>
          )}
        </div>
        <span className="text-xl font-bold tabular-nums">
          {tech.events.length ? formatHoursMinutes(workedSeconds(tech, isToday, new Date())) : '—'}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {attendance && attendance.late_minutes > 0 && (
          <span className="font-semibold text-amber-700">Retard : {formatLate(attendance.late_minutes)}</span>
        )}
        {attendance && attendance.overtime_seconds > 0 && (
          <span className="font-semibold text-sky-700">
            Heures sup. : {formatHoursMinutes(attendance.overtime_seconds)}
          </span>
        )}
        {attendance && attendance.anomalies > 0 && (
          <span className="flex items-center gap-1 font-semibold text-amber-700">
            <TriangleAlert className="size-4" /> Pointage incomplet (arrivée ou départ manquant)
          </span>
        )}
        {tech.leaveType && (
          <span>
            {LEAVE_LABELS[tech.leaveType]}
            {tech.events.length > 0 && (
              <strong className="text-destructive"> — a badgé pendant son absence</strong>
            )}
          </span>
        )}
      </div>

      {tech.events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun pointage</p>
      ) : (
        <ul className="flex flex-wrap gap-3" aria-label={`Pointages de ${tech.display_name}`}>
          {tech.events.map((event) => {
            const url = event.photo_file_id ? photoUrls[event.photo_file_id] : undefined;
            const label = `${event.event_type === 'in' ? 'Arrivée' : 'Départ'} ${clockTime(event.occurred_at)}`;
            return (
              <li key={event.id} className="w-20 text-center text-xs">
                {url && !event.photo_purged_at ? (
                  <button type="button" onClick={() => onPhoto(event)} aria-label={`Photo : ${label}`}>
                    <img src={url} alt="" className="h-14 w-20 cursor-zoom-in rounded object-cover" />
                  </button>
                ) : (
                  <div className="flex h-14 w-20 items-center justify-center rounded border border-dashed text-[10px] text-muted-foreground">
                    {event.source === 'manual' ? 'Manuel' : event.photo_purged_at ? 'Photo supprimée' : ''}
                  </div>
                )}
                <strong className={cn(event.event_type === 'in' ? 'text-emerald-700' : 'text-amber-700')}>
                  {event.event_type === 'in' ? '↘ ' : '↗ '}
                  {clockTime(event.occurred_at)}
                </strong>
                {event.source === 'manual' && (
                  <div className="flex items-center justify-center gap-0.5 text-muted-foreground">
                    <span className="truncate" title={event.reason ?? undefined}>
                      manuel
                    </span>
                    <button
                      type="button"
                      aria-label={`Supprimer la correction : ${label}`}
                      className="rounded p-0.5 hover:text-destructive"
                      onClick={() => onDelete(event)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
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
    <Card>
      <CardHeader>
        <CardTitle>Borne de pointage</CardTitle>
        <CardDescription>
          Sur la tablette posée devant les vestiaires, connecte-toi avec le compte « Borne atelier » : l’écran
          de pointage s’ouvre en plein écran. Les codes PIN des techniciens se règlent dans{' '}
          <Link to="/equipe" className="underline">
            Équipe
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-6">
        <div className="space-y-2">
          <p className="text-sm font-medium">Code de sortie</p>
          <div className="flex items-center gap-3">
            <span className={cn('text-sm', settings.data?.exitCodeSet ? '' : 'text-destructive')}>
              {settings.data ? (settings.data.exitCodeSet ? 'Défini' : 'Non défini') : '…'}
            </span>
            <Button variant="outline" onClick={onExitCode}>
              {settings.data?.exitCodeSet ? 'Changer le code' : 'Définir le code'}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="photo-retention">Garder les photos</Label>
          <select
            id="photo-retention"
            className="h-9 rounded-md border bg-transparent px-3"
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
        </div>
      </CardContent>
    </Card>
  );
}
