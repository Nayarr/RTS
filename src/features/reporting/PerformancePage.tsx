import { useQuery } from '@tanstack/react-query';
import { todayIso } from '@/features/repair-orders/schemas';
import { cn } from '@/lib/utils';
import { periodRange, scoreTechnicians, scoreTone, type Period, type TechnicianScore } from './analysis';
import { fetchTechnicianPerformance } from './api';
import { formatEuroRounded } from './domain';
import { PeriodFilter } from './PeriodFilter';
import { ReportingHeader } from './ReportingTabs';
import { usePeriod } from './use-period';

const PERIODS: Period[] = ['semaine', 'mois', 'tout'];
const TONE_CLASS = {
  good: 'text-success',
  warning: 'text-warning',
  bad: 'text-destructive',
  neutral: 'text-muted-foreground',
} as const;

const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value)} %`);

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <span>
      {label} : <strong className="text-foreground">{value}</strong>
    </span>
  );
}

function TechnicianCard({ tech }: { tech: TechnicianScore }) {
  return (
    <article aria-label={tech.name} className="space-y-2 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <strong className="inline-flex items-center gap-2 text-lg">
          <span
            className="size-3 rounded-full"
            style={{ backgroundColor: tech.color ?? 'var(--muted-foreground)' }}
          />
          {tech.name}
        </strong>
        <span className={cn('text-2xl font-extrabold tabular-nums', TONE_CLASS[scoreTone(tech.score)])}>
          {tech.score === null ? '—' : Math.round(tech.score)}
          <span className="text-sm font-normal text-muted-foreground">/100</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <Figure label="CA MO" value={formatEuroRounded(tech.labor_ht)} />
        <Figure label="OR facturés" value={String(tech.ro_count)} />
        <Figure label="Rendement" value={percent(tech.efficiency)} />
        <Figure label="Occupation" value={percent(tech.occupancy)} />
        <Figure
          label="Précision estim."
          value={
            tech.estimate_deviation_percent === null
              ? '—'
              : `±${Math.round(tech.estimate_deviation_percent)} %`
          }
        />
        <Figure
          label="Délai moyen"
          value={
            tech.average_lead_days === null
              ? '—'
              : `${tech.average_lead_days.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} j`
          }
        />
      </div>
    </article>
  );
}

/** Performance des techniciens : note sur 100 et indicateurs détaillés. */
export function PerformancePage() {
  const [period, setPeriod] = usePeriod(PERIODS, 'mois');
  const range = periodRange(period, todayIso());
  const performance = useQuery({
    queryKey: ['reporting', 'performance', range],
    queryFn: () => fetchTechnicianPerformance(range),
  });
  const technicians = scoreTechnicians(performance.data ?? []);

  return (
    <div className="space-y-5">
      <ReportingHeader />
      <PeriodFilter periods={PERIODS} value={period} onChange={setPeriod} />
      <p className="text-sm text-muted-foreground">
        Rendement = heures facturées ÷ heures badgées. Occupation = heures badgées ÷ heures de présence
        (pointage). Précision = écart moyen entre l’estimation et le temps badgé. Délai = de l’ouverture de
        l’OR à sa facture. Note : rendement 35 %, occupation 25 %, CA 25 %, précision 15 %.
      </p>

      {performance.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {performance.isError && <p className="text-destructive">Impossible de charger la performance.</p>}
      {performance.isSuccess && technicians.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Aucun technicien actif.
        </p>
      )}

      <ul className="space-y-3">
        {technicians.map((tech) => (
          <li key={tech.technician_id}>
            <TechnicianCard tech={tech} />
          </li>
        ))}
      </ul>
    </div>
  );
}
