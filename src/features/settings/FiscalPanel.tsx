import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, FileDown, FileText, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/features/repair-orders/constants';
import { downloadFile } from '@/lib/csv';
import {
  ARCHIVE_NOTICE,
  archiveFileName,
  createFiscalArchive,
  fetchFiscalArchiveContent,
  fetchFiscalArchives,
  verifyFiscalJournal,
  type FiscalArchive,
} from './fiscal-api';

const archivesKey = ['fiscal-archives'] as const;

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Action impossible';

/** Exercice civil précédent : période proposée pour une archive à la demande. */
function lastYear() {
  const year = new Date().getFullYear() - 1;
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

const downloadNotice = () =>
  downloadFile(ARCHIVE_NOTICE, 'notice-archives-fiscales-rts.txt', 'text/plain;charset=utf-8');

/**
 * Réglages › Conformité fiscale : vérification du journal chaîné et archives figées exigées par la
 * loi anti-fraude à la TVA (art. 286, I, 3° bis du CGI).
 */
export function FiscalPanel() {
  const queryClient = useQueryClient();
  const archives = useQuery({ queryKey: archivesKey, queryFn: fetchFiscalArchives });
  const check = useMutation({
    mutationFn: verifyFiscalJournal,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const [period, setPeriod] = useState(lastYear);
  const create = useMutation({
    mutationFn: () => createFiscalArchive(period.from, period.to),
    onSuccess: async () => {
      toast.success('Archive créée');
      await queryClient.invalidateQueries({ queryKey: archivesKey });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const download = useMutation({
    mutationFn: async (archive: FiscalArchive) => {
      const content = await fetchFiscalArchiveContent(archive.id);
      // Texte tel quel, sans retouche : son SHA-256 doit rester l'empreinte affichée
      downloadFile(content, archiveFileName(archive), 'application/json;charset=utf-8');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const result = check.data;
  return (
    <>
      <section data-slot="card" className="card" aria-labelledby="fiscal-integrity">
        <div className="card-h">
          <h2 className="h2" id="fiscal-integrity">
            Intégrité des encaissements
          </h2>
        </div>
        <div className="card-b col gap-3">
          <p className="hint">
            Chaque facture émise, avoir, paiement et archive entre dans un journal fiscal chaîné : son contenu
            est figé avec une empreinte qui dépend de la précédente. La vérification recalcule toute la chaîne
            et compare chaque document à ce qui a été journalisé.
          </p>
          <div>
            <Button variant="outline" disabled={check.isPending} onClick={() => check.mutate()}>
              <ShieldCheck /> {check.isPending ? 'Vérification…' : 'Vérifier le journal'}
            </Button>
          </div>
          {result && (
            <div role="status" className="col gap-1">
              {result.ok ? (
                <p className="row gap-2">
                  <ShieldCheck className="i s up" />
                  <b>Journal intègre</b> · {result.ecritures} écriture{result.ecritures > 1 ? 's' : ''}{' '}
                  vérifiée
                  {result.ecritures > 1 ? 's' : ''}
                </p>
              ) : (
                <>
                  <p className="row gap-2">
                    <ShieldAlert className="i s down" />
                    <b>Anomalies détectées</b> · {result.erreurs.length} sur {result.ecritures} écritures
                  </p>
                  <ul aria-label="Anomalies du journal" className="hint">
                    {result.erreurs.map((error, index) => (
                      <li key={index}>
                        {error.seq !== null && `Écriture ${error.seq} · `}
                        {error.probleme}
                        {error.document && ` (${error.document})`}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="hint font-mono text-[11.5px] break-all">
                Dernière empreinte : {result.derniere_empreinte}
              </p>
            </div>
          )}
        </div>
      </section>

      <section data-slot="card" className="card" aria-labelledby="fiscal-archives">
        <div className="card-h">
          <h2 className="h2" id="fiscal-archives">
            Archives fiscales
          </h2>
          {archives.data && <span className="cnt">{archives.data.length}</span>}
        </div>
        <div className="card-b col gap-3">
          <p className="hint">
            Une archive est créée automatiquement le 1er de chaque mois pour le mois précédent. Elle est figée
            au format JSON, avec son empreinte SHA-256. Télécharge-la avec sa notice sur un support externe.
          </p>
          <div>
            <Button variant="outline" size="sm" onClick={downloadNotice}>
              <FileText /> Notice des archives
            </Button>
          </div>
        </div>
        {archives.isPending && <p className="card-b text-muted-foreground">Chargement…</p>}
        {archives.isError && <p className="card-b text-destructive">Impossible de charger les archives.</p>}
        {archives.data?.length === 0 && <p className="card-b hint">Aucune archive pour l’instant.</p>}
        {archives.data && archives.data.length > 0 && (
          <ul aria-label="Archives fiscales">
            {archives.data.map((archive) => (
              <li key={archive.id} className="row between gap-3 border-t px-6 py-2.5">
                <span className="c2 min-w-0">
                  <b>
                    Du {formatDate(archive.period_from)} au {formatDate(archive.period_to)}
                  </b>
                  <span>
                    {archive.entries_count} écriture{archive.entries_count > 1 ? 's' : ''} ·{' '}
                    {archive.automatic ? 'automatique' : 'à la demande'} · créée le{' '}
                    {formatDate(archive.created_at)}
                  </span>
                  <span className="font-mono text-[11px] break-all">SHA-256 {archive.sha256}</span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={download.isPending}
                  onClick={() => download.mutate(archive)}
                  aria-label={`Télécharger l’archive du ${formatDate(archive.period_from)} au ${formatDate(archive.period_to)}`}
                >
                  <FileDown /> JSON
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="card-b row flex-wrap items-end gap-3 border-t"
          aria-label="Archiver une période"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <div className="col gap-1">
            <Label htmlFor="fiscal-from">Du</Label>
            <Input
              id="fiscal-from"
              type="date"
              required
              value={period.from}
              onChange={(event) => setPeriod((current) => ({ ...current, from: event.target.value }))}
            />
          </div>
          <div className="col gap-1">
            <Label htmlFor="fiscal-to">Au</Label>
            <Input
              id="fiscal-to"
              type="date"
              required
              value={period.to}
              onChange={(event) => setPeriod((current) => ({ ...current, to: event.target.value }))}
            />
          </div>
          <Button type="submit" disabled={create.isPending}>
            <Archive /> Archiver la période
          </Button>
        </form>
      </section>
    </>
  );
}
