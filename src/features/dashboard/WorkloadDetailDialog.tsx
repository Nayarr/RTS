import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDate } from '@/features/repair-orders/constants';
import {
  fetchWorkloadDetail,
  hours,
  unassignedHours,
  type TechnicianWorkload,
  type WorkloadDetail,
} from './workload';

type DeclaredLine = WorkloadDetail['declared'][number];

/** Travaux déclarés regroupés par OR, dans l'ordre de saisie. */
function byOrder(lines: DeclaredLine[]) {
  const groups = new Map<string, { number: string; plate: string | null; lines: DeclaredLine[] }>();
  for (const line of lines) {
    const group = groups.get(line.repair_order_id) ?? { number: line.number, plate: line.plate, lines: [] };
    group.lines.push(line);
    groups.set(line.repair_order_id, group);
  }
  return [...groups.entries()];
}

/** D'où viennent les heures d'un technicien : temps déclaré par OR, OR planifiés, présence badgée. */
export function WorkloadDetailDialog({
  technician,
  range,
  periodText,
  onClose,
}: {
  technician: TechnicianWorkload;
  range: { from: string; to: string };
  periodText: string;
  onClose: () => void;
}) {
  const detail = useQuery({
    queryKey: ['workshop-workload', 'detail', technician.technician_id, range.from, range.to],
    queryFn: () => fetchWorkloadDetail(technician.technician_id, range.from, range.to),
  });
  const declared = Number(technician.declared_hours);
  const clocked = Number(technician.clocked_hours ?? 0);
  const gap = unassignedHours(clocked, declared);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Heures de {technician.name}</DialogTitle>
          <DialogDescription>{periodText}</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-3 gap-2 text-center">
          {(
            [
              ['Déclaré', hours(declared)],
              ['Badgé', hours(clocked)],
              ['Non affectées', hours(gap)],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-[9px] border px-2 py-2">
              <dt className="hint">{label}</dt>
              <dd
                className={
                  label === 'Non affectées' && gap > 0
                    ? 'num font-semibold text-warning'
                    : 'num font-semibold'
                }
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {detail.isPending && <p className="text-sm text-muted-foreground">Chargement…</p>}
        {detail.isError && <p className="text-sm text-destructive">Détail indisponible.</p>}
        {detail.data && (
          <div className="col gap-4">
            <section className="col gap-2" aria-labelledby="workload-detail-declared">
              <h3 className="overline" id="workload-detail-declared">
                Temps déclaré sur les OR
              </h3>
              {detail.data.declared.length === 0 ? (
                <p className="hint">Aucun temps déclaré sur la période.</p>
              ) : (
                <ul className="col gap-2.5">
                  {byOrder(detail.data.declared).map(([id, group]) => (
                    <li key={id} className="col gap-1">
                      <Link to={`/or/${id}`} className="link text-[13.5px] font-semibold">
                        {group.number}
                        {group.plate && ` · ${group.plate}`}
                      </Link>
                      <ul className="col gap-0.5">
                        {group.lines.map((line, index) => (
                          <li key={index} className="row justify-between gap-3 text-[13px]">
                            <span className="min-w-0 truncate">
                              <span className="muted">{formatDate(line.day)} · </span>
                              {line.description || 'Travail'}
                            </span>
                            <b className="num shrink-0">{hours(Number(line.hours))}</b>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="col gap-2" aria-labelledby="workload-detail-planned">
              <h3 className="overline" id="workload-detail-planned">
                OR planifiés
              </h3>
              {detail.data.planned.length === 0 ? (
                <p className="hint">Aucun OR planifié sur la période.</p>
              ) : (
                <ul className="col gap-1">
                  {detail.data.planned.map((order) => (
                    <li key={order.repair_order_id} className="row justify-between gap-3 text-[13px]">
                      <Link to={`/or/${order.repair_order_id}`} className="link">
                        {order.number}
                        {order.plate && ` · ${order.plate}`}
                        <span className="muted"> · {formatDate(order.day)}</span>
                      </Link>
                      <b className="num shrink-0">{hours(Number(order.hours))}</b>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
