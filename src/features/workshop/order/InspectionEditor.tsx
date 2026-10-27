import { useEffect, useId, useRef, useState } from 'react';
import { Camera, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CHECK_FIELDS,
  CHECK_PHOTO_FIELDS,
  canAddAxles,
  extraAxleLabel,
  FLUID_FIELDS,
  inspectionMissingPoints,
  OK_HS_OPTIONS,
  tireAxlesFor,
  WARNING_LIGHT_FIELDS,
  wearFieldsFor,
  WEAR_OPTIONS,
  YES_NO_OPTIONS,
  type ChipOption,
  type FluidKey,
  type InspectionData,
} from '@/features/repair-orders/inspection';
import { cn } from '@/lib/utils';
import { saveInspection } from '../api';
import { formatTireSize } from '../domain';
import { useWorkshopMutation } from '../hooks';
import { TailgateLabelDialog } from './TailgateLabelDialog';
import type { PhotoCapture } from './use-photo-capture';

const SAVE_DELAY_MS = 600;

function ChipRow({
  label,
  options,
  value,
  onChange,
  disabled,
  action,
  children,
}: {
  label: string;
  options: ChipOption[];
  value: string | undefined;
  onChange: (value: string) => void;
  disabled: boolean;
  /** Bouton à droite des choix, sur la même ligne (photo de l'étiquette). */
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const labelId = useId();
  const choices = (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      className={cn('lvl', action && 'min-w-0 grow')}
      style={{ '--n': options.length } as React.CSSProperties}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            // Couleur de la valeur choisie : OK vert, 50 % orange, HS rouge.
            className={cn(selected && 'on', selected && option.color && 'tone')}
            style={option.color ? ({ '--c': option.color } as React.CSSProperties) : undefined}
            // Un second appui sur la valeur choisie l'efface.
            onClick={() => onChange(selected ? '' : option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
  return (
    <div className="col gap-1.5">
      <span id={labelId} className="lbl">
        {label}
      </span>
      {action ? (
        <div className="row items-stretch gap-2">
          {choices}
          {action}
        </div>
      ) : (
        choices
      )}
      {children}
    </div>
  );
}

const FLUID_OPTIONS: ChipOption[] = [
  { value: 'bon', label: 'Niveau bon', color: '' },
  { value: 'manque', label: 'Manque · appoint fait', color: '' },
];

/** Fiche de contrôle véhicule, enregistrée automatiquement. */
export function InspectionEditor({
  repairOrderId,
  initial,
  capture,
  photoLabels,
  locked,
  vehicleId,
  vehicleType,
  required = false,
  tailgateScan,
  onTailgateScanDone,
}: {
  repairOrderId: string;
  initial: InspectionData | null;
  capture: PhotoCapture;
  /** Libellés des photos déjà prises sur l'OR (photo obligatoire du hayon HS). */
  photoLabels: string[];
  locked: boolean;
  vehicleId: string;
  /** Type du véhicule : éléments d'usure et essieux proposés en dépendent. */
  vehicleType: 'pl' | 'vul' | 'remorque';
  /** Fiche complète exigée par la direction : tous les points OK / 50 % / HS avant de terminer. */
  required?: boolean;
  /** Photo de l'étiquette du hayon à lire automatiquement (réglage de la direction). */
  tailgateScan?: string | null;
  onTailgateScanDone?: () => void;
}) {
  const [data, setData] = useState<InspectionData>(initial ?? {});
  const missingPoints = inspectionMissingPoints(data, vehicleType);
  const save = useWorkshopMutation(repairOrderId, (next: InspectionData) =>
    saveInspection(repairOrderId, next),
  );

  // Enregistrement groupé : une seule écriture après une série de saisies rapprochées.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<InspectionData | null>(null);
  const flush = () => {
    clearTimeout(timer.current);
    if (pending.current) save.mutate(pending.current);
    pending.current = null;
  };
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps -- enregistre en quittant la fiche

  const update = (recipe: (draft: InspectionData) => InspectionData) => {
    setData((current) => {
      const next = recipe(current);
      pending.current = next;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
      return next;
    });
  };

  const setIn = <K extends keyof InspectionData>(section: K, key: string, value: unknown) =>
    update((current) => ({ ...current, [section]: { ...(current[section] as object), [key]: value } }));

  // Essieux ajoutés (camion à 4 essieux et plus, remorque…)
  const extraAxles = data.pneus?.essieux ?? [];
  const setAxles = (axles: NonNullable<NonNullable<InspectionData['pneus']>['essieux']>) =>
    update((current) => ({ ...current, pneus: { ...current.pneus, essieux: axles } }));
  const setAxle = (index: number, patch: { taille?: string; etat?: string }) =>
    setAxles(extraAxles.map((axle, at) => (at === index ? { ...axle, ...patch } : axle)));

  const tireRow = (
    id: string,
    label: string,
    tire: { taille?: string | undefined; etat?: string | undefined },
    onState: (value: string) => void,
    onSize: (value: string) => void,
    onRemove?: () => void,
  ) => {
    const state = tire.etat;
    // Pneus à changer (50 % ou HS) : la taille est obligatoire pour les commander.
    const sizeMissing = (state === '50' || state === 'HS') && !tire.taille?.trim();
    const errorId = `tire-${id}-error`;
    return (
      <ChipRow
        key={id}
        label={label}
        options={WEAR_OPTIONS}
        value={state}
        disabled={locked}
        onChange={onState}
        action={
          onRemove && !locked ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-auto! min-h-[38px] w-12! shrink-0"
              aria-label={`Retirer : ${label}`}
              onClick={onRemove}
            >
              <X className="size-5" />
            </Button>
          ) : undefined
        }
      >
        <Input
          id={`tire-${id}_taille`}
          inputMode="decimal"
          placeholder="315/70/22.5"
          aria-label={`Taille ${label.toLowerCase()}`}
          aria-invalid={sizeMissing && !locked ? true : undefined}
          aria-describedby={sizeMissing && !locked ? errorId : undefined}
          disabled={locked}
          value={tire.taille ?? ''}
          onChange={(event) => onSize(formatTireSize(event.target.value))}
        />
        {sizeMissing && !locked && (
          <p id={errorId} className="err">
            Taille obligatoire : pneus à {state === 'HS' ? 'HS' : '50 %'}.
          </p>
        )}
      </ChipRow>
    );
  };

  const setFluid = (key: FluidKey, patch: { etat?: string; litres?: string }) =>
    update((current) => ({
      ...current,
      niveaux: { ...current.niveaux, [key]: { ...current.niveaux?.[key], ...patch } },
    }));

  return (
    <section
      data-slot="card"
      className={cn('card sec gap-3.5!', locked && 'opacity-70')}
      aria-labelledby="tech-inspection"
    >
      <div className="col gap-1">
        <h2 className="sec-t" id="tech-inspection">
          Fiche de contrôle véhicule
        </h2>
        <span className="hint">
          {save.isPending
            ? 'Enregistrement…'
            : 'Enregistrée automatiquement. HS ou 50 % ajoute la réparation à prévoir.'}
        </span>
      </div>
      {required && (
        <p className={cn('alert', missingPoints ? 's-warn' : 's-ok')} role="status">
          {missingPoints
            ? `Fiche complète exigée par la direction : ${missingPoints} point${missingPoints > 1 ? 's' : ''} OK / 50 % / HS à renseigner.`
            : 'Fiche complète exigée par la direction : tous les points sont renseignés.'}
        </p>
      )}

      {wearFieldsFor(vehicleType).map(([key, label]) => (
        <ChipRow
          key={key}
          label={label}
          options={WEAR_OPTIONS}
          value={data.usure?.[key]}
          disabled={locked}
          onChange={(value) => setIn('usure', key, value)}
        />
      ))}

      {tireAxlesFor(data).map(([side, label]) =>
        tireRow(
          side,
          label,
          { taille: data.pneus?.[`${side}_taille`], etat: data.pneus?.[`${side}_etat`] },
          (value) => setIn('pneus', `${side}_etat`, value),
          (value) => setIn('pneus', `${side}_taille`, value),
        ),
      )}
      {extraAxles.map((axle, index) =>
        tireRow(
          `essieu-${index + 3}`,
          extraAxleLabel(index),
          axle,
          (value) => setAxle(index, { etat: value }),
          (value) => setAxle(index, { taille: value }),
          () => setAxles(extraAxles.filter((_, at) => at !== index)),
        ),
      )}
      {!locked && canAddAxles(vehicleType) && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setAxles([...extraAxles, {}])}
        >
          <Plus /> Ajouter un essieu
        </Button>
      )}

      {CHECK_FIELDS.map(([key, label]) => {
        const taken = photoLabels.includes(label);
        const photoRequired = key === 'hayon' && data.controles?.hayon === 'HS' && !taken && !locked;
        return (
          <ChipRow
            key={key}
            label={label}
            options={OK_HS_OPTIONS}
            value={data.controles?.[key]}
            disabled={locked}
            onChange={(value) => setIn('controles', key, value)}
            action={
              (CHECK_PHOTO_FIELDS as readonly string[]).includes(key) && !locked ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={cn(
                    'h-auto! min-h-[38px] w-12! shrink-0',
                    taken && 'text-success',
                    photoRequired && 'border-destructive text-destructive',
                  )}
                  aria-label={`Photo de l’étiquette « ${label} »${taken ? ' (déjà prise)' : ''}`}
                  disabled={capture.uploadingLabel === label}
                  onClick={() => capture.openCamera(label)}
                >
                  <Camera className="size-5" />
                </Button>
              ) : undefined
            }
          >
            {photoRequired && <p className="err">Étiquette HS : photo obligatoire avant de terminer l’OR.</p>}
          </ChipRow>
        );
      })}

      <div className="col gap-1.5">
        <span className="lbl">Voyants allumés</span>
        <div className="row wrap gap-1.5">
          {WARNING_LIGHT_FIELDS.map(([key, label]) => {
            const on = Boolean(data.voyants?.[key]);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                disabled={locked}
                onClick={() => setIn('voyants', key, !on)}
                className={cn('chip', on && 'on')}
              >
                {label}
              </button>
            );
          })}
        </div>
        <Input
          id="other-lights"
          aria-label="Autres voyants"
          placeholder="Autres voyants"
          disabled={locked}
          value={data.voyants_autres ?? ''}
          onChange={(event) => update((current) => ({ ...current, voyants_autres: event.target.value }))}
        />
      </div>

      <ChipRow
        label="Problème électrique constaté"
        options={YES_NO_OPTIONS}
        value={data.probleme_electrique}
        disabled={locked}
        onChange={(value) => update((current) => ({ ...current, probleme_electrique: value }))}
      />

      {/* Niveaux : en fin de fiche, vérifiés une fois le reste contrôlé */}
      {FLUID_FIELDS.map(([key, label]) => {
        const fluid = data.niveaux?.[key];
        return (
          <ChipRow
            key={key}
            label={label}
            options={FLUID_OPTIONS}
            value={fluid?.etat}
            disabled={locked}
            onChange={(value) => setFluid(key, { etat: value })}
          >
            {fluid?.etat === 'manque' && (
              <Input
                type="number"
                step="0.5"
                min="0"
                inputMode="decimal"
                placeholder="Litres ajoutés"
                aria-label={`${label} : litres ajoutés`}
                disabled={locked}
                value={fluid.litres ?? ''}
                onChange={(event) => setFluid(key, { litres: event.target.value })}
              />
            )}
          </ChipRow>
        );
      })}
      {tailgateScan && (
        <TailgateLabelDialog
          key={tailgateScan}
          fileId={tailgateScan}
          repairOrderId={repairOrderId}
          vehicleId={vehicleId}
          onApply={(verdict) => setIn('controles', 'hayon', verdict)}
          onClose={() => onTailgateScanDone?.()}
        />
      )}
    </section>
  );
}
