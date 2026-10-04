import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { initials } from '@/app/nav';
import { todayIso } from '@/features/repair-orders/schemas';
import { cn } from '@/lib/utils';
import { periodRange, scoreTechnicians, scoreTone, type Period, type TechnicianScore } from './analysis';
import { fetchTechnicianPerformance } from './api';
import { formatEuroRounded } from './domain';
import { PeriodFilter } from './PeriodFilter';
import { ReportingHeader } from './ReportingTabs';
import { usePeriod } from './use-period';

const PERIODS: Period[] = ['semaine', 'mois', 'tout'];
const TONE_BADGE = { good: 's-ok', warning: 's-warn', bad: 's-bad', neutral: 's-grey' } as const;

const percent = (value: number | null) => (value === null ? '-' : `${Math.round(value)} %`);

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="col gap-0.5 rounded-[7px] border bg-head px-3.5 py-3">
      <span className="hint">{label}</span>
      <b className="num font-display text-[22px] leading-[1.1]">{value}</b>
    </div>
  );
}

function TechnicianCard({ tech }: { tech: TechnicianScore }) {
  const tone = scoreTone(tech.score);
  return (
    <article aria-label={tech.name} className="card">
      <div className="card-h">
        <span className="who">
          <span className="av" style={{ '--c': tech.color ?? '#6B7280' } as CSSProperties}>
            {initials(tech.name)}
          </span>
          <b className="text-base">{tech.name}</b>
        </span>
        <span className={cn('badge lg', TONE_BADGE[tone])}>
          {tech.score === null ? '-' : Math.round(tech.score)}
          <span className="font-normal opacity-80">/100</span>
        </span>
      </div>
      <div className="card-b grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Figure label="CA MO" value={formatEuroRounded(tech.labor_ht)} />
        <Figure label="OR facturés" value={String(tech.ro_count)} />
        <Figure label="Rendement" value={percent(tech.efficiency)} />
        <Figure label="Occupation" value={percent(tech.occupancy)} />
        <Figure
          label="Précision estim."
          value={
            tech.estimate_deviation_percent === null
              ? '-'
              : `±${Math.round(tech.estimate_deviation_percent)} %`
          }
        />
        <Figure
          label="Délai moyen"
          value={
            tech.average_lead_days === null
              ? '-'
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
    <>
      <ReportingHeader />
      <PeriodFilter periods={PERIODS} value={period} onChange={setPeriod} />

      {performance.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {performance.isError && <p className="text-destructive">Impossible de charger la performance.</p>}
      {performance.isSuccess && technicians.length === 0 && <p className="empty">Aucun technicien actif.</p>}

      <ul className="grid gap-4 lg:grid-cols-2">
        {technicians.map((tech) => (
          <li key={tech.technician_id}>
            <TechnicianCard tech={tech} />
          </li>
        ))}
      </ul>
      <p className="hint">
        Rendement = heures facturées ÷ heures badgées. Occupation = heures badgées ÷ heures de présence
        (pointage). Précision = écart moyen entre l’estimation et le temps badgé. Délai = de l’ouverture de
        l’OR à sa facture. Note : rendement 35 %, occupation 25 %, CA 25 %, précision 15 %.
      </p>
    </>
  );
}
