import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Sparkle } from 'lucide-react';
import { initials } from '@/app/nav';
import { Button } from '@/components/ui/button';
import { technicianColor } from '@/features/planning/domain';
import { todayIso } from '@/features/repair-orders/schemas';
import { cn } from '@/lib/utils';
import {
  CURRENT_LABEL,
  fetchWorkshopWorkload,
  hours,
  loadColor,
  loadRatio,
  periodLabel,
  periodRange,
  shiftPeriod,
  unassignedHours,
  type TechnicianWorkload,
  type WorkloadPeriod,
} from './workload';
import { WorkloadDetailDialog } from './WorkloadDetailDialog';

const PERIODS: [WorkloadPeriod, string][] = [
  ['day', 'Jour'],
  ['week', 'Semaine'],
  ['month', 'Mois'],
];

/**
 * Jauge déclaré ÷ disponible : rouge → ambre → vert, or (avec reflet) à 100 % et plus.
 * `neutral` : temps saisi hors heures d'ouverture (rien à comparer), jauge pleine et grise.
 */
function Gauge({ ratio, label, neutral = false }: { ratio: number; label: string; neutral?: boolean }) {
  const color = neutral ? 'var(--muted-foreground)' : loadColor(ratio);
  return (
    <div
      className="bar h-[6px]! rounded-[3px]!"
      {...(neutral
        ? { 'aria-hidden': true, 'data-testid': 'gauge-off-hours' }
        : {
            role: 'meter',
            'aria-label': label,
            'aria-valuemin': 0,
            'aria-valuemax': 100,
            'aria-valuenow': Math.round(ratio * 100),
          })}
    >
      <i
        className={cn(color === 'gold' && 'gauge-gold')}
        style={{ width: `${Math.min(1, ratio) * 100}%`, ...(color === 'gold' ? {} : { background: color }) }}
      />
    </div>
  );
}

const ABSENCE = { leave: 'Absent · congés', rest: 'Absent · repos', closed: 'Atelier fermé' } as const;

const percent = (ratio: number) => `${Math.round(ratio * 100)} %`;

/**
 * Chrono badgé sur les OR, présence pointée à la borne (si le technicien pointe) et heures de
 * présence non affectées à un OR (écart avec le déclaré).
 */
function Presence({ badged, clocked, declared }: { badged: number; clocked: number; declared: number }) {
  const gap = unassignedHours(clocked, declared);
  return (
    <span className="row gap-1.5 text-[12.5px] text-muted-foreground">
      <Clock className="i xs shrink-0" aria-hidden />
      <span>
        Badgé <b className="num text-foreground">{hours(badged)}</b> sur les OR
        {clocked > 0 && (
          <>
            {' · présence '}
            <b className="num text-foreground">{hours(clocked)}</b>
          </>
        )}
        {gap > 0 && (
          <>
            {' · '}
            <b className="num text-warning" title="Heures de présence sans temps déclaré sur un OR">
              {hours(gap)} non affectées
            </b>
          </>
        )}
      </span>
    </span>
  );
}

