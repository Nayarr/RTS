import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { zodResolver } from '@hookform/resolvers/zod';
import { BellRing, CarFront } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormField } from '@/components/FormField';
import { SendLinkDialog } from '@/components/SendLinkDialog';
import { SuggestField } from '@/components/SuggestField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { fetchClientContact, updateClientContact } from '@/features/documents/client-contact';
import { formatPlate, VEHICLE_TYPES } from '@/features/repair-orders/constants';
import { useActiveTechnicians, useKnownVehicle } from '@/features/repair-orders/hooks';
import { NewClientFields } from '@/features/repair-orders/NewClientFields';
import { useClientEntry } from '@/features/repair-orders/use-client-entry';
import { fetchSettings } from '@/features/settings/api';
import type { NewClientValues } from '@/features/customers/domain';
import type { ContactValues, SendLinkMessage } from '@/lib/send-links';
import {
  cancelAppointment,
  convertAppointment,
  markAppointmentReminded,
  saveAppointment,
  type Appointment,
} from './api';
import { appointmentReminderMessage } from './domain';
import { usePlanningMutation } from './hooks';
import {
  appointmentFromForm,
  appointmentSchema,
  appointmentToForm,
  type AppointmentPreset,
  type AppointmentValues,
} from './schemas';

const selectClass = 'inp';

interface Reminder {
  message: SendLinkMessage;
  senderEmail: string | null;
  contact: ContactValues;
}

interface AppointmentDialogProps {
  /** Rendez-vous ouvert, ou `null` pour en prendre un nouveau. */
  appointment: Appointment | null;
  /** Date (et technicien) proposés pour un nouveau rendez-vous. */
  preset?: AppointmentPreset | undefined;
  onClose: () => void;
}

