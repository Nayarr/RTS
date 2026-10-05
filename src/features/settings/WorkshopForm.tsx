import { Controller, useForm, useWatch } from 'react-hook-form';
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

const HOUR_FIELDS: { name: keyof WorkshopValues; label: string }[] = [
  { name: 'workday_start', label: 'Ouverture' },
  { name: 'lunch_start', label: 'Début de pause' },
  { name: 'lunch_end', label: 'Fin de pause' },
  { name: 'workday_end', label: 'Fermeture' },
  { name: 'friday_lunch_start', label: 'Pause du vendredi' },
];

const CLOCK_FIELDS: { name: keyof WorkshopValues; label: string }[] = [
  { name: 'expected_arrival', label: 'Arrivée attendue' },
  { name: 'late_tolerance', label: 'Retard après' },
  { name: 'overtime_start', label: 'Heures sup. dès' },
];

const MAIL_FIELDS: {
  name: 'mail_billing_local' | 'mail_workshop_local' | 'mail_signature_local';
  label: string;
  hint: string;
}[] = [
  { name: 'mail_billing_local', label: 'Adresse facturation', hint: 'Devis, factures, contrats' },
  { name: 'mail_workshop_local', label: 'Adresse atelier', hint: 'Véhicule prêt, rappels' },
  { name: 'mail_signature_local', label: 'Adresse signature', hint: 'Liens de signature' },
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
  const mailDomain = useWatch({ control, name: 'mail_domain' });

  const save = useSaveSettings((values: WorkshopValues) => {
    const { mail_domain, ...patch } = pickDirty(values, dirtyFields);
    // Domaine vidé : retour à l'adresse unique réglée côté serveur
    return updateAppSettings(
      mail_domain === undefined ? patch : { ...patch, mail_domain: mail_domain || null },
    );
  }, 'Réglages de l’atelier enregistrés');

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
      <fieldset className="col gap-3">
        <legend className="mb-3 overline">Horaires</legend>
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          {HOUR_FIELDS.map(({ name, label }) => (
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
            className="num"
            error={errors.daily_hours?.message}
            {...register('daily_hours', { valueAsNumber: true })}
          />
          <FormField
            id="friday_hours"
            label="Heures le vendredi"
            type="number"
            step="0.25"
            inputMode="decimal"
            className="num"
            error={errors.friday_hours?.message}
            {...register('friday_hours', { valueAsNumber: true })}
          />
        </div>
      </fieldset>

      <fieldset className="col gap-3">
        <legend className="mb-3 overline">Pointage et saisie</legend>
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          {CLOCK_FIELDS.map(({ name, label }) => (
            <FormField
              key={name}
              id={name}
              label={label}
              type="time"
              error={errors[name]?.message}
              {...register(name)}
            />
          ))}
          <Controller
            control={control}
            name="clock_photo_retention_months"
            render={({ field }) => (
              <div className="field col-span-2 sm:col-span-1">
                <Label htmlFor="clock_photo_retention_months">Conservation des photos de pointage</Label>
                <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}>
                  <SelectTrigger id="clock_photo_retention_months" className="w-full">
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
        </div>
        <Controller
          control={control}
          name="label_scan_enabled"
          render={({ field }) => (
            <div className="row gap-3 rounded-xl border px-3.5 py-3">
              <Switch id="label_scan_enabled" checked={field.value} onCheckedChange={field.onChange} />
              <span className="col gap-0">
                <Label htmlFor="label_scan_enabled" className="text-sm font-bold">
                  Lecture automatique des étiquettes (photo)
                </Label>
                <span className="hint">
                  Le technicien photographie l’étiquette du contrôle hayon ou le contrôle technique : la
                  prochaine échéance (et le VIN du contrôle technique) est lue et proposée, il la vérifie
                  avant de valider.
                </span>
              </span>
            </div>
          )}
        />
        <Controller
          control={control}
          name="agent_enabled"
          render={({ field }) => (
            <div className="row gap-3 rounded-xl border px-3.5 py-3">
              <Switch id="agent_enabled" checked={field.value} onCheckedChange={field.onChange} />
              <span className="col gap-0">
                <Label htmlFor="agent_enabled" className="text-sm font-bold">
                  Assistant de la direction
                </Label>
                <span className="hint">
                  Pilotage › Assistant : la direction pose ses questions à la voix ou à l’écrit (chiffre
                  d’affaires, impayés, planning…) et l’assistant répond. Il lit les données, ne modifie rien.
                </span>
              </span>
            </div>
          )}
        />
      </fieldset>

      <fieldset className="col gap-3">
        <legend className="mb-3 overline">E-mails au client</legend>
        <Controller
          control={control}
          name="mail_send_enabled"
          render={({ field }) => (
            <div className="row gap-3 rounded-xl border px-3.5 py-3">
              <Switch id="mail_send_enabled" checked={field.value} onCheckedChange={field.onChange} />
              <span className="col gap-0">
                <Label htmlFor="mail_send_enabled" className="text-sm font-bold">
                  Envoyer les e-mails depuis l’appli
                </Label>
                <span className="hint">
                  Devis, factures, signatures, contrats et rappels partent en un clic, au nom de l’atelier,
                  avec le PDF joint. Sinon, l’appli ouvre ta messagerie avec le message prêt.
                </span>
              </span>
            </div>
          )}
        />
        <FormField
          id="mail_domain"
          label="Domaine d’envoi"
          placeholder="rapidtruckservice.fr"
          autoComplete="off"
          hint="Domaine vérifié chez Resend. Les réponses du client reviennent sur l’adresse qui a envoyé le message."
          error={errors.mail_domain?.message}
          {...register('mail_domain')}
        />
        <div className="grid gap-3.5 sm:grid-cols-3">
          {MAIL_FIELDS.map(({ name, label, hint }) => (
            <FormField
              key={name}
              id={name}
              label={label}
              hint={`${hint} · @${mailDomain || 'domaine'}`}
              autoComplete="off"
              error={errors[name]?.message}
              {...register(name)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="col gap-3">
        <legend className="mb-3 overline">Dépannage</legend>
        <div className="grid gap-3.5 sm:grid-cols-3">
          {MONEY_FIELDS.map(({ name, label }) => (
            <FormField
              key={name}
              id={name}
              label={label}
              type="number"
              step="0.01"
              inputMode="decimal"
              className="num"
              error={errors[name]?.message}
              {...register(name, { valueAsNumber: true })}
            />
          ))}
        </div>
      </fieldset>
    </SectionCard>
  );
}
