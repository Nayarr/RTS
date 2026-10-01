import { useRef, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ImagePlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FileCategory } from './api';
import { useUploadFile } from './hooks';

const ACCEPTED = 'image/jpeg,image/png,image/webp';

/**
 * Bouton d'ajout de photo : galerie ou appareil photo sur téléphone / tablette,
 * compression puis envoi dans R2. `onUploaded` reçoit l'identifiant du fichier.
 */
export function ImageUploadButton({
  category,
  onUploaded,
  children = 'Ajouter une photo',
  variant = 'outline',
  compress = true,
  size = 'default',
}: {
  category: FileCategory;
  onUploaded: (fileId: string) => void;
  children?: ReactNode;
  variant?: 'default' | 'outline' | 'secondary';
  /** false : fichier envoyé tel quel (logo PNG avec transparence). */
  compress?: boolean;
  size?: 'default' | 'sm';
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadFile(category, { compress });

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // permet de choisir à nouveau le même fichier
    if (!file) return;
    upload.mutate(file, {
      onSuccess: (fileId) => onUploaded(fileId),
      onError: (error) => toast.error(error.message),
    });
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED}
        hidden
        onChange={onChange}
        data-testid={`upload-${category}`}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={upload.isPending}
        onClick={() => input.current?.click()}
      >
        {upload.isPending ? <Loader2 className="animate-spin" /> : <ImagePlus />}
        {upload.isPending ? 'Envoi…' : children}
      </Button>
    </>
  );
}
