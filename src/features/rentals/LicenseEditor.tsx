import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, CircleCheck, IdCard, Loader2, ScanText, TriangleAlert } from 'lucide-react';
import { Controller, useWatch, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { useUploadFile } from '@/features/files/hooks';
import { StoredImage } from '@/features/files/StoredImage';
import { fetchLabelScanEnabled } from '@/features/workshop/api';
import { cn } from '@/lib/utils';
import { readLicense, type LicenseReading } from './license-api';
import {
  ALL_LICENSE_CATEGORIES,
  applyReading,
  COUNTER_CATEGORIES,
  type LicenseValues,
} from './license-domain';

type Side = 'recto' | 'verso';
const SIDE_FIELD = { recto: 'recto_file_id', verso: 'verso_file_id' } as const;
const SIDE_LABEL: Record<Side, string> = { recto: 'Recto', verso: 'Verso' };

/** Photo d'une face du permis : appareil photo sur téléphone et tablette, fichier sur ordinateur. */
function LicenseSide({
  side,
  fileId,
  onUploaded,
}: {
  side: Side;
  fileId: string | null;
  onUploaded: (fileId: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadFile('other');
  return (
    <div className="col gap-2">
      <span className="lbl">{SIDE_LABEL[side]}</span>
      <div className="relative aspect-[172/112] overflow-hidden rounded-[10px] border bg-muted">
        {fileId ? (
          <StoredImage
            fileId={fileId}
            alt={`${SIDE_LABEL[side]} du permis`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="col h-full items-center justify-center gap-1.5 text-muted-foreground">
            <IdCard className="i l" strokeWidth={1.4} />
            <span className="text-xs">Pas encore scanné</span>
          </div>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        hidden
        data-testid={`license-${side}`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          upload.mutate(file, { onSuccess: onUploaded, onError: (error) => toast.error(error.message) });
        }}
      />
      <Button
        type="button"
        size="sm"
        variant={fileId ? 'outline' : 'default'}
        disabled={upload.isPending}
        onClick={() => input.current?.click()}
      >
        {upload.isPending ? <Loader2 className="animate-spin" /> : <Camera />}
        {upload.isPending
          ? 'Envoi…'
          : `${fileId ? 'Reprendre' : 'Scanner'} le ${SIDE_LABEL[side].toLowerCase()}`}
      </Button>
    </div>
  );
}

/**
 * Permis de conduire : scan du recto et du verso, lu automatiquement (si la direction l'a activé)
 * pour remplir les champs, qui restent modifiables à la main.
 * `onRead` reçoit la lecture (pour remplir aussi l'identité d'un nouveau client).
 */
export function LicenseEditor({
  form,
  idPrefix = 'license',
  withIdentity = true,
  onRead,
}: {
  form: UseFormReturn<LicenseValues>;
  idPrefix?: string;
  /** false : nom, prénom et naissance repris de la fiche client (nouveau particulier). */
  withIdentity?: boolean;
  onRead?: (reading: LicenseReading) => void;
}) {
  const {
    control,
    register,
    setValue,
    getValues,
    reset,
    formState: { errors },
  } = form;
  const [recto, verso, readAutomatically] = useWatch({
    control,
    name: ['recto_file_id', 'verso_file_id', 'read_automatically'],
  });
  const scanEnabled = useQuery({
    queryKey: ['label-scan-enabled'],
    queryFn: fetchLabelScanEnabled,
    staleTime: 300_000,
  });
  // Lecture une seule fois par paire de photos (nouvelle photo : nouvelle lecture).
  const reading = useQuery({
    queryKey: ['label-read', 'driving_license', recto, verso],
    queryFn: () => readLicense(recto ?? '', verso ?? ''),
    enabled: Boolean(recto && verso && scanEnabled.data),
    retry: false,
    staleTime: Infinity,
  });
  const applied = useRef<string | null>(null);
  useEffect(() => {
    const key = `${recto}|${verso}`;
    if (!reading.data || applied.current === key) return;
    applied.current = key;
    reset(applyReading(getValues(), reading.data), { keepDefaultValues: true });
    onRead?.(reading.data);
  }, [reading.data, recto, verso, reset, getValues, onRead]);

  const id = (name: string) => `${idPrefix}-${name}`;
  const scanned = Boolean(recto && verso);

  return (
    <div className="col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {(['recto', 'verso'] as const).map((side) => (
          <LicenseSide
            key={side}
            side={side}
            fileId={side === 'recto' ? recto : verso}
            onUploaded={(fileId) => setValue(SIDE_FIELD[side], fileId, { shouldDirty: true })}
          />
        ))}
      </div>

      {!scanned && (
        <p className="alert s-blue">
          <IdCard className="i" />
          <span>
            <b>Obligatoire pour une location.</b> Photographie le recto et le verso
            {scanEnabled.data ? ' : les informations sont lues automatiquement, vérifie-les.' : '.'}
          </span>
        </p>
      )}
      {scanned && reading.isFetching && (
        <p className="row gap-2 text-sm" role="status">
          <ScanText className="i s shrink-0 animate-pulse" /> Lecture du permis en cours…
        </p>
      )}
      {scanned && reading.isError && (
        <p className="alert s-warn" role="alert">
          <TriangleAlert className="i" />
          <span>{reading.error instanceof Error ? reading.error.message : 'Lecture impossible'}</span>
        </p>
      )}
      {scanned && readAutomatically && !reading.isFetching && (
        <p className="alert s-ok" role="status">
          <CircleCheck className="i" />
          <span>Informations lues sur le permis : vérifie-les avant d’enregistrer.</span>
        </p>
      )}

      <div className="grid gap-3.5 sm:grid-cols-2">
        {withIdentity && (
          <>
            <FormField
              id={id('last_name')}
              label="Nom *"
              autoComplete="off"
              error={errors.last_name?.message}
              {...register('last_name')}
            />
            <FormField
              id={id('first_name')}
              label="Prénom *"
              autoComplete="off"
              error={errors.first_name?.message}
              {...register('first_name')}
            />
            <FormField
              id={id('birth_date')}
              label="Date de naissance"
              type="date"
              error={errors.birth_date?.message}
              {...register('birth_date')}
            />
            <FormField
              id={id('birth_place')}
              label="Lieu de naissance"
              error={errors.birth_place?.message}
              {...register('birth_place')}
            />
          </>
        )}
        <FormField
          id={id('license_number')}
          label="N° de permis"
          autoComplete="off"
          error={errors.license_number?.message}
          {...register('license_number')}
        />
        <FormField
          id={id('issued_on')}
          label="Délivré le"
          type="date"
          error={errors.issued_on?.message}
          {...register('issued_on')}
        />
        <FormField
          id={id('valid_until')}
          label="Valable jusqu’au"
          type="date"
          hint="Vide pour un ancien permis sans date de fin"
          error={errors.valid_until?.message}
          {...register('valid_until')}
        />
      </div>

      <Controller
        control={control}
        name="categories"
        render={({ field }) => {
          const shown = ALL_LICENSE_CATEGORIES.filter(
            (category) =>
              (COUNTER_CATEGORIES as readonly string[]).includes(category) || field.value.includes(category),
          );
          return (
            <div className="field">
              <span className="lbl" id={id('categories')}>
                Catégories
              </span>
              <div className="chips" role="group" aria-labelledby={id('categories')}>
                {shown.map((category) => {
                  const on = field.value.includes(category);
                  return (
                    <button
                      key={category}
                      type="button"
                      className={cn('chip', on && 'on')}
                      aria-pressed={on}
                      onClick={() =>
                        field.onChange(
                          on ? field.value.filter((value) => value !== category) : [...field.value, category],
                        )
                      }
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}
