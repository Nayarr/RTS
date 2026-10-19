import { useState } from 'react';
import { Check, Pencil, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { saveSupplier, type Supplier } from './api';
import { useSuppliers, useTireMutation } from './hooks';

interface Draft {
  name: string;
  email: string;
  phone: string;
}

const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const toDraft = (supplier?: Supplier): Draft => ({
  name: supplier?.name ?? '',
  email: supplier?.email ?? '',
  phone: supplier?.phone ?? '',
});

function SupplierForm({
  initial,
  label,
  submitLabel,
  onSave,
  onCancel,
  pending,
}: {
  initial: Draft;
  label: string;
  submitLabel: string;
  onSave: (draft: Draft) => void;
  onCancel?: () => void;
  pending: boolean;
}) {
  const [draft, setDraft] = useState(initial);
  const emailError = draft.email.trim() !== '' && !VALID_EMAIL.test(draft.email.trim());
  return (
    <form
      aria-label={label}
      className="grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_130px_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.name.trim() && !emailError) onSave(draft);
      }}
    >
      <Input
        aria-label="Nom du fournisseur"
        placeholder="Nom"
        value={draft.name}
        autoFocus={Boolean(onCancel)}
        onChange={(event) => setDraft({ ...draft, name: event.target.value })}
      />
      <div className="col gap-1">
        <Input
          aria-label="E-mail des commandes"
          type="email"
          placeholder="commandes@fournisseur.fr"
          aria-invalid={emailError || undefined}
          value={draft.email}
          onChange={(event) => setDraft({ ...draft, email: event.target.value })}
        />
        {emailError && <span className="err">Adresse e-mail invalide</span>}
      </div>
      <Input
        aria-label="Téléphone"
        placeholder="Téléphone"
        value={draft.phone}
        onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
      />
      <div className="row gap-1">
        {onCancel ? (
          <>
            <button type="submit" className="ibtn sm ghost" aria-label={submitLabel} disabled={pending}>
              <Check className="i s" />
            </button>
            <button type="button" className="ibtn sm ghost" aria-label="Annuler" onClick={onCancel}>
              <X className="i s" />
            </button>
          </>
        ) : (
          <Button type="submit" disabled={pending || !draft.name.trim()}>
            <Plus /> {submitLabel}
          </Button>
        )}
      </div>
    </form>
  );
}

/** Fournisseurs des pneus : l'e-mail sert à la demande de chiffrage. */
export function SuppliersDialog({ onClose }: { onClose: () => void }) {
  const suppliers = useSuppliers();
  const [editing, setEditing] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const save = useTireMutation(
    ({ id, draft }: { id: string | null; draft: Draft }) =>
      saveSupplier(id, { name: draft.name, email: draft.email || null, phone: draft.phone || null }),
    (_data, { id, draft }) => (id ? `${draft.name.trim()} modifié` : `${draft.name.trim()} ajouté`),
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>Fournisseurs</DialogTitle>
          <DialogDescription>
            L’e-mail des commandes reçoit les demandes de chiffrage des pneus. Les mêmes fournisseurs servent
            pour les pièces.
          </DialogDescription>
        </DialogHeader>
        <SupplierForm
          key={formKey}
          initial={toDraft()}
          label="Nouveau fournisseur"
          submitLabel="Ajouter"
          pending={save.isPending}
          onSave={(draft) =>
            save.mutate({ id: null, draft }, { onSuccess: () => setFormKey((key) => key + 1) })
          }
        />
        {suppliers.data?.length === 0 && <p className="empty">Aucun fournisseur pour l’instant.</p>}
        {suppliers.data && suppliers.data.length > 0 && (
          <ul className="card overflow-hidden p-0!" aria-label="Fournisseurs">
            {suppliers.data.map((supplier) => (
              <li
                key={supplier.id}
                className="border-b px-4 py-2.5 last:border-b-0"
                aria-label={supplier.name}
              >
                {editing === supplier.id ? (
                  <SupplierForm
                    initial={toDraft(supplier)}
                    label={`Modifier ${supplier.name}`}
                    submitLabel="Enregistrer le fournisseur"
                    pending={save.isPending}
                    onCancel={() => setEditing(null)}
                    onSave={(draft) =>
                      save.mutate({ id: supplier.id, draft }, { onSuccess: () => setEditing(null) })
                    }
                  />
                ) : (
                  <div className="row items-center gap-3">
                    <div className="col min-w-0 flex-1">
                      <b className="text-[14px]">{supplier.name}</b>
                      <span className="muted truncate text-xs">
                        {[supplier.email ?? 'Pas d’e-mail', supplier.phone].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="ibtn sm ghost"
                      aria-label={`Modifier ${supplier.name}`}
                      onClick={() => setEditing(supplier.id)}
                    >
                      <Pencil className="i s" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
