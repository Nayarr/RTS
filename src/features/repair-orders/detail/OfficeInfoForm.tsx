import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormField } from '@/components/FormField';
import { SectionCard } from '@/components/SectionCard';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { pickDirty } from '@/lib/forms';
import type { TablesUpdate } from '@/types/database';
import { updateRepairOrder, type RepairOrderOverview } from '../api';
import { STATUS_META, STATUS_ORDER, VEHICLE_TYPES } from '../constants';
import { useActiveTechnicians, useRepairOrderMutation } from '../hooks';
import { editRepairOrderSchema, type EditRepairOrderValues } from '../schemas';

const UNASSIGNED = 'none';
const hhmm = (time: string | null) => time?.slice(0, 5) ?? '';

const toForm = (order: RepairOrderOverview): EditRepairOrderValues => ({
  requested_work: order.requested_work,
  vehicle_type: order.vehicle_type,
  mileage: order.mileage === null ? '' : String(order.mileage),
  planned_date: order.planned_date ?? '',
  planned_start: hhmm(order.planned_start),
  planned_end: hhmm(order.planned_end),
  technician_id: order.technician_id ?? '',
  status: order.status,
});

/** Conversion vers la table (champs modifiés uniquement) : champs vides → null. */
function toPatch({
  mileage,
  planned_date,
  planned_start,
  planned_end,
  technician_id,
  ...rest
}: Partial<EditRepairOrderValues>) {
  const patch: TablesUpdate<'repair_orders'> = rest;
  if (mileage !== undefined) patch.mileage = mileage ? Number(mileage) : null;
  if (planned_date !== undefined) patch.planned_date = planned_date || null;
  if (planned_start !== undefined) patch.planned_start = planned_start || null;
  if (planned_end !== undefined) patch.planned_end = planned_end || null;
  if (technician_id !== undefined) patch.technician_id = technician_id || null;
  return patch;
}

/** Informations de l'OR modifiables par le bureau (tâche, planning, technicien, statut). */
export function OfficeInfoForm({ order }: { order: RepairOrderOverview }) {
  const technicians = useActiveTechnicians();
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<EditRepairOrderValues>({ resolver: zodResolver(editRepairOrderSchema), values: toForm(order) });

  const save = useRepairOrderMutation(
    (values: EditRepairOrderValues) => updateRepairOrder(order.id, toPatch(pickDirty(values, dirtyFields))),
    'OR mis à jour',
  );

  // « Facturé » n'est posé que par l'émission de la facture.
  const statuses = STATUS_ORDER.filter((status) => status !== 'invoiced' || order.status === 'invoiced');

  return (
    <SectionCard
      id="repair-order-info"
      title="Informations OR"
      description="Tâche demandée, planning et affectation. L’atelier voit les changements immédiatement."
      onSubmit={handleSubmit((values) => save.mutate(values))}
      dirty={isDirty}
      pending={save.isPending}
      onCancel={() => reset()}
    >
      <div className="space-y-2">
        <Label htmlFor="edit-requested_work">Tâche à faire</Label>
        <Textarea
          id="edit-requested_work"
          rows={3}
          className="text-base"
          aria-invalid={errors.requested_work ? true : undefined}
          {...register('requested_work')}
        />
        {errors.requested_work && <p className="text-sm text-destructive">{errors.requested_work.message}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name="status"
          render={({ field }) => (
            <div className="space-y-2">
              <Label htmlFor="edit-status">Statut</Label>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={order.status === 'invoiced'}
              >
                <SelectTrigger id="edit-status" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_META[status].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        />
        <Controller
          control={control}
          name="technician_id"
          render={({ field }) => (
            <div className="space-y-2">
              <Label htmlFor="edit-technician">Technicien assigné</Label>
              <Select
                value={field.value || UNASSIGNED}
                onValueChange={(value) => field.onChange(value === UNASSIGNED ? '' : value)}
              >
                <SelectTrigger id="edit-technician" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>— Non assigné —</SelectItem>
                  {(technicians.data ?? []).map((technician) => (
                    <SelectItem key={technician.id} value={technician.id}>
                      {technician.display_name}
                    </SelectItem>
                  ))}
                  {/* Technicien désactivé depuis : reste affiché tant qu'il est assigné. */}
                  {order.technician_id &&
                    !technicians.data?.some((technician) => technician.id === order.technician_id) && (
                      <SelectItem value={order.technician_id}>
                        {order.technician_name ?? 'Ancien technicien'}
                      </SelectItem>
                    )}
                </SelectContent>
              </Select>
            </div>
          )}
        />
        <Controller
          control={control}
          name="vehicle_type"
          render={({ field }) => (
            <div className="space-y-2">
              <Label htmlFor="edit-vehicle_type">Type de véhicule</Label>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="edit-vehicle_type" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(VEHICLE_TYPES).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        />
        <FormField
          id="edit-mileage"
          label="Kilométrage"
          inputMode="numeric"
          error={errors.mileage?.message}
          {...register('mileage')}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <FormField id="edit-planned_date" label="Date prévue" type="date" {...register('planned_date')} />
        <FormField
          id="edit-planned_start"
          label="Heure de début"
          type="time"
          {...register('planned_start')}
        />
        <FormField
          id="edit-planned_end"
          label="Heure de fin prévue"
          type="time"
          error={errors.planned_end?.message}
          {...register('planned_end')}
        />
      </div>
    </SectionCard>
  );
}
