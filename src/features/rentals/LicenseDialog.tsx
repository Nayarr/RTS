import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { saveLicense, type DrivingLicense } from './license-api';
import {
  emptyLicense,
  licenseFromForm,
  licenseSchema,
  licenseToForm,
  type LicenseOutput,
  type LicenseValues,
} from './license-domain';
import { LicenseEditor } from './LicenseEditor';
import { licensesKey } from './license-hooks';

/** Scan et saisie d'un permis : celui d'un particulier, ou d'un conducteur d'un client pro. */
export function LicenseDialog({
  clientId,
  license,
  title,
  identity,
  onClose,
}: {
  clientId: string;
  license: DrivingLicense | null;
  title: string;
  /** Nom et prénom proposés pour un nouveau permis (client particulier). */
  identity?: { first_name?: string; last_name?: string };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<LicenseValues, unknown, LicenseOutput>({
    resolver: zodResolver(licenseSchema),
    defaultValues: license ? licenseToForm(license) : emptyLicense(identity),
  });
  const save = useMutation({
    mutationFn: (values: LicenseOutput) =>
      saveLicense(license?.id ?? null, licenseFromForm(values, clientId)),
    onSuccess: async () => {
      toast.success('Permis enregistré');
      await queryClient.invalidateQueries({ queryKey: licensesKey(clientId) });
      onClose();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Enregistrement impossible'),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Photographie le recto et le verso : le permis scanné est exigé pour louer un véhicule.
          </DialogDescription>
        </DialogHeader>
        <form
          id="license-form"
          noValidate
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
          className="col gap-4"
        >
          <LicenseEditor form={form} />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="license-form" disabled={save.isPending}>
            {save.isPending ? 'Enregistrement…' : 'Enregistrer le permis'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