function TechnicianRow({ row, onOpen }: { row: TechnicianWorkload; onOpen: () => void }) {
  const color = technicianColor({ display_name: row.name, color: row.color });
  const declared = Number(row.declared_hours);
  const available = Number(row.available_hours);
  const clocked = Number(row.clocked_hours ?? 0);
  const badged = Number(row.badged_hours ?? 0);
  const ratio = loadRatio(declared, available);
  const gauge = loadColor(ratio);
  // Pas d'heures disponibles : absent, sauf s'il a quand même saisi du temps ou badgé
  const absent = row.absence !== null && declared === 0 && clocked === 0 && badged === 0;
  const offHours = row.absence !== null && !absent;
  return (
    <li aria-label={row.name} className={cn(absent && 'opacity-60')}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Détail des heures de ${row.name}`}
        className="col h-full w-full gap-2 rounded-[10px] border p-3 text-left transition-colors hover:bg-muted/60"
      >
        <span className="who min-w-0">
          <span className="av sm" style={{ '--c': absent ? '#9ca3af' : color } as CSSProperties}>
            {initials(row.name)}
          </span>
          <b className="truncate">{row.name}</b>
        </span>
        <span className="muted text-[12.5px]">
          {absent
            ? ABSENCE[row.absence ?? 'rest']
            : `${row.worked_orders} OR travaillé${row.worked_orders > 1 ? 's' : ''} · planifié ${hours(
                Number(row.planned_hours),
              )} (${row.planned_orders} OR)`}
        </span>
        {absent ? null : offHours ? (
          <>
            <span className="text-[13px] text-muted-foreground">
              <b className="num text-[15px] text-foreground">{hours(declared)}</b> hors heures d’ouverture
            </span>
            <Gauge ratio={1} neutral label={`Charge de ${row.name}`} />
          </>
        ) : (
          <>
            <span className="text-[13px] text-muted-foreground">
              <b
                className={cn('num text-[15px]', gauge === 'gold' && 'gold-text')}
                style={gauge === 'gold' ? undefined : { color: gauge }}
              >
                {gauge === 'gold' && <Sparkle className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />}
                {hours(declared)}
              </b>{' '}
              / {hours(available)} · {percent(ratio)}
            </span>
            <Gauge ratio={ratio} label={`Charge de ${row.name}`} />
          </>
        )}
        {!absent && <Presence badged={badged} clocked={clocked} declared={declared} />}
      </button>
    </li>
  );
}

/**
 * Charge de travail atelier (bloc pleine largeur) : heures déclarées par les mécaniciens comparées
 * aux heures disponibles (horaires, repos, congés), par jour, semaine ou mois, avec le planifié.
 * En dessous, la présence badgée à la borne et l'écart : heures de présence non affectées à un OR.
 * Un clic sur un technicien montre d'où viennent ses heures.
 */
export function WorkloadCard() {
  const today = todayIso();
  const [period, setPeriod] = useState<WorkloadPeriod>('week');
  const [anchor, setAnchor] = useState(today);
  const [opened, setOpened] = useState<TechnicianWorkload | null>(null);
  const range = periodRange(period, anchor);
  const current = periodRange(period, today).from === range.from;
  const workload = useQuery({
    queryKey: ['workshop-workload', range.from, range.to],
    queryFn: () => fetchWorkshopWorkload(range.from, range.to),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const data = workload.data;
  const technicians = data?.technicians ?? [];
  const totals = technicians.reduce(
    (sum, row) => ({
      declared: sum.declared + Number(row.declared_hours),
      available: sum.available + Number(row.available_hours),
      planned: sum.planned + Number(row.planned_hours),
      clocked: sum.clocked + Number(row.clocked_hours ?? 0),
    }),
    { declared: 0, available: 0, planned: 0, clocked: 0 },
  );
  const totalRatio = loadRatio(totals.declared, totals.available);
  const totalColor = loadColor(totalRatio);

  return (
    <section data-slot="card" className="card flat" aria-labelledby="dashboard-workload">
      <div className="card-h flex-wrap">
        <h2 className="h2" id="dashboard-workload">
          Charge de travail atelier
        </h2>
        <div className="row gap-0.5 rounded-[10px] bg-muted p-[3px]" role="tablist" aria-label="Période">
          {PERIODS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={period === value}
              onClick={() => {
                setPeriod(value);
                setAnchor(today);
              }}
              className={cn(
                'rounded-lg px-3 py-1 text-[13px] font-medium text-muted-foreground',
                period === value && 'bg-card font-semibold text-foreground shadow-sm',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="card-b col gap-[18px] pt-4">
        <div className="row gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            aria-label="Période précédente"
            onClick={() => setAnchor(shiftPeriod(period, anchor, -1))}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            aria-label="Période suivante"
            onClick={() => setAnchor(shiftPeriod(period, anchor, 1))}
          >
            <ChevronRight />
          </Button>
          <b className="flex-1 text-[14px]" aria-live="polite">
            {periodLabel(period, range)}
          </b>
          {!current && (
            <Button variant="secondary" size="sm" className="h-7" onClick={() => setAnchor(today)}>
              {CURRENT_LABEL[period]}
            </Button>
          )}
        </div>

        {workload.isPending ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : workload.isError ? (
          <p className="text-sm text-destructive">Impossible de calculer la charge de travail.</p>
        ) : technicians.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ajoute des techniciens pour voir la charge de travail.
          </p>
        ) : (
          <>
            <div className="col gap-2">
              <p className="text-[13.5px]">
                <b>Atelier</b>{' '}
                <b
                  className={cn('num', totalColor === 'gold' && 'gold-text')}
                  style={totalColor === 'gold' ? undefined : { color: totalColor }}
                >
                  {hours(totals.declared)}
                </b>{' '}
                <span className="text-muted-foreground">
                  déclarées sur {hours(totals.available)} disponibles · {percent(totalRatio)} ·{' '}
                  {hours(totals.planned)} planifiées
                </span>
              </p>
              <Gauge ratio={totalRatio} label="Charge de l’atelier" />
            </div>

            {/* Réception : présence badgée de l'atelier et heures non affectées */}
            <div
              className="row flex-wrap gap-x-4 gap-y-1 rounded-[10px] bg-muted/60 px-3.5 py-2.5 text-[13.5px]"
              aria-label="Présence badgée de l’atelier"
              role="group"
            >
              <span>
                Présence badgée <b className="num">{hours(totals.clocked)}</b>
              </span>
              <span>
                Déclaré sur les OR <b className="num">{hours(totals.declared)}</b>
              </span>
              <span className={cn(unassignedHours(totals.clocked, totals.declared) > 0 && 'text-warning')}>
                Écart <b className="num">{hours(unassignedHours(totals.clocked, totals.declared))}</b> non
                affectées
              </span>
            </div>

            <ul
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
              aria-label="Charge par technicien"
            >
              {technicians.map((row) => (
                <TechnicianRow key={row.technician_id} row={row} onOpen={() => setOpened(row)} />
              ))}
            </ul>

            <div className="col gap-3 border-t pt-[18px]">
              <p className="text-[13.5px]">
                À planifier ou en retard : <b>{data?.to_plan.orders ?? 0} OR</b>{' '}
                <span className="text-muted-foreground">
                  (≈ {hours(Number(data?.to_plan.hours ?? 0))} estimées)
                </span>
              </p>
              <p className="hint">
                Déclaré : temps saisi par les mécaniciens dans les travaux effectués, compté le jour de la
                saisie. Disponible : heures d’ouverture, hors repos et congés. Badgé : chrono des OR ;
                présence : pointage à la borne, l’écart montre les heures de présence sans temps déclaré sur
                un OR.
              </p>
            </div>
          </>
        )}
        <Button variant="outline" size="sm" asChild className="self-start">
          <Link to="/planning">
            <CalendarDays /> Ouvrir le planning
          </Link>
        </Button>
      </div>
      {opened && (
        <WorkloadDetailDialog
          technician={opened}
          range={range}
          periodText={periodLabel(period, range)}
          onClose={() => setOpened(null)}
        />
      )}
    </section>
  );
}
