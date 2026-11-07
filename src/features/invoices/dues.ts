// Sommes dues par les clients, à l'instant de l'export : factures émises d'une période (date de
// facture) qui restent à régler, pour les types de compte choisis (comptant, prélèvement le 5…).
// Un bloc par client, avec les colonnes de l'extrait de compte, puis le total de chaque client et
// le total général.
import { ACCOUNT_CHOICES, accountChoice, type AccountChoice } from '@/lib/account-type';
import type { InvoiceOverview } from './api';
import {
  clientNumber,
  statementRows,
  statementTotals,
  type StatementRow,
  type StatementTotals,
  type StatementVehicle,
} from './statement';
import type { StatementClient } from './statement-api';

export interface DuesClient extends StatementClient {
  account_type: string;
  direct_debit_day: number | null;
}

export interface DuesFilters {
  /** Date de facture du… au… (AAAA-MM-JJ). */
  from: string;
  to: string;
  /** Types de compte retenus ; vide : tous. */
  accounts: AccountChoice[];
}

export interface DuesGroup {
  client: DuesClient;
  clientNumber: string | null;
  account: string;
  rows: StatementRow[];
  totals: StatementTotals;
}

/** Période par défaut : le mois précédent (le 7 novembre → du 1er au 31 octobre). */
export function previousMonth(today: string): { from: string; to: string } {
  const [year = 0, month = 1] = today.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 2, 1));
  const last = new Date(Date.UTC(year, month - 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

export const accountLabel = (client: Pick<DuesClient, 'account_type' | 'direct_debit_day'>) =>
  ACCOUNT_CHOICES[accountChoice(client)];

/** Un bloc par client (par nom), ses factures restant dues par date, reste dû calculé maintenant. */
export function duesByClient(
  invoices: InvoiceOverview[],
  clients: DuesClient[],
  vehicles: Record<string, StatementVehicle>,
  filters: DuesFilters,
  today?: string,
): DuesGroup[] {
  const statementFilters = {
    from: filters.from,
    to: filters.to,
    settlements: ['unpaid' as const, 'partial' as const],
    credits: false,
  };
  return clients
    .filter((client) => !filters.accounts.length || filters.accounts.includes(accountChoice(client)))
    .map((client) => {
      const rows = statementRows(
        invoices.filter((invoice) => invoice.client_id === client.id),
        [],
        vehicles,
        statementFilters,
        today,
      );
      return {
        client,
        clientNumber: clientNumber(client.legacy_key),
        account: accountLabel(client),
        rows,
        totals: statementTotals(rows),
      };
    })
    .filter((group) => group.rows.length > 0)
    .sort((a, b) => a.client.name.localeCompare(b.client.name, 'fr'));
}

export function duesTotals(groups: DuesGroup[]): StatementTotals {
  return statementTotals(groups.flatMap((group) => group.rows));
}
