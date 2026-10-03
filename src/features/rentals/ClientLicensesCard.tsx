import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IdCard, Pencil, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { initials } from '@/app/nav';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { StoredImage } from '@/features/files/StoredImage';
import { formatDate } from '@/features/repair-orders/constants';
import { todayIso } from '@/features/repair-orders/schemas';
import { cn } from '@/lib/utils';
import { deleteLicense, type DrivingLicense } from './license-api';
import { licenseState } from './license-domain';
import { licensesKey, useClientLicenses } from './license-hooks';
import { LicenseDialog } from './LicenseDialog';

interface ClientIdentity {
  id: string;
  kind: 'pro' | 'individual';
  first_name: string | null;
  last_name: string | null;
}

const summary = (license: DrivingLicense) =>
  [
    license.license_number ? `Permis ${license.license_number}` : 'N° à compléter',
    license.categories.length ? license.categories.join(', ') : null,
    license.valid_until ? `jusqu’au ${formatDate(license.valid_until)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * Permis de conduire du client : le sien pour un particulier (un seul permis),
 * ceux de ses conducteurs pour un client pro. Exigés pour louer un véhicule.
 */
export function ClientLicensesCard({ client }: { client: ClientIdentity }) {
  const licenses = useClientLicenses(client.id);
  const queryClient = useQueryClient();
  const today = todayIso();
  const individual = client.kind === 'individual';
  const [editing, setEditing] = useState<DrivingLicense | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<DrivingLicense | null>(null);
  const remove = useMutation({
    mutationFn: deleteLicense,
    onSuccess: async () => {
      toast.success(individual ? 'Permis retiré' : 'Conducteur retiré');
      setToDelete(null);
      await queryClient.invalidateQueries({ queryKey: licensesKey(client.id) });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Suppression impossible'),
  });
  const list = licenses.data ?? [];
  const own = individual ? (list[0] ?? null) : null;
  const ownState = own ? licenseState(own, today) : null;

  return (
    <section data-slot="card" className="card" aria-labelledby="client-licenses">
      <div className="card-h">
        <h2 className="h2" id="client-licenses">
          <IdCard className="i s text-muted-foreground" /> {individual ? 'Permis de conduire' : 'Conducteurs'}
          {!individual && (
            <span className="cnt" aria-hidden>
              {list.length}
            </span>
          )}
        </h2>
        {ownState && <span className={cn('badge dot', ownState.tone)}>{ownState.label}</span>}
      </div>

      {licenses.isPending && <p className="card-b hint">Chargement…</p>}
      {licenses.isError && <p className="card-b text-destructive">Impossible de charger les permis.</p>}

      {licenses.isSuccess && individual && (
        <div className="card-b col gap-3">
          {own ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                {[own.recto_file_id, own.verso_file_id].map((fileId, index) => (
                  <div key={index} className="aspect-[172/112] overflow-hidden rounded-[8px] border bg-muted">
                    {fileId && (
                      <StoredImage
                        fileId={fileId}
                        alt={`${index ? 'Verso' : 'Recto'} du permis`}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                ))}
              </div>
              <dl className="dl">
                <dt>N°</dt>
                <dd>{own.license_number ?? '—'}</dd>
                <dt>Catégories</dt>
                <dd>{own.categories.length ? own.categories.join(' · ') : '—'}</dd>
                <dt>Délivré le</dt>
                <dd>{own.issued_on ? formatDate(own.issued_on) : '—'}</dd>
                <dt>Valide jusqu’au</dt>
                <dd>{own.valid_until ? formatDate(own.valid_until) : '—'}</dd>
              </dl>
              <Button variant="outline" size="sm" className="self-start" onClick={() => setEditing(own)}>
                <Pencil /> Modifier le permis
              </Button>
            </>
          ) : (
            <>
              <p className="hint">Aucun permis enregistré : il est exigé pour louer un véhicule.</p>
              <Button size="sm" className="self-start" onClick={() => setEditing('new')}>
                <IdCard /> Scanner le permis
              </Button>
            </>
          )}
        </div>
      )}

      {licenses.isSuccess && !individual && (
        <>
          {list.length > 0 && (
            <ul>
              {list.map((license) => {
                const state = licenseState(license, today);
                const name = `${license.first_name} ${license.last_name}`;
                return (
                  <li key={license.id} className="li">
                    <span className="row min-w-0 gap-2.5">
                      <span className="av sm bg-muted! text-foreground!" aria-hidden>
                        {initials(name)}
                      </span>
                      <span className="c2 min-w-0">
                        <b>{name}</b>
                        <span>{summary(license)}</span>
                      </span>
                    </span>
                    <span className="row shrink-0 gap-1">
                      <span className={cn('badge', state.tone)}>{state.label}</span>
                      <button
                        type="button"
                        className="ibtn sm ghost"
                        aria-label={`Modifier le permis de ${name}`}
                        onClick={() => setEditing(license)}
                      >
                        <Pencil className="i s" />
                      </button>
                      <button
                        type="button"
                        className="ibtn sm ghost"
                        aria-label={`Retirer ${name}`}
                        onClick={() => setToDelete(license)}
                      >
                        <Trash2 className="i s" />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="card-b row flex-wrap gap-2.5">
            <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
              <UserPlus /> Ajouter un conducteur
            </Button>
            <span className="hint">Un permis scanné par conducteur.</span>
          </div>
        </>
      )}

      {editing && (
        <LicenseDialog
          clientId={client.id}
          license={editing === 'new' ? null : editing}
          title={
            individual
              ? 'Permis de conduire'
              : editing === 'new'
                ? 'Nouveau conducteur'
                : `Permis de ${editing.first_name} ${editing.last_name}`
          }
          identity={
            individual
              ? { first_name: client.first_name ?? '', last_name: client.last_name ?? '' }
              : undefined
          }
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={individual ? 'Retirer le permis ?' : 'Retirer ce conducteur ?'}
        description="Le permis et ses photos ne seront plus utilisables pour les prochaines locations."
        confirmLabel="Retirer"
        destructive
        pending={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </section>
  );
}
