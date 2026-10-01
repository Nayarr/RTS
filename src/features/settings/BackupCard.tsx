import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { backupAge, backupIsDue, backupRowCount, downloadBackup } from './backup';
import { settingsQueryKey } from './hooks';

/** Sauvegarde de toute la base dans un fichier, à faire au moins une fois par semaine. */
export function BackupCard({ lastBackupAt }: { lastBackupAt: string | null }) {
  const queryClient = useQueryClient();
  const backup = useMutation({
    mutationFn: () => downloadBackup(),
    onSuccess: async (file) => {
      toast.success(`Sauvegarde téléchargée (${backupRowCount(file).toLocaleString('fr-FR')} lignes)`);
      await queryClient.invalidateQueries({ queryKey: settingsQueryKey });
    },
    onError: () => toast.error('Sauvegarde impossible : réessaie dans un instant'),
  });
  const due = backupIsDue(lastBackupAt);

  return (
    <section data-slot="card" className="card" aria-labelledby="backup-title">
      <div className="sec-h">
        <h2 className="h2" id="backup-title">
          Sauvegarde
        </h2>
        <span className="hint">
          Un fichier contenant toutes les données de l’atelier (clients, OR, devis, factures, pointages…), à
          garder en lieu sûr, par exemple sur une clé USB ou un disque externe. À faire au moins une fois par
          semaine.
        </span>
      </div>
      <div className="form flex-row! flex-wrap items-center justify-between">
        <div className="col gap-0.5">
          <b className={cn('row gap-2', due && 'text-destructive')}>
            {due && <TriangleAlert className="i s" />}
            {backupAge(lastBackupAt)}
          </b>
          <span className="hint">
            Les photos et PDF restent dans le stockage des fichiers ; les codes PIN et le code de sortie de la
            borne ne sont jamais inclus.
          </span>
        </div>
        <Button disabled={backup.isPending} onClick={() => backup.mutate()}>
          <Download /> {backup.isPending ? 'Sauvegarde en cours…' : 'Télécharger la sauvegarde'}
        </Button>
      </div>
    </section>
  );
}
