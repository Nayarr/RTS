import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl font-bold">Sauvegarde</h2>
        </CardTitle>
        <CardDescription>
          Télécharge toute la base (clients, véhicules, OR, devis, factures, pointages…) dans un fichier à
          garder en lieu sûr, par exemple sur une clé USB ou un disque externe. À faire au moins une fois par
          semaine.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p
          className={due ? 'flex items-center gap-2 font-semibold text-destructive' : 'text-muted-foreground'}
        >
          {due && <TriangleAlert className="size-4" />}
          {backupAge(lastBackupAt)}
        </p>
        <Button disabled={backup.isPending} onClick={() => backup.mutate()}>
          <Download /> {backup.isPending ? 'Sauvegarde en cours…' : 'Télécharger la sauvegarde'}
        </Button>
        <p className="text-sm text-muted-foreground">
          Les photos et PDF restent dans le stockage des fichiers ; les codes PIN et le code de sortie de la
          borne ne sont jamais inclus.
        </p>
      </CardContent>
    </Card>
  );
}
