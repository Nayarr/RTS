import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pickDirty } from '@/lib/forms';
import { FormField } from '@/components/FormField';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { updateAppSettings, type AppSettings } from './api';
import { useSaveSettings } from './hooks';
import { workshopSchema, workshopToForm, type WorkshopValues } from './schemas';
import { SectionCard } from '@/components/SectionCard';

const TIME_FIELDS: { name: keyof WorkshopValues; label: string }[] = [
  { name: 'workday_start', label: 'Ouverture' },
  { name: 'lunch_start', label: 'Début de pause' },
  { name: 'friday_lunch_start', label: 'Pause du vendredi' },
  { name: 'lunch_end', label: 'Fin de pause' },
  { name: 'workday_end', label: 'Fermeture' },
  { name: 'overtime_start', label: 'Heures sup. dès' },
  { name: 'expected_arrival', label: 'Arrivée attendue' },
  { name: 'late_tolerance', label: 'Retard après' },
];

const MONEY_FIELDS: { name: keyof WorkshopValues; label: string }[] = [
  { name: 'roadside_flat_fee', label: 'Forfait déplacement (€ HT)' },
  { name: 'roadside_price_per_km', label: 'Prix au km (€ HT)' },
  { name: 'roadside_travel_hourly_rate', label: 'Taux horaire du trajet (€ HT/h)' },
];

/** Horaires de l'atelier, pointage et dépannage. */
export function WorkshopForm({ app }: { app: AppSettings }) {
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<WorkshopValues>({ resolver: zodResolver(workshopSchema), values: workshopToForm(app) });

  const save = useSaveSettings(
    (values: WorkshopValues) => updateAppSettings(pickDirty(values, dirtyFields)),
    'Réglages de l’atelier enregistrés',
  );

  return (
    <SectionCard
      id="workshop-form"
      title="Atelier"
      description="Horaires utilisés par le planning, le pointage et le relevé d’heures ; tarifs du dépannage."
      onSubmit={handleSubmit((values) => save.mutate(values))}
      dirty={isDirty}
      pending={save.isPending}
      onCancel={() => reset()}
    >
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Horaires</legend>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {TIME_FIELDS.map(({ name, label }) => (
            <FormField
              key={name}
              id={name}
              label={label}
              type="time"
              error={errors[name]?.message}
              {...register(name)}
            />
          ))}
          <FormField
            id="daily_hours"
            label="Heures par jour"
            type="number"
            step="0.25"
            inputMode="decimal"
            error={errors.daily_hours?.message}
            {...register('daily_hours', { valueAsNumber: true })}
          />
          <FormField
            id="friday_hours"
            label="Heures le vendredi"
            type="number"
            step="0.25"
            inputMode="decimal"
            error={errors.friday_hours?.message}
            {...register('friday_hours', { valueAsNumber: true })}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Dépannage</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          {MONEY_FIELDS.map(({ name, label }) => (
            <FormField
              key={name}
              id={name}
              label={label}
              type="number"
              step="0.01"
              inputMode="decimal"
              error={errors[name]?.message}
              {...register(name, { valueAsNumber: true })}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Pointage et saisie</legend>
        <Controller
          control={control}
          name="clock_photo_retention_months"
          render={({ field }) => (
            <div className="space-y-2">
              <Label htmlFor="clock_photo_retention_months">Conservation des photos de pointage</Label>
              <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}>
                <SelectTrigger id="clock_photo_retention_months" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 3, 6, 12].map((months) => (
                    <SelectItem key={months} value={String(months)}>
                      {months} mois
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        />
        <Controller
          control={control}
          name="label_scan_enabled"
          render={({ field }) => (
            <div className="flex items-center gap-3">
              <Switch id="label_scan_enabled" checked={field.value} onCheckedChange={field.onChange} />
              <Label htmlFor="label_scan_enabled">Lecture automatique des étiquettes de pièces (photo)</Label>
            </div>
          )}
        />
      </fieldset>
    </SectionCard>
  );
}
