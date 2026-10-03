import { useRef, useState } from 'react';
import { Camera, Check, Gauge, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUploadFile } from '@/features/files/hooks';
import { StoredImage } from '@/features/files/StoredImage';
import { cn } from '@/lib/utils';
import { hasEngine } from './fleet-domain';
import {
  addDamage,
  deleteDamage,
  deleteRentalPhoto,
  saveInspection,
  setRentalPhoto,
  type PhotoSlot,
  type RentalDetail,
  type RentalPhase,
} from './rental-api';
import { DEFAULT_EQUIPMENT, FUEL_LABELS, SIDE_SLOTS } from './rental-domain';
import { useRentalMutation } from './rental-hooks';

/** Photo d'un côté du véhicule (appareil photo sur tablette et téléphone). */
function PhotoTile({
  label,
  fileId,
  required,
  disabled,
  onUploaded,
  onRemove,
}: {
  label: string;
  fileId: string | null;
  required: boolean;
  disabled: boolean;
  onUploaded: (fileId: string) => void;
  onRemove?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadFile('other');
  return (
    <div className="col gap-1.5">
      <button
        type="button"
        disabled={disabled || upload.isPending}
        aria-label={`${fileId ? 'Reprendre' : 'Photographier'} : ${label}`}
        onClick={() => input.current?.click()}
        className={cn(
          'relative aspect-[4/3] cursor-pointer overflow-hidden rounded-[10px] border bg-muted text-muted-foreground disabled:cursor-default',
          !fileId && 'border-dashed',
          !fileId && required && !disabled && 'border-[color-mix(in_srgb,var(--warning)_55%,var(--border))]',
        )}
      >
        {fileId ? (
          <StoredImage fileId={fileId} alt={`Photo : ${label}`} className="h-full w-full object-cover" />
        ) : (
          <span className="col h-full items-center justify-center gap-1">
            {upload.isPending ? <Loader2 className="i animate-spin" /> : <Camera className="i" />}
            <span className="text-xs">{upload.isPending ? 'Envoi…' : 'Photographier'}</span>
          </span>
        )}
        {fileId && (
          <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-3" />
          </span>
        )}
      </button>
      <span className="row between gap-1 text-[12.5px]">
        <span className={cn(fileId ? 'text-foreground' : 'muted')}>
          {label}
          {required && !fileId && <span className="text-destructive"> *</span>}
        </span>
        {onRemove && fileId && !disabled && (
          <button
            type="button"
            className="ibtn xs ghost"
            aria-label={`Retirer : ${label}`}
            onClick={onRemove}
          >
            <Trash2 className="i xs" />
          </button>
        )}
      </span>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        hidden
        data-testid={`photo-${label}`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          upload.mutate(file, { onSuccess: onUploaded, onError: (error) => toast.error(error.message) });
        }}
      />
    </div>
  );
}