/** Rendez-vous : saisie, arrivée du véhicule (création de l'OR), rappel au client, annulation. */
export function AppointmentDialog({ appointment, preset, onClose }: AppointmentDialogProps) {
  const navigate = useNavigate();
  const technicians = useActiveTechnicians();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    getFieldState,
    formState: { errors },
  } = useForm<AppointmentValues>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: appointmentToForm(appointment, preset),
  });
  const clientName = useWatch({ control, name: 'client_name' }) ?? '';
  const plate = useWatch({ control, name: 'plate' }) ?? '';
  const clientEntry = useClientEntry(clientName, { label: 'enregistrer le rendez-vous' });
  const knownVehicle = useKnownVehicle(plate).data ?? null;

  // Véhicule connu : type et client repris, sauf s'ils ont déjà été saisis.
  useEffect(() => {
    if (!knownVehicle) return;
    if (!getFieldState('vehicle_type').isDirty) setValue('vehicle_type', knownVehicle.vehicle_type);
    if (!getFieldState('client_name').isDirty && knownVehicle.client_name) {
      setValue('client_name', knownVehicle.client_name);
    }
  }, [knownVehicle, getFieldState, setValue]);

  const save = usePlanningMutation(
    ({ values, client }: { values: AppointmentValues; client: NewClientValues | null }) =>
      (client ? clientEntry.createNewClient(client) : Promise.resolve(values.client_name)).then((name) =>
        saveAppointment(appointment?.id ?? null, {
          ...appointmentFromForm({ ...values, client_name: name }),
          ...(preset?.maintenance_contract_id
            ? { maintenance_contract_id: preset.maintenance_contract_id }
            : {}),
        }),
      ),
    'Rendez-vous enregistré',
  );
  const convert = usePlanningMutation(
    (id: string) => convertAppointment(id),
    'OR créé depuis le rendez-vous',
  );
  const cancel = usePlanningMutation((id: string) => cancelAppointment(id), 'Rendez-vous annulé');
  const remind = usePlanningMutation(async (current: Appointment) => {
    await markAppointmentReminded(current.id);
    const [settings, contact] = await Promise.all([
      fetchSettings(),
      current.client_id
        ? fetchClientContact(current.client_id)
        : Promise.resolve({ email: null, phone: null }),
    ]);
    setReminder({
      message: appointmentReminderMessage(current, settings.company),
      senderEmail: settings.company.email,
      contact: { email: contact.email ?? '', phone: contact.phone ?? '' },
    });
  }, null);

  const saveContact = (contact: ContactValues) => {
    if (!appointment?.client_id) return;
    updateClientContact(appointment.client_id, {
      email: contact.email.trim() || null,
      phone: contact.phone.trim() || null,
    }).then(
      () => toast.success('Coordonnées du client enregistrées'),
      () => toast.error('Coordonnées non enregistrées'),
    );
  };

  if (reminder && appointment) {
    return (
      <SendLinkDialog
        title="Rappel du rendez-vous"
        intro="Message de rappel pré-rédigé avec la date, l’heure et l’adresse de l’atelier."
        message={reminder.message}
        senderEmail={reminder.senderEmail}
        mailCategory="workshop"
        contact={reminder.contact}
        onContactSave={saveContact}
        onClose={onClose}
      />
    );
  }

  const plateField = register('plate');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className={cn('max-h-[90dvh] overflow-y-auto sm:max-w-lg', clientEntry.isNewClient && 'sm:max-w-2xl')}
      >
        <DialogHeader>
          <DialogTitle>{appointment ? 'Rendez-vous' : 'Nouveau rendez-vous'}</DialogTitle>
          <DialogDescription>
            {appointment?.reminder_sent_at
              ? 'Rappel déjà envoyé au client.'
              : 'Client existant proposé pendant la saisie ; nouveau client : fiche à compléter.'}
          </DialogDescription>
        </DialogHeader>
        <form
          id="appointment-form"
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit(
            async (values) => {
              const result = await clientEntry.check(values.client_name);
              if (result.ok) save.mutate({ values, client: result.client }, { onSuccess: onClose });
            },
            () => {
              if (clientEntry.isNewClient) void clientEntry.form.trigger();
            },
          )}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem_7rem]">
            <Controller
              control={control}
              name="client_name"
              render={({ field }) => (
                <SuggestField
                  id="appointment-client"
                  label="Client"
                  placeholder="Nom du client / société"
                  error={errors.client_name?.message}
                  value={field.value ?? ''}
                  onBlur={field.onBlur}
                  onValueChange={field.onChange}
                  suggestions={clientEntry.suggestions.map((client) => ({
                    key: client.id,
                    label: client.name,
                  }))}
                  onPick={(item) => field.onChange(item.label)}
                />
              )}
            />
            <FormField
              id="appointment-plate"
              label="Immatriculation"
              autoComplete="off"
              className="uppercase"
              {...plateField}
              onChange={(event) => {
                setValue('plate', formatPlate(event.target.value));
              }}
            />
            <div className="space-y-2">
              <Label htmlFor="appointment-type">Type</Label>
              <select id="appointment-type" className={selectClass} {...register('vehicle_type')}>
                {Object.entries(VEHICLE_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {clientEntry.isNewClient && (
            <NewClientFields form={clientEntry.form} onKindChange={clientEntry.changeKind} />
          )}
          <div className="grid grid-cols-3 gap-3">
            <FormField
              id="appointment-date"
              label="Date"
              type="date"
              error={errors.scheduled_date?.message}
              {...register('scheduled_date')}
            />
            <FormField
              id="appointment-start"
              label="Heure"
              type="time"
              error={errors.start_time?.message}
              {...register('start_time')}
            />
            <FormField
              id="appointment-end"
              label="Fin prévue"
              type="time"
              error={errors.end_time?.message}
              {...register('end_time')}
            />
          </div>
          <FormField
            id="appointment-reason"
            label="Motif"
            placeholder="Ex : vidange + contrôle freinage"
            {...register('reason')}
          />
          <div className="space-y-2">
            <Label htmlFor="appointment-technician">Technicien (facultatif)</Label>
            <select id="appointment-technician" className={selectClass} {...register('technician_id')}>
              <option value="">À assigner</option>
              {(technicians.data ?? []).map((technician) => (
                <option key={technician.id} value={technician.id}>
                  {technician.display_name}
                </option>
              ))}
            </select>
          </div>
        </form>

        {appointment && (
          <div className="flex flex-col gap-2 border-t pt-4">
            <Button
              variant="outline"
              disabled={convert.isPending}
              onClick={() =>
                convert.mutate(appointment.id, { onSuccess: (orderId) => void navigate(`/or/${orderId}`) })
              }
            >
              <CarFront /> Le véhicule est arrivé : créer l’OR
            </Button>
            <Button variant="ghost" disabled={remind.isPending} onClick={() => remind.mutate(appointment)}>
              <BellRing /> Envoyer un rappel au client
            </Button>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {appointment ? (
            <Button variant="ghost" className="text-destructive" onClick={() => setConfirmCancel(true)}>
              Annuler le rendez-vous
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Fermer
            </Button>
            <Button type="submit" form="appointment-form" disabled={save.isPending}>
              {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
      {appointment && (
        <ConfirmDialog
          open={confirmCancel}
          onOpenChange={setConfirmCancel}
          title="Annuler ce rendez-vous ?"
          description="Il disparaîtra du planning et de la liste des rendez-vous."
          confirmLabel="Annuler le rendez-vous"
          destructive
          pending={cancel.isPending}
          onConfirm={() => cancel.mutate(appointment.id, { onSuccess: onClose })}
        />
      )}
    </Dialog>
  );
}
