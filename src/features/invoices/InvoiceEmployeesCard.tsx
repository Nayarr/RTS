import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { recordedLabel } from './domain';
import {
  fetchEmployees,
  fetchLineEmployeeChanges,
  fetchLineEmployees,
  setLineEmployee,
  type Employee,
} from './employees-api';
import type { InvoiceLine } from './api';

/**
 * Salarié de chaque ligne (direction seulement) : prérempli depuis l'OR, modifiable même sur une
 * facture émise, jamais imprimé ni montré au client. Chaque changement est gardé.
 */
export function InvoiceEmployeesCard({ invoiceId, lines }: { invoiceId: string; lines: InvoiceLine[] }) {
  const queryClient = useQueryClient();
  const shown = lines.filter((line) => line.line_type !== 'text');
  const lineIds = shown.map((line) => line.id);
  const employees = useQuery({ queryKey: ['employees'], queryFn: fetchEmployees, staleTime: 5 * 60_000 });
  const assigned = useQuery({
    queryKey: ['invoices', invoiceId, 'employees', lineIds.join()],
    queryFn: () => fetchLineEmployees(lineIds),
  });
  const changes = useQuery({
    queryKey: ['invoices', invoiceId, 'employee-changes'],
    queryFn: () => fetchLineEmployeeChanges(invoiceId),
  });
  const save = useMutation({
    mutationFn: ({ lineId, employee }: { lineId: string; employee: Employee | null }) =>
      setLineEmployee(lineId, employee),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId, 'employees'] }),
        queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId, 'employee-changes'] }),
      ]),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Salarié non enregistré'),
  });

  if (shown.length === 0) return null;
  const options = employees.data ?? [];

  return (
    <section data-slot="card" className="card" aria-labelledby="invoice-employees">
      <div className="card-h">
        <h2 className="h2 row gap-2" id="invoice-employees">
          <UserRound className="i s" /> Salariés des lignes
        </h2>
        <span className="hint">Interne : n’apparaît ni sur la facture du client, ni sur le PDF</span>
      </div>
      <ul>
        {shown.map((line) => {
          const id = `employee-${line.id}`;
          const title = line.description.split('\n')[0] || 'Ligne';
          return (
            <li key={line.id} className="row between gap-3 border-t px-6 py-2.5">
              <label htmlFor={id} className="min-w-0 grow truncate text-[13.5px]">
                {title}
              </label>
              <select
                id={id}
                aria-label={`Salarié : ${title}`}
                className="inp w-[220px] shrink-0"
                disabled={!assigned.isSuccess || save.isPending}
                value={assigned.data?.[line.id] ?? ''}
                onChange={(event) =>
                  save.mutate({
                    lineId: line.id,
                    employee: options.find((employee) => employee.key === event.target.value) ?? null,
                  })
                }
              >
                <option value="">Aucun</option>
                {options.map((employee) => (
                  <option key={employee.key} value={employee.key}>
                    {employee.label}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
      {(changes.data?.length ?? 0) > 0 && (
        <ul aria-label="Historique des salariés" className="hint col gap-1 border-t px-6 py-3">
          {changes.data?.map((change) => (
            <li key={change.id}>
              {change.line_description} : {change.old_name ?? 'aucun'} → {change.new_name ?? 'aucun'} ·{' '}
              {recordedLabel(change.changed_at, change.changer?.full_name)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
