import { useEffect, useId, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
}: {
  label: string;
  options: ChipOption[];
  value: string | undefined;
  onChange: (value: string) => void;
  disabled: boolean;
  extra?: React.ReactNode;
}) {
  const labelId = useId();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-0">
      <span id={labelId} className="text-base">
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <div role="radiogroup" aria-labelledby={labelId} className="flex gap-1.5">
          {options.map((option) => {
            const selected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                // Un second appui sur la valeur choisie l'efface.
                onClick={() => onChange(selected ? '' : option.value)}
                className="min-w-12 rounded-md border px-3 py-2 text-sm font-bold transition disabled:opacity-50"
                style={
                  selected
                    ? { backgroundColor: option.color, borderColor: option.color, color: '#fff' }
                    : undefined
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {extra}
      </div>
    </div>
  );
}

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
    <Card className={cn(locked && 'opacity-70')}>
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl font-bold">Fiche de contrôle véhicule</h2>
        </CardTitle>
        <CardDescription>
          {save.isPending
            ? 'Enregistrement…'
            : 'Enregistrée automatiquement. HS ou 50 % ajoute la réparation à prévoir.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
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
        </section>

        <section className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['avant_taille', 'Taille pneus avant'],
                ['arriere_taille', 'Taille pneus arrière'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`tire-${key}`}>{label}</Label>
                <Input
                  id={`tire-${key}`}
                  inputMode="decimal"
                  placeholder="315/70/22.5"
                  className="h-11"
                  disabled={locked}
                  value={data.pneus?.[key] ?? ''}
                  onChange={(event) => setIn('pneus', key, formatTireSize(event.target.value))}
                />
              </div>
            ))}
          </div>
          <ChipRow
            label="Pneus avant"
            options={WEAR_OPTIONS}
            value={data.pneus?.avant_etat}
            disabled={locked}
            onChange={(value) => setIn('pneus', 'avant_etat', value)}
          />
          <ChipRow
            label="Pneus arrière"
            options={WEAR_OPTIONS}
            value={data.pneus?.arriere_etat}
            disabled={locked}
            onChange={(value) => setIn('pneus', 'arriere_etat', value)}
          />
        </section>

        <section>
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
                    variant="ghost"
                    size="icon"
                    aria-label={`Photo de l’étiquette « ${label} »`}
                    onClick={() => capture.openCamera(label)}
                  >
                    <Camera />
                  </Button>
                ) : undefined
              }
            />
          ))}
          <ChipRow
            label="Problème électrique constaté"
            options={YES_NO_OPTIONS}
            value={data.probleme_electrique}
            disabled={locked}
            onChange={(value) => update((current) => ({ ...current, probleme_electrique: value }))}
          />
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Voyants allumés</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {WARNING_LIGHT_FIELDS.map(([key, label]) => {
              const on = Boolean(data.voyants?.[key]);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  disabled={locked}
                  onClick={() => setIn('voyants', key, !on)}
                  className={cn(
                    'rounded-md border px-3 py-3 text-sm font-semibold transition disabled:opacity-50',
                    on ? 'border-destructive bg-destructive text-white' : 'hover:bg-muted',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="other-lights">Autres voyants</Label>
            <Input
              id="other-lights"
              className="h-11"
              disabled={locked}
              value={data.voyants_autres ?? ''}
              onChange={(event) => update((current) => ({ ...current, voyants_autres: event.target.value }))}
            />
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          {FLUID_FIELDS.map(([key, label]) => {
            const fluid = data.niveaux?.[key];
            return (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`fluid-${key}`}>{label}</Label>
                <select
                  id={`fluid-${key}`}
                  className="h-11 w-full rounded-md border bg-transparent px-3 text-base disabled:opacity-50"
                  disabled={locked}
                  value={fluid?.etat ?? ''}
                  onChange={(event) => setFluid(key, { etat: event.target.value })}
                >
                  <option value="">—</option>
                  <option value="bon">Niveau bon</option>
                  <option value="manque">Manque — appoint fait</option>
                </select>
                {fluid?.etat === 'manque' && (
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    inputMode="decimal"
                    placeholder="Litres ajoutés"
                    aria-label={`${label} : litres ajoutés`}
                    className="h-11"
                    disabled={locked}
                    value={fluid.litres ?? ''}
                    onChange={(event) => setFluid(key, { litres: event.target.value })}
                  />
                )}
              </div>
            );
          })}
        </section>
      </CardContent>
    </Card>
  );
}
