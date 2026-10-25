import { useState } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/features/repair-orders/constants';
import { setClientArchived, setVehicleArchived } from './api';
import { useCustomerMutation } from './hooks';

type Kind = 'client' | 'vehicle';

const archive = (kind: Kind, id: string, archived: boolean) =>
  kind === 'client' ? setClientArchived(id, archived) : setVehicleArchived(id, archived);

/** « Archiver » (direction) : la fiche sort des listes et de la recherche, son historique reste. */
export function ArchiveButton({ kind, id, name }: { kind: Kind; id: string; name: string }) {
  const [confirm, setConfirm] = useState(false);
  const mutation = useCustomerMutation(
    () => archive(kind, id, true),
    kind === 'client' ? 'Client archivé' : 'Véhicule archivé',
  );
  return (
    <>
      <Button variant="ghost" onClick={() => setConfirm(true)}>
        <Archive /> Archiver
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Archiver ${name} ?`}
        description={
          kind === 'client'
            ? 'Le client et ses véhicules sortent des listes et de la recherche ; OR, devis et factures restent. Il se restaure depuis sa fiche ou Réglages › Archives, et revient de lui-même au prochain OR.'
            : 'Le véhicule sort des listes et de la recherche ; son historique reste. Il se restaure depuis sa fiche ou Réglages › Archives, et revient de lui-même au prochain OR.'
        }
        confirmLabel="Archiver"
        pending={mutation.isPending}
        onConfirm={() => mutation.mutate(undefined, { onSuccess: () => setConfirm(false) })}
      />
    </>
  );
}

/** Bandeau d'une fiche archivée, avec « Restaurer » pour la direction. */
export function ArchivedBanner({
  kind,
  id,
  archivedAt,
  canRestore,
}: {
  kind: Kind;
  id: string;
  archivedAt: string;
  canRestore: boolean;
}) {
  const restore = useCustomerMutation(
    () => archive(kind, id, false),
    kind === 'client' ? 'Client restauré' : 'Véhicule restauré',
  );
  return (
    <div className="alert s-warn row between wrap gap-2" role="status">
      <span className="row gap-2">
        <Archive className="i" />
        {kind === 'client' ? 'Client archivé' : 'Véhicule archivé'} le {formatDate(archivedAt)} : hors des
        listes et de la recherche.
      </span>
      {canRestore && (
        <Button
          size="sm"
          variant="outline"
          disabled={restore.isPending}
          onClick={() => restore.mutate(undefined)}
        >
          <ArchiveRestore /> Restaurer
        </Button>
      )}
    </div>
  );
}
