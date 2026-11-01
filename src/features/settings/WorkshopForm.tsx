import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pickDirty } from '@/lib/forms';
import { FormField } from '@/components/FormField';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { updateAppSettings, type AppSettings } from './api';
import { useSaveSettings } from './hooks';
import { workshopSchema, workshopToForm, type WorkshopValues } from './schemas';
import { SectionCard } from '@/components/SectionCard';
import { VoiceSettings } from './VoiceSettings';

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

/** Dépannage : distance aller-retour de chaque zone, forfait, temps de trajet compris. */
const ZONE_FIELDS: {
  label: string;
  km: keyof WorkshopValues;
  price: keyof WorkshopValues;
  minutes: keyof WorkshopValues;
}[] = [
  {
    label: 'Zone 1 (proximité)',
    km: 'roadside_zone1_max_km',
    price: 'roadside_flat_fee',
    minutes: 'roadside_zone1_max_minutes',
  },
  {
    label: 'Zone 2',
    km: 'roadside_zone2_max_km',
    price: 'roadside_zone2_price',
    minutes: 'roadside_zone2_max_minutes',
  },
  {
    label: 'Zone 3',
    km: 'roadside_zone3_max_km',
    price: 'roadside_zone3_price',
    minutes: 'roadside_zone3_max_minutes',
  },
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
  const [ttsProvider, ttsVoice, ttsLimit] = useWatch({
    control,
    name: ['tts_provider', 'tts_voice', 'tts_monthly_limit'],
  });

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
          <FormField
            id="saturday_hours"
            label="Heures le samedi"
            type="number"
            step="0.25"
            inputMode="decimal"
            className="num"
            error={errors.saturday_hours?.message}
            {...register('saturday_hours', { valueAsNumber: true })}
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
                  Agent Direction
                </Label>
                <span className="hint">
                  Menu « Agent Direction » : la direction pose ses questions à la voix ou à l’écrit (chiffre
                  d’affaires, impayés, planning…) et l’assistant répond. Il lit les données, ne modifie rien.
                </span>
              </span>
            </div>
          )}
        />
        <div className="field">
          <Label htmlFor="agent_memo">Mémo pour l’Agent Direction</Label>
          <Textarea
            id="agent_memo"
            rows={4}
            maxLength={4000}
            placeholder={'Karim est chef d’atelier.\nQuand je dis « Martin », c’est BTP Martin Location.'}
            aria-invalid={errors.agent_memo ? true : undefined}
            aria-describedby="agent_memo-hint"
            {...register('agent_memo')}
          />
          <span id="agent_memo-hint" className="hint">
            Ce que l’agent doit savoir sur l’atelier en plus de sa fiche : rôles, surnoms de clients,
            habitudes. Ajouté à ses consignes à chaque question (4 000 caractères au plus).
          </span>
          {errors.agent_memo && <p className="err">{errors.agent_memo.message}</p>}
        </div>
        <VoiceSettings
          control={control}
          register={register}
          provider={ttsProvider}
          voice={ttsVoice}
          limit={ttsLimit}
          error={errors.tts_monthly_limit?.message}
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
        <Controller
          control={control}
          name="auto_mails_enabled"
          render={({ field }) => (
            <div className="row gap-3 rounded-xl border px-3.5 py-3">
              <Switch id="auto_mails_enabled" checked={field.value} onCheckedChange={field.onChange} />
              <span className="col gap-0">
                <Label htmlFor="auto_mails_enabled" className="text-sm font-bold">
                  Rappels et échéances envoyés automatiquement
                </Label>
                <span className="hint">
                  Rappel du rendez-vous la veille ; 48 h avant un contrôle technique, hayon ou antipollution
                  et quand l’entretien d’un contrat est à refaire, un e-mail avec un lien pour prendre
                  rendez-vous en ligne. Avec l’envoi depuis l’appli activé.
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
        <p className="hint">
          Distance aller-retour depuis l’atelier. Au-delà de la zone 3, le prix du déplacement se saisit à la
          main. Au-delà du temps de trajet de la zone (zone 1 sans tolérance), le temps de trajet est facturé
          : 1 h au moins, puis à la minute.
        </p>
        {ZONE_FIELDS.map((zone) => (
          <div key={zone.label} className="grid items-end gap-3.5 sm:grid-cols-[110px_1fr_1fr_1fr]">
            <span className="lbl pb-2.5">{zone.label}</span>
            <FormField
              id={zone.km}
              label="Jusqu’à (km, exclu sauf zone 3)"
              type="number"
              step="0.1"
              inputMode="decimal"
              className="num"
              error={errors[zone.km]?.message}
              {...register(zone.km, { valueAsNumber: true })}
            />
            <FormField
              id={zone.price}
              label="Forfait (€ HT)"
              type="number"
              step="0.01"
              inputMode="decimal"
              className="num"
              error={errors[zone.price]?.message}
              {...register(zone.price, { valueAsNumber: true })}
            />
            <FormField
              id={zone.minutes}
              label="Trajet compris (min)"
              type="number"
              step="1"
              inputMode="numeric"
              className="num"
              error={errors[zone.minutes]?.message}
              {...register(zone.minutes, { valueAsNumber: true })}
            />
          </div>
        ))}
        <div className="grid gap-3.5 sm:grid-cols-2">
          <FormField
            id="roadside_travel_hourly_rate"
            label="Taux horaire du trajet (€ HT/h)"
            type="number"
            step="0.01"
            inputMode="decimal"
            className="num"
            error={errors.roadside_travel_hourly_rate?.message}
            {...register('roadside_travel_hourly_rate', { valueAsNumber: true })}
          />
          <FormField
            id="roadside_tolerance_minutes"
            label="Tolérance des zones 2 et 3 (min)"
            type="number"
            step="1"
            inputMode="numeric"
            className="num"
            error={errors.roadside_tolerance_minutes?.message}
            {...register('roadside_tolerance_minutes', { valueAsNumber: true })}
          />
        </div>
      </fieldset>
    </SectionCard>
  );
}
