import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, FileArchive, FileStack, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/app/PageHeader';
import { ToggleChips } from '@/components/ListControls';
import { PdfPreviewDialog, type PdfFile } from '@/components/PdfPreviewDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loadPdfContext } from '@/features/documents/pdf-context';
import { formatDate } from '@/features/repair-orders/constants';
import { downloadFile } from '@/lib/csv';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import { invoicesKey } from './hooks';
import {
  clientNumber,
  SETTLEMENTS,
  sortStatement,
  STATEMENT_COLUMNS,
  statementInvoices,
  statementPeriod,
  statementRows,
  statementTotals,
  type Settlement,
  type StatementColumn,
  type StatementFilters,
} from './statement';
import { fetchClientStatement, type ClientStatement } from './statement-api';

/** Extrait de compte du client : factures de la période, états choisis, PDF et lot de factures. */
export function StatementPage() {
  const { id = '' } = useParams();
  const statement = useQuery({
    queryKey: [...invoicesKey, 'statement', id],
    queryFn: () => fetchClientStatement(id),
  });
  if (statement.isPending) return <p className="text-muted-foreground">Chargement…</p>;
  if (statement.isError)
    return <p className="text-destructive">Impossible de charger l’extrait de compte.</p>;
  if (!statement.data) return <p className="text-muted-foreground">Client introuvable.</p>;
  return <StatementView statement={statement.data} />;
}

const CREDITS = 'credits';
type Shown = Settlement | typeof CREDITS;

const errorMessage = (error: unknown) =>
  error instanceof Error && error.message ? error.message : 'Opération impossible';

