import { useEffect, useId, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CHECK_FIELDS,
  CHECK_PHOTO_FIELDS,
  FLUID_FIELDS,
  OK_HS_OPTIONS,
  WARNING_LIGHT_FIELDS,
  WEAR_FIELDS,
  WEAR_OPTIONS,
  YES_NO_OPTIONS,
  type ChipOption,
  type FluidKey,
  type InspectionData,
} from '@/features/repair-orders/inspection';
import { cn } from '@/lib/utils';
import { saveInspection } from '../api';
import { useWorkshopMutation } from '../hooks';
import type { PhotoCapture } from './use-photo-capture';

const SAVE_DELAY_MS = 600;

function ChipRow({
  label,
  options,
  value,
  onChange,
  disabled,
  extra,
  children,
}: {
  label: string;
  options: ChipOption[];
  value: string | undefined;
  onChange: (value: string) => void;
  disabled: boolean;
  extra?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const labelId = useId();
  return (
    <div className="col gap-1.5">
      <div className="row between gap-2">
        <span id={labelId} className="lbl">
          {label}
        </span>
        {extra}
      </div>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="lvl"
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
              className={cn(selected && 'on')}
              // Un second appui sur la valeur choisie l'efface.
              onClick={() => onChange(selected ? '' : option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {children}
    </div>
  );
}

const FLUID_OPTIONS: ChipOption[] = [
  { value: 'bon', label: 'Niveau bon', color: '' },
  { value: 'manque', label: 'Manque — appoint fait', color: '' },
];

/** Taille de pneu au format « 315/70/22.5 » pendant la saisie. */
function formatTireSize(value: string) {
  const digits = value.replace(/[^\d.,]/g, '').replace(',', '.');
  const parts = [digits.slice(0, 3), digits.slice(3, 5), digits.slice(5, 9)].filter(Boolean);
  return parts.join('/');
}

/** Fiche de contrôle véhicule, enregistrée automatiquement. */
export function InspectionEditor({
  repairOrderId,
  initial,
  capture,
  locked,
}: {
  repairOrderId: string;
  initial: InspectionData | null;
  capture: PhotoCapture;
  locked: boolean;
}) {
  const [data, setData] = useState<InspectionData>(initial ?? {});
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

      {WEAR_FIELDS.map(([key, label]) => (
        <ChipRow
          key={key}
          label={label}
          options={WEAR_OPTIONS}
          value={data.usure?.[key]}
          disabled={locked}
          onChange={(value) => setIn('usure', key, value)}
        />
      ))}

      {(
        [
          ['avant', 'Pneus avant'],
          ['arriere', 'Pneus arrière'],
        ] as const
      ).map(([side, label]) => (
        <ChipRow
          key={side}
          label={label}
          options={WEAR_OPTIONS}
          value={data.pneus?.[`${side}_etat`]}
          disabled={locked}
          onChange={(value) => setIn('pneus', `${side}_etat`, value)}
        >
          <Input
            id={`tire-${side}_taille`}
            inputMode="decimal"
            placeholder="315/70/22.5"
            aria-label={`Taille ${label.toLowerCase()}`}
            disabled={locked}
            value={data.pneus?.[`${side}_taille`] ?? ''}
            onChange={(event) => setIn('pneus', `${side}_taille`, formatTireSize(event.target.value))}
          />
        </ChipRow>
      ))}

      {CHECK_FIELDS.map(([key, label]) => (
        <ChipRow
          key={key}
          label={label}
          options={OK_HS_OPTIONS}
          value={data.controles?.[key]}
          disabled={locked}
          onChange={(value) => setIn('controles', key, value)}
          extra={
            (CHECK_PHOTO_FIELDS as readonly string[]).includes(key) && !locked ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Photo de l’étiquette « ${label} »`}
                onClick={() => capture.openCamera(label)}
              >
                <Camera /> Étiquette
              </Button>
            ) : undefined
          }
        />
      ))}

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
    </section>
  );
}
