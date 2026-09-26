import {
  Controller,
  type Control,
  type FieldErrors,
  type FieldValues,
  type Path,
  type UseFormRegister,
} from 'react-hook-form';
import { Check } from 'lucide-react';
import { FormField } from '@/components/FormField';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { TECHNICIAN_COLORS } from './schemas';

interface TechnicianFieldValues extends FieldValues {
  is_technician: boolean;
  display_name: string;
  color: string | null;
}

interface TechnicianFieldsProps<T extends TechnicianFieldValues> {
  control: Control<T>;
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  isTechnician: boolean;
  /** Rôle Technicien : la fiche est obligatoire, la case est donc verrouillée. */
  locked: boolean;
}

/** Fiche technicien (partagée par la création et la modification d'un compte). */
export function TechnicianFields<T extends TechnicianFieldValues>({
  control,
  register,
  errors,
  isTechnician,
  locked,
}: TechnicianFieldsProps<T>) {
  const displayNameError = errors.display_name?.message;

  return (
    <fieldset className="space-y-4 rounded-lg border p-4">
      <Controller
        control={control}
        name={'is_technician' as Path<T>}
        render={({ field }) => (
          <div className="flex items-start gap-3">
            <Checkbox
              id="is_technician"
              checked={field.value}
              disabled={locked}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="is_technician">Intervient à l’atelier (fiche technicien)</Label>
              <p className="text-xs text-muted-foreground">
                Apparaît au planning, reçoit des OR et pointe sur la borne.
              </p>
            </div>
          </div>
        )}
      />

      {isTechnician && (
        <>
          <FormField
            id="display_name"
            label="Nom affiché au planning"
            placeholder="Ex. : Karim"
            error={typeof displayNameError === 'string' ? displayNameError : undefined}
            {...register('display_name' as Path<T>)}
          />
          <Controller
            control={control}
            name={'color' as Path<T>}
            render={({ field }) => (
              <div className="space-y-2">
                <Label id="color-label">Couleur au planning</Label>
                <div role="radiogroup" aria-labelledby="color-label" className="flex flex-wrap gap-2">
                  {TECHNICIAN_COLORS.map((color) => {
                    const selected = field.value === color;
                    return (
                      <button
                        key={color}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={`Couleur ${color}`}
                        onClick={() => field.onChange(color)}
                        className={cn(
                          'flex size-9 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition',
                          selected && 'ring-2 ring-ring',
                        )}
                        style={{ backgroundColor: color }}
                      >
                        {selected && <Check className="size-4 text-white" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          />
        </>
      )}
    </fieldset>
  );
}
