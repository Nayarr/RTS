import { useRef, type ReactNode } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SectionNav } from '@/components/SectionNav';
import { Button } from '@/components/ui/button';
import { uploadFile } from '@/features/files/api';
import { compressImage } from '@/features/files/image';
import { StoredImage } from '@/features/files/StoredImage';
import { useMutation } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import type { FleetCategory } from './fleet-api';
import { CATEGORY_META } from './fleet-domain';

/** Écrans de la rubrique Location (une URL par écran). */
export function LocationTabs() {
  return (
    <SectionNav
      label="Location"
      links={[
        { to: '/location', label: 'Vue d’ensemble' },
        { to: '/location/contrats', label: 'Locations' },
        { to: '/location/flotte', label: 'Flotte' },
      ]}
    />
  );
}

/** Photo du véhicule, sinon pictogramme de sa catégorie. */
export function VehicleVisual({
  category,
  fileId,
  alt,
  className,
}: {
  category: FleetCategory;
  fileId: string | null | undefined;
  alt: string;
  className?: string;
}) {
  if (fileId) return <StoredImage fileId={fileId} alt={alt} className={cn('object-cover', className)} />;
  const Icon = CATEGORY_META[category].icon;
  return (
    <div
      role="img"
      aria-label={alt}
      className={cn('flex items-center justify-center bg-muted text-muted-foreground', className)}
    >
      <Icon className="size-1/3 max-h-12 max-w-12" strokeWidth={1.4} />
    </div>
  );
}

/** Indicateur chiffré (maquette : icône, valeur, libellé). */
export function Kpi({
  icon,
  value,
  label,
  tone,
}: {
  icon: ReactNode;
  value: ReactNode;
  label: ReactNode;
  tone?: 'hot' | 'warn';
}) {
  return (
    <li
      className="card kpi"
      style={
        tone === 'hot'
          ? { borderColor: 'color-mix(in srgb, var(--destructive) 45%, transparent)' }
          : undefined
      }
    >
      <span className={cn('kpi-ico', tone === 'hot' && 'down', tone === 'warn' && 'warn-t')}>{icon}</span>
      <div className="col gap-1">
        <span className={cn('kpi-v', tone === 'hot' && 'down')}>{value}</span>
        <span className="kpi-l">{label}</span>
      </div>
    </li>
  );
}

const DOCUMENT_TYPES = 'image/jpeg,image/png,image/webp,application/pdf';

/** Ajout d'un document (photo compressée ou PDF tel quel) ; `onUploaded` reçoit l'identifiant du fichier. */
export function DocumentUploadButton({
  onUploaded,
  children,
  label,
  variant = 'outline',
  size = 'sm',
}: {
  onUploaded: (fileId: string) => void;
  children: ReactNode;
  /** Nom accessible du bouton (sinon son texte). */
  label?: string;
  variant?: 'outline' | 'ghost' | 'default';
  size?: 'sm' | 'default';
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (file: File) =>
      file.type === 'application/pdf'
        ? uploadFile(file, { category: 'other' })
        : uploadFile(await compressImage(file), { category: 'other', name: file.name }),
  });
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={DOCUMENT_TYPES}
        hidden
        data-testid="document-upload"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          upload.mutate(file, {
            onSuccess: onUploaded,
            onError: (error) => toast.error(error.message),
          });
        }}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        aria-label={label}
        disabled={upload.isPending}
        onClick={() => input.current?.click()}
      >
        {upload.isPending ? <Loader2 className="animate-spin" /> : <FileUp />}
        {children}
      </Button>
    </>
  );
}

/** Étapes d'un assistant (contrat, retour) : faites, en cours, à venir ; cliquables si `onSelect`. */
export function Stepper({
  steps,
  current,
  done = [],
  onSelect,
}: {
  steps: string[];
  current: number;
  done?: number[];
  onSelect?: (index: number) => void;
}) {
  return (
    <ol className="row flex-wrap gap-x-2 gap-y-2" aria-label="Étapes">
      {steps.map((label, index) => {
        const on = index === current;
        const finished = done.includes(index);
        const content = (
          <>
            <span
              className={cn(
                'grid size-6 shrink-0 place-items-center rounded-full border text-xs font-bold',
                on && 'border-primary bg-primary text-primary-foreground',
                !on && finished && 'border-primary text-primary',
                !on && !finished && 'text-muted-foreground',
              )}
            >
              {index + 1}
            </span>
            <span className={cn('text-[13px]', on ? 'font-semibold' : 'text-muted-foreground')}>{label}</span>
          </>
        );
        return (
          <li key={label} className="row gap-2" aria-current={on ? 'step' : undefined}>
            {index > 0 && <span className="hidden h-px w-6 bg-border sm:block" aria-hidden />}
            {onSelect ? (
              <button type="button" className="row cursor-pointer gap-2" onClick={() => onSelect(index)}>
                {content}
              </button>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ol>
  );
}