/** Jauge de carburant en huitièmes (vide → plein). */
export function FuelGauge({
  value,
  onChange,
  disabled,
  label = 'Carburant',
}: {
  value: number | null;
  onChange?: (eighths: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="col gap-1">
      <div className="row gap-[3px]" role="radiogroup" aria-label={label}>
        {FUEL_LABELS.map((text, eighths) => (
          <button
            key={eighths}
            type="button"
            role="radio"
            aria-checked={value === eighths}
            aria-label={`${text} (${eighths}/8)`}
            disabled={disabled}
            onClick={() => onChange?.(eighths)}
            className={cn(
              'h-7 flex-1 rounded-[4px] border transition-colors first:max-w-7',
              value !== null && eighths > 0 && eighths <= value ? 'border-primary bg-primary' : 'bg-muted',
              value === 0 && eighths === 0 && 'border-destructive bg-destructive',
              !disabled && 'cursor-pointer',
            )}
          />
        ))}
      </div>
      <span className="hint">{value === null ? 'Touchez le niveau de la jauge' : FUEL_LABELS[value]}</span>
    </div>
  );
}

/** Schéma du véhicule vu de dessus : un toucher place un dommage (coordonnées entre 0 et 1). */
function DamageMap({
  marks,
  onPlace,
  disabled,
}: {
  marks: { x: number; y: number; n: number; old: boolean }[];
  onPlace: (x: number, y: number) => void;
  disabled: boolean;
}) {
  return (
    <svg
      viewBox="0 0 260 170"
      role="img"
      aria-label="Schéma du véhicule vu de dessus"
      className={cn('w-full max-w-[320px] text-muted-foreground', !disabled && 'cursor-crosshair')}
      onClick={(event) => {
        if (disabled) return;
        const rect = event.currentTarget.getBoundingClientRect();
        onPlace(
          Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
          Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
        );
      }}
    >
      <g stroke="currentColor" strokeWidth="1.6" fill="none">
        <rect x="40" y="35" width="180" height="100" rx="10" />
        <path d="M220 45 Q248 50 250 85 Q248 120 220 125" />
        <line x1="205" y1="38" x2="205" y2="132" />
        <rect x="70" y="24" width="30" height="11" rx="3" />
        <rect x="70" y="135" width="30" height="11" rx="3" />
        <rect x="180" y="24" width="30" height="11" rx="3" />
        <rect x="180" y="135" width="30" height="11" rx="3" />
      </g>
      <text x="252" y="16" textAnchor="end" fontSize="9" fill="currentColor">
        AVANT →
      </text>
      {marks.map((mark) => (
        <g key={`${mark.n}-${mark.x}`}>
          <circle cx={mark.x * 260} cy={mark.y * 170} r="9" fill={mark.old ? '#9aa0a6' : '#e8551e'} />
          <text
            x={mark.x * 260}
            y={mark.y * 170 + 3.5}
            textAnchor="middle"
            fontSize="10"
            fontWeight="700"
            fill="#fff"
          >
            {mark.n}
          </text>
        </g>
      ))}
    </svg>
  );
}

/**
 * État des lieux d'un départ ou d'un retour : photos des 4 côtés et du tableau de bord,
 * kilométrage, carburant, dommages, équipements (et propreté au retour). Chaque saisie est
 * enregistrée tout de suite ; `required` : photos et relevés exigés (location).
 */
export function InspectionEditor({
  detail,
  phase,
  editable,
  required,
}: {
  detail: RentalDetail;
  phase: RentalPhase;
  editable: boolean;
  required: boolean;
}) {
  const { rental, vehicle, photos, damages, inspections } = detail;
  const engine = hasEngine(vehicle.category);
  const inspection = inspections.find((item) => item.phase === phase);
  const phasePhotos = photos.filter((photo) => photo.phase === phase);
  const photoOf = (slot: PhotoSlot) => phasePhotos.find((photo) => photo.slot === slot) ?? null;
  const closeups = phasePhotos.filter((photo) => photo.slot === 'closeup');
  const [mileage, setMileage] = useState(inspection?.mileage?.toString() ?? '');
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [damageLabel, setDamageLabel] = useState('');

  const photo = useRentalMutation(({ slot, fileId }: { slot: PhotoSlot; fileId: string }) =>
    setRentalPhoto(rental.id, phase, slot, fileId),
  );
  const removePhoto = useRentalMutation((id: string) => deleteRentalPhoto(id));
  const save = useRentalMutation((patch: Parameters<typeof saveInspection>[2]) =>
    saveInspection(rental.id, phase, {
      mileage: inspection?.mileage ?? null,
      fuel_eighths: inspection?.fuel_eighths ?? null,
      equipment: inspection?.equipment ?? (phase === 'departure' ? DEFAULT_EQUIPMENT : []),
      clean: inspection?.clean ?? null,
      ...patch,
    }),
  );
  const damage = useRentalMutation(addDamage, 'Dommage noté');
  const removeDamage = useRentalMutation(deleteDamage);

  // Dommages : ceux du départ restent visibles (grisés) au retour
  const shown = damages.filter((item) => phase === 'return' || item.phase === 'departure');
  const marks = shown.map((item, index) => ({
    x: Number(item.x),
    y: Number(item.y),
    n: index + 1,
    old: phase === 'return' && item.phase === 'departure',
  }));
  const departureEquipment =
    inspections.find((item) => item.phase === 'departure')?.equipment ?? DEFAULT_EQUIPMENT;
  const equipmentList = phase === 'departure' ? DEFAULT_EQUIPMENT : departureEquipment;
  const checkedEquipment = inspection?.equipment ?? (phase === 'departure' ? DEFAULT_EQUIPMENT : []);
  const sidesDone = SIDE_SLOTS.filter(({ slot }) => photoOf(slot)).length;

  const commitMileage = () => {
    const value = mileage.trim() ? Number(mileage.replace(/\s/g, '')) : null;
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      toast.error('Kilométrage : nombre entier attendu');
      return;
    }
    if (value !== (inspection?.mileage ?? null)) save.mutate({ mileage: value });
  };

  return (
    <div className="col gap-4">
      <section data-slot="card" className="card" aria-labelledby={`photos-${phase}`}>
        <div className="card-h">
          <h2 className="h2" id={`photos-${phase}`}>
            Photos du véhicule
          </h2>
          <span className={cn('badge', sidesDone === 4 ? 's-ok' : required ? 's-warn' : 's-grey')}>
            {sidesDone} / 4{required ? '' : ' · conseillées'}
          </span>
        </div>
        <div className="card-b col gap-3">
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {SIDE_SLOTS.map(({ slot, label }) => (
              <PhotoTile
                key={slot}
                label={label}
                fileId={photoOf(slot)?.file_id ?? null}
                required={required}
                disabled={!editable}
                onUploaded={(fileId) => photo.mutate({ slot, fileId })}
              />
            ))}
          </div>
          {closeups.length > 0 && (
            <div className="grid grid-cols-3 gap-2.5 md:grid-cols-6">
              {closeups.map((item, index) => (
                <PhotoTile
                  key={item.id}
                  label={`Gros plan ${index + 1}`}
                  fileId={item.file_id}
                  required={false}
                  disabled={!editable}
                  onUploaded={() => undefined}
                  onRemove={() => removePhoto.mutate(item.id)}
                />
              ))}
            </div>
          )}
          {editable && (
            <div className="row between flex-wrap gap-2">
              <span className="hint">
                {required
                  ? '4 photos obligatoires au départ et au retour d’une location.'
                  : 'Photos conseillées pour un prêt, pas obligatoires.'}{' '}
                Ajoute des gros plans si un défaut existe déjà.
              </span>
              <CloseupButton onUploaded={(fileId) => photo.mutate({ slot: 'closeup', fileId })} />
            </div>
          )}
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section data-slot="card" className="card" aria-labelledby={`dashboard-${phase}`}>
          <div className="card-h">
            <h2 className="h2" id={`dashboard-${phase}`}>
              <Gauge className="i s text-muted-foreground" /> Tableau de bord
            </h2>
            <span className="badge s-grey">{required ? 'Obligatoire' : 'Conseillé'}</span>
          </div>
          <div className="card-b col gap-3">
            <div className="max-w-[260px]">
              <PhotoTile
                label="Tableau de bord"
                fileId={photoOf('dashboard')?.file_id ?? null}
                required={required}
                disabled={!editable}
                onUploaded={(fileId) => photo.mutate({ slot: 'dashboard', fileId })}
              />
            </div>
            {engine ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="field">
                  <Label htmlFor={`mileage-${phase}`}>Kilométrage{required && ' *'}</Label>
                  <Input
                    id={`mileage-${phase}`}
                    inputMode="numeric"
                    className="num"
                    disabled={!editable}
                    value={mileage}
                    onChange={(event) => setMileage(event.target.value)}
                    onBlur={commitMileage}
                    onKeyDown={(event) => event.key === 'Enter' && commitMileage()}
                  />
                  <span className="hint">Relevé sur le compteur</span>
                </div>
                <div className="field">
                  <span className="lbl">Carburant{required && ' *'}</span>
                  <FuelGauge
                    value={inspection?.fuel_eighths ?? null}
                    disabled={!editable}
                    onChange={(fuel_eighths) => save.mutate({ fuel_eighths })}
                  />
                </div>
              </div>
            ) : (
              <p className="hint">Remorque : pas de compteur ni de carburant.</p>
            )}
          </div>
        </section>

        <section data-slot="card" className="card" aria-labelledby={`damages-${phase}`}>
          <div className="card-h">
            <h2 className="h2" id={`damages-${phase}`}>
              {phase === 'departure' ? 'Dommages existants' : 'Dommages'}
            </h2>
          </div>
          <div className="card-b col gap-2.5">
            <div className="flex justify-center rounded-[8px] border bg-head p-2.5">
              <DamageMap
                marks={pending ? [...marks, { ...pending, n: marks.length + 1, old: false }] : marks}
                disabled={!editable}
                onPlace={(x, y) => setPending({ x, y })}
              />
            </div>
            {pending && (
              <form
                className="row gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!damageLabel.trim()) return;
                  damage.mutate(
                    { rental_id: rental.id, phase, x: pending.x, y: pending.y, label: damageLabel.trim() },
                    {
                      onSuccess: () => {
                        setPending(null);
                        setDamageLabel('');
                      },
                    },
                  );
                }}
              >
                <Input
                  autoFocus
                  aria-label="Description du dommage"
                  placeholder="Ex : rayure pare-chocs avant droit"
                  value={damageLabel}
                  onChange={(event) => setDamageLabel(event.target.value)}
                />
                <Button type="submit" size="sm" disabled={!damageLabel.trim() || damage.isPending}>
                  <Plus /> Noter
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setPending(null)}>
                  Annuler
                </Button>
              </form>
            )}
            {shown.length > 0 ? (
              <ul className="col">
                {shown.map((item, index) => {
                  const old = phase === 'return' && item.phase === 'departure';
                  return (
                    <li key={item.id} className="row between gap-2 py-1.5">
                      <span className="row min-w-0 gap-2">
                        <span
                          className={cn(
                            'grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white',
                            old ? 'bg-[#9aa0a6]' : 'bg-[#e8551e]',
                          )}
                        >
                          {index + 1}
                        </span>
                        <span className="min-w-0 truncate text-[13px]">{item.label}</span>
                        {phase === 'return' && !old && <span className="badge s-orange">Nouveau</span>}
                      </span>
                      {editable && item.phase === phase && (
                        <button
                          type="button"
                          className="ibtn sm ghost"
                          aria-label={`Retirer le dommage : ${item.label}`}
                          onClick={() => removeDamage.mutate(item.id)}
                        >
                          <Trash2 className="i s" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <span className="hint">
                {editable ? 'Touche le schéma pour placer un dommage.' : 'Aucun dommage noté.'}
              </span>
            )}
          </div>
        </section>
      </div>

      <section data-slot="card" className="card" aria-labelledby={`equipment-${phase}`}>
        <div className="card-h">
          <h2 className="h2" id={`equipment-${phase}`}>
            {phase === 'departure' ? 'Équipements remis' : 'Équipements rendus'}
          </h2>
        </div>
        <div className="card-b row flex-wrap gap-x-5 gap-y-2.5">
          {equipmentList.map((item) => {
            const on = checkedEquipment.includes(item);
            return (
              <label key={item} className="row cursor-pointer gap-2 text-[13.5px]">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!editable}
                  onChange={() =>
                    save.mutate({
                      equipment: on
                        ? checkedEquipment.filter((value) => value !== item)
                        : [...checkedEquipment, item],
                    })
                  }
                />
                {item}
              </label>
            );
          })}
          {phase === 'return' && (
            <label className="row cursor-pointer gap-2 text-[13.5px]">
              <input
                type="checkbox"
                checked={inspection?.clean ?? false}
                disabled={!editable}
                onChange={(event) => save.mutate({ clean: event.target.checked })}
              />
              Véhicule propre
            </label>
          )}
        </div>
      </section>
    </div>
  );
}

function CloseupButton({ onUploaded }: { onUploaded: (fileId: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadFile('other');
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        hidden
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
        variant="outline"
        disabled={upload.isPending}
        onClick={() => input.current?.click()}
      >
        {upload.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Ajouter un gros plan
      </Button>
    </>
  );
}
