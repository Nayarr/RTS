import { Link } from 'react-router';
import { ChevronDown, LifeBuoy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { markRepairOrderSav, type RepairOrderOverview } from './api';
import { useActiveTechnicians, useRepairOrderMutation } from './hooks';
import { savPath } from './sav-rules';

/** Pastille violette « SAV » des OR de reprise. */
export function SavBadge({
  order,
  className,
}: {
  order: Pick<RepairOrderOverview, 'sav_of_repair_order_id' | 'sav_of_number'>;
  className?: string;
}) {
  if (!order.sav_of_repair_order_id) return null;
  return (
    <span
      className={cn('badge s-sav h-6 text-xs', className)}
      title={order.sav_of_number ? `SAV de ${order.sav_of_number}` : 'SAV'}
    >
      SAV
    </span>
  );
}

/** Bouton « SAV » (en haut à droite d'un OR ou d'une facture) : nouvel OR de reprise, gratuit pour le client. */
export function SavButton({ orders }: { orders: { id: string; number: string }[] }) {
  if (orders.length === 0) return null;
  if (orders.length === 1) {
    return (
      <Button variant="outline" asChild>
        <Link to={savPath(orders[0]!.id)} aria-label={`SAV de ${orders[0]!.number}`}>
          <LifeBuoy /> SAV
        </Link>
      </Button>
    );
  }
  // Facture groupée : choisir l'OR repris
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <LifeBuoy /> SAV <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {orders.map((order) => (
          <DropdownMenuItem key={order.id} asChild>
            <Link to={savPath(order.id)}>SAV de {order.number}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Choix du technicien responsable du SAV (celui dont le temps et les pièces comptent en performance). */
export function SavResponsibleSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string | null;
  onChange: (technicianId: string) => void;
  disabled?: boolean;
}) {
  const technicians = useActiveTechnicians();
  return (
    <div className="field">
      <Label htmlFor={id}>Responsable du SAV</Label>
      <Select value={value ?? ''} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full sm:w-64">
          <SelectValue placeholder="Choisir le technicien" />
        </SelectTrigger>
        <SelectContent>
          {(technicians.data ?? []).map((tech) => (
            <SelectItem key={tech.id} value={tech.id}>
              {tech.display_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Bandeau de la fiche d'un OR de SAV : OR d'origine, gratuité, responsable modifiable. */
export function SavCard({ order, canEdit }: { order: RepairOrderOverview; canEdit: boolean }) {
  const change = useRepairOrderMutation(
    (technicianId: string) => markRepairOrderSav(order.id, order.sav_of_repair_order_id!, technicianId),
    'Responsable du SAV enregistré',
  );
  if (!order.sav_of_repair_order_id) return null;
  return (
    <section
      data-slot="card"
      className="card sec row flex-wrap items-end justify-between gap-4 border-l-4 border-l-[#7c3aed]"
      aria-label="SAV"
    >
      <div className="col gap-1">
        <p className="row gap-2">
          <span className="badge s-sav h-6 text-xs">SAV</span>
          <span>
            Reprise de l’OR{' '}
            <Link className="link" to={`/or/${order.sav_of_repair_order_id}`}>
              {order.sav_of_number}
            </Link>
          </span>
        </p>
        <p className="hint">
          Rien n’est facturé au client (main d’œuvre, pièces, fournitures). Le temps passé et le prix d’achat
          des pièces comptent dans la performance du responsable.
        </p>
      </div>
      <SavResponsibleSelect
        id="sav-responsible"
        value={order.sav_responsible_technician_id}
        onChange={(technicianId) => change.mutate(technicianId)}
        disabled={!canEdit || change.isPending}
      />
    </section>
  );
}