function StatementView({ statement }: { statement: ClientStatement }) {
  const { client, invoices, creditNotes, vehicles } = statement;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [shown, setShown] = useState<Shown[]>(['unpaid', 'partial', 'paid', CREDITS]);
  const [sort, setSort] = useState<{ column: StatementColumn; direction: 'asc' | 'desc' }>({
    column: 'date',
    direction: 'asc',
  });
  const [preview, setPreview] = useState<PdfFile | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const filters: StatementFilters = useMemo(
    () => ({
      from,
      to,
      settlements: shown.filter((value): value is Settlement => value !== CREDITS),
      credits: shown.includes(CREDITS),
    }),
    [from, to, shown],
  );
  const rows = useMemo(
    () => sortStatement(statementRows(invoices, creditNotes, vehicles, filters), sort.column, sort.direction),
    [invoices, creditNotes, vehicles, filters, sort],
  );
  const totals = statementTotals(rows);
  const period = statementPeriod(rows, filters);
  // Factures du lot dans l'ordre du tableau
  const bundled = useMemo(() => {
    const order = new Map(rows.map((row, index) => [row.invoiceId, index]));
    return statementInvoices(invoices, filters).sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );
  }, [rows, invoices, filters]);

  const counts = useMemo(() => {
    const inPeriod = statementInvoices(invoices, { ...filters, settlements: ['unpaid', 'partial', 'paid'] });
    const ids = new Set(inPeriod.map((invoice) => invoice.id));
    return {
      ...Object.fromEntries(
        SETTLEMENTS.map(({ value }) => [
          value,
          statementInvoices(invoices, { ...filters, settlements: [value] }).length,
        ]),
      ),
      [CREDITS]: creditNotes.filter((note) => ids.has(note.invoice_id)).length,
    } as Record<Shown, number>;
  }, [invoices, creditNotes, filters]);

  const statementPdf = async () => {
    const [{ settings, logo }, { buildStatementPdf }] = await Promise.all([
      loadPdfContext(),
      import('./statement-pdf'),
    ]);
    return buildStatementPdf({
      client,
      clientNumber: clientNumber(client.legacy_key),
      rows,
      period,
      company: settings.company,
      logo,
    });
  };

  const showStatement = useMutation({
    mutationFn: async () => {
      const { doc, fileName } = await statementPdf();
      setPreview({ blob: doc.output('blob'), fileName });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const bundle = useMutation({
    mutationFn: async (format: 'pdf' | 'zip') => {
      const { buildInvoiceFiles, mergePdfs, zipFiles } = await import('./invoice-bundle');
      setProgress(`Préparation des factures : 0 sur ${bundled.length}`);
      const [extract, files] = await Promise.all([
        statementPdf(),
        buildInvoiceFiles(bundled, (done, total) =>
          setProgress(`Préparation des factures : ${done} sur ${total}`),
        ),
      ]);
      const extractFile = {
        fileName: extract.fileName,
        bytes: new Uint8Array(extract.doc.output('arraybuffer')),
      };
      const base = extract.fileName.replace(/^Extrait_/, 'Factures_').replace(/\.pdf$/, '');
      if (format === 'pdf') {
        downloadFile(await mergePdfs([extractFile, ...files].map((file) => file.bytes)), `${base}.pdf`);
      } else {
        downloadFile(await zipFiles([extractFile, ...files]), `${base}.zip`);
      }
    },
    onSuccess: () =>
      toast.success(
        `${bundled.length} facture${bundled.length > 1 ? 's' : ''} prête${bundled.length > 1 ? 's' : ''}`,
      ),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => setProgress(null),
  });

  const toggleSort = (column: StatementColumn) =>
    setSort((current) => ({
      column,
      direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  const busy = showStatement.isPending || bundle.isPending;

  return (
    <>
      <PageHeader
        back={{ to: `/clients/${client.id}`, label: 'Retour au client' }}
        crumbs={[
          { label: 'Clients', to: '/clients' },
          { label: client.name, to: `/clients/${client.id}` },
          { label: 'Extrait de compte' },
        ]}
        title={`Extrait de compte · ${client.name}`}
        actions={
          <>
            <Button
              variant="outline"
              disabled={busy || rows.length === 0}
              onClick={() => showStatement.mutate()}
            >
              <FileText /> PDF de l’extrait
            </Button>
            <Button
              variant="outline"
              disabled={busy || bundled.length === 0}
              onClick={() => bundle.mutate('pdf')}
            >
              <FileStack /> Factures en un PDF
            </Button>
            <Button
              variant="outline"
              disabled={busy || bundled.length === 0}
              onClick={() => bundle.mutate('zip')}
            >
              <FileArchive /> Factures en ZIP
            </Button>
          </>
        }
      />

      <div className="col gap-3.5">
        <div className="toolbar flex-wrap">
          <div className="row wrap gap-2.5">
            <label htmlFor="statement-from" className="muted text-[13px]">
              Du
            </label>
            <Input
              id="statement-from"
              type="date"
              className="w-[150px]"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
            <label htmlFor="statement-to" className="muted text-[13px]">
              au
            </label>
            <Input
              id="statement-to"
              type="date"
              className="w-[150px]"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <ToggleChips
            label="Factures affichées"
            values={shown}
            onChange={setShown}
            options={[
              ...SETTLEMENTS.map((option) => ({ ...option, count: counts[option.value] })),
              { value: CREDITS, label: 'Avoirs', count: counts[CREDITS] },
            ]}
          />
        </div>
        <div className="row between wrap gap-2 text-[13.5px]">
          <span className="muted">
            Relevé du {formatDate(period.from)} au {formatDate(period.to)} : {bundled.length} facture
            {bundled.length > 1 ? 's' : ''}
          </span>
          {progress && <span role="status">{progress}</span>}
          {!progress && totals.due > 0 && (
            <span>
              Reste dû : <b className="num">{formatEuro(totals.due)}</b> TTC
            </span>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="empty">Aucune facture pour cette période et ces états.</p>
        ) : (
          <div className="card tbl-wrap overflow-x-auto!">
            <table className="tbl">
              <caption className="sr-only">Extrait de compte de {client.name}</caption>
              <thead>
                <tr>
                  {STATEMENT_COLUMNS.map((column) => {
                    const active = sort.column === column.key;
                    return (
                      <th
                        key={column.key}
                        className={cn(column.amount && 'r')}
                        aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        <button
                          type="button"
                          className="inline-flex items-center gap-1"
                          onClick={() => toggleSort(column.key)}
                        >
                          {column.label}
                          {active &&
                            (sort.direction === 'asc' ? (
                              <ArrowUp className="i xs" aria-hidden />
                            ) : (
                              <ArrowDown className="i xs" aria-hidden />
                            ))}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className={cn(row.kind === 'credit' && 'muted')}>
                    <td className="num">{formatDate(row.date)}</td>
                    <td>
                      <Link className="ul b" to={`/factures/${row.invoiceId}`}>
                        {row.number}
                      </Link>
                    </td>
                    <td>{row.plate && <span className="plate">{row.plate}</span>}</td>
                    <td>{row.brand}</td>
                    <td>{row.model}</td>
                    <td className="r num">{formatEuro(row.ht)}</td>
                    <td className="r num">{formatEuro(row.vat)}</td>
                    <td className="r num">{formatEuro(row.ttc)}</td>
                    <td className="r num">{row.paid === null ? '' : formatEuro(row.paid)}</td>
                    <td className={cn('r num', (row.due ?? 0) > 0.01 && 'b')}>
                      {row.due === null ? '' : formatEuro(row.due)}
                    </td>
                    <td>{row.state}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="b">
                  <td colSpan={5} className="r">
                    TOTAL
                  </td>
                  <td className="r num">{formatEuro(totals.ht)}</td>
                  <td className="r num">{formatEuro(totals.vat)}</td>
                  <td className="r num">{formatEuro(totals.ttc)}</td>
                  <td className="r num">{formatEuro(totals.paid)}</td>
                  <td className="r num">{formatEuro(totals.due)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="hint">
          L’extrait reprend les factures émises du client, par date de facture. « Factures en un PDF » met
          l’extrait puis chaque facture du tableau à la suite ; « Factures en ZIP » donne un PDF par facture,
          avec l’extrait.
        </p>
      </div>
      <PdfPreviewDialog file={preview} onClose={() => setPreview(null)} />
    </>
  );
}
