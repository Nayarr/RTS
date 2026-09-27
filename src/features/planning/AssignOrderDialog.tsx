import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormField } from '@/components/FormField';
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
import { updateRepairOrder } from '@/features/repair-orders/api';
import type { PlanningTechnician } from './api';
import { dayLabel } from './domain';
import { usePlannableOrders, usePlanningMutation } from './hooks';
import { assignOrderSchema, type AssignOrderValues } from './schemas';

const selectClass = 'h-11 w-full rounded-md border bg-transparent px-3 text-base';

interface AssignOrderDialogProps {
  date: string;
  technicians: PlanningTechnician[];
  /** Technicien de la colonne cliquée (vue jour). */
  technicianId?: string | undefined;
  onClose: () => void;
}

/** Placer un OR au planning : jour, technicien, heures de début et de fin. */
export function AssignOrderDialog({ date, technicians, technicianId, onClose }: AssignOrderDialogProps) {
  const orders = usePlannableOrders(true);
  const technician = technicians.find((item) => item.id === technicianId);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AssignOrderValues>({
    resolver: zodResolver(assignOrderSchema),
    defaultValues: {
      repair_order_id: '',
      technician_id: technicianId ?? '',
      planned_start: '09:00',
      planned_end: '10:00',
    },
  });

  const assign = usePlanningMutation(
    (values: AssignOrderValues) =>
      updateRepairOrder(values.repair_order_id, {
        technician_id: values.technician_id,
        planned_date: date,
        planned_start: values.planned_start,
        planned_end: values.planned_end,
      }),
    'OR planifié',
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assigner un OR</DialogTitle>
          <DialogDescription>
            {dayLabel(date)}
            {technician ? ` — ${technician.display_name}` : ''}
          </DialogDescription>
        </DialogHeader>
        <form
          id="assign-order-form"
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((values) => assign.mutate(values, { onSuccess: onClose }))}
        >
          <div className="space-y-2">
            <Label htmlFor="assign-order">Ordre de réparation</Label>
            <select
              id="assign-order"
              className={selectClass}
              disabled={orders.isPending}
              aria-invalid={errors.repair_order_id ? true : undefined}
              {...register('repair_order_id')}
            >
              <option value="">{orders.isPending ? 'Chargement…' : '— Choisir un OR —'}</option>
              {(orders.data ?? []).map((order) => (
                <option key={order.id} value={order.id}>
                  {order.number} — {order.plate}
                  {order.client_name ? ` — ${order.client_name}` : ''}
                </option>
              ))}
            </select>
            {errors.repair_order_id && (
              <p className="text-sm text-destructive">{errors.repair_order_id.message}</p>
            )}
          </div>
          {!technician && (
            <div className="space-y-2">
              <Label htmlFor="assign-technician">Technicien</Label>
              <select
                id="assign-technician"
                className={selectClass}
                aria-invalid={errors.technician_id ? true : undefined}
                {...register('technician_id')}
              >
                <option value="">— Choisir —</option>
                {technicians.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.display_name}
                  </option>
                ))}
              </select>
              {errors.technician_id && (
                <p className="text-sm text-destructive">{errors.technician_id.message}</p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField
              id="assign-start"
              label="Heure de début"
              type="time"
              error={errors.planned_start?.message}
              {...register('planned_start')}
            />
            <FormField
              id="assign-end"
              label="Heure de fin"
              type="time"
              error={errors.planned_end?.message}
              {...register('planned_end')}
            />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="assign-order-form" disabled={assign.isPending}>
            Assigner au planning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
