import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ImageUploadButton } from '@/features/files/ImageUploadButton';
import { StoredImage } from '@/features/files/StoredImage';
import { updateCompanySettings } from './api';
import { useSaveSettings } from './hooks';

/** Logo imprimé sur les devis, factures et documents envoyés aux clients. */
export function LogoCard({ logoFileId }: { logoFileId: string | null }) {
  const save = useSaveSettings(
    (logo_file_id: string | null) => updateCompanySettings({ logo_file_id }),
    'Logo enregistré',
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl font-bold">Logo</h2>
        </CardTitle>
        <CardDescription>
          Imprimé en tête des devis et factures. Image PNG, JPEG ou WebP, 2 Mo maximum.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <StoredImage fileId={logoFileId} alt="Logo de l’entreprise" className="size-24 object-contain" />
        <div className="flex flex-wrap gap-2">
          <ImageUploadButton category="logo" compress={false} onUploaded={(fileId) => save.mutate(fileId)}>
            {logoFileId ? 'Changer le logo' : 'Ajouter un logo'}
          </ImageUploadButton>
          {logoFileId && (
            <Button variant="ghost" disabled={save.isPending} onClick={() => save.mutate(null)}>
              Retirer
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
