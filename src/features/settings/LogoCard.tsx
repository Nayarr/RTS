import { Button } from '@/components/ui/button';
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
    <section data-slot="card" className="card" aria-labelledby="logo-title">
      <div className="sec-h">
        <h2 className="h2" id="logo-title">
          Logo
        </h2>
        <span className="hint">Affiché en en-tête des devis, factures et avoirs.</span>
      </div>
      <div className="form flex-row! flex-wrap items-center gap-5!">
        <StoredImage
          fileId={logoFileId}
          alt="Logo de l’entreprise"
          className="size-24 rounded-[14px] bg-white object-contain p-1.5"
        />
        <div className="col gap-2">
          <div className="row wrap gap-2">
            <ImageUploadButton
              category="logo"
              compress={false}
              size="sm"
              variant="outline"
              onUploaded={(fileId) => save.mutate(fileId)}
            >
              {logoFileId ? 'Changer le logo' : 'Ajouter un logo'}
            </ImageUploadButton>
            {logoFileId && (
              <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => save.mutate(null)}>
                Retirer
              </Button>
            )}
          </div>
          <span className="hint">PNG, JPEG ou WebP, 2 Mo maximum, fond blanc de préférence.</span>
        </div>
      </div>
    </section>
  );
}
