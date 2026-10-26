import { Copy, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { downloadFile, toCsv } from '@/lib/csv';
import type { AgentTable as Table } from './api';
import { tableFileName, tableText } from './agent-table';

/** Liste montrée par l'agent : à lire, copier dans un tableur ou télécharger en CSV. */
export function AgentTable({ table }: { table: Table }) {
  const copy = () =>
    navigator.clipboard
      .writeText(tableText(table))
      .then(() => toast.success('Tableau copié : colle-le dans un tableur ou un mail'))
      .catch(() => toast.error('Copie impossible : télécharge plutôt le fichier'));

  return (
    <section className="card col gap-2.5 px-4 py-3.5" aria-label={table.titre}>
      <div className="row flex-wrap items-center gap-2">
        <b className="grow text-sm">
          {table.titre} <span className="hint">({table.lignes.length})</span>
        </b>
        <Button size="sm" variant="outline" onClick={() => void copy()}>
          <Copy /> Copier
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => downloadFile(toCsv(table.colonnes, table.lignes), tableFileName(table.titre))}
        >
          <Download /> CSV
        </Button>
      </div>
      <div className="tbl-wrap max-h-[360px] overflow-auto">
        <table className="tbl dense">
          <thead>
            <tr>
              {table.colonnes.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.lignes.map((row, index) => (
              <tr key={index}>
                {row.map((cell, column) => (
                  <td key={column}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
