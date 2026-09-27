import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { STATUS_META } from '@/features/repair-orders/constants';
import { buildInvoiceDraft, type BillableOrder } from './api';
import { useBillableOrders, useInvoiceMutation } from './hooks';

/** OR prêts à facturer, cochés d'office (comme l'ancienne appli). */
const READY = ['work_done', 'to_invoice'];

/** Facture groupée : plusieurs OR d'un même client sur une seule facture. */
export function GroupedInvoiceDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const orders = useBillableOrders(true);
  const [clientId, setClientId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const clients = useMemo(() => {
    const byClient = new Map<string, { name: string; orders: BillableOrder[] }>();
    for (const order of orders.data ?? []) {
      const entry = byClient.get(order.client_id) ?? { name: order.client_name, orders: [] };
      entry.orders.push(order);
      byClient.set(order.client_id, entry);
    }
    return [...byClient.entries()]
      .filter(([, entry]) => entry.orders.length > 1)
      .sort(([, a], [, b]) => a.name.localeCompare(b.name, 'fr'));
  }, [orders.data]);
  const clientOrders = clients.find(([id]) => id === clientId)?.[1].orders ?? [];

  const build = useInvoiceMutation(async () => {
    const id = await buildInvoiceDraft(selected);
    await navigate(`/factures/${id}`);
  }, 'Facture groupée préparée');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Facture groupée</DialogTitle>
          <DialogDescription>
            Coche les OR d’un même client à regrouper sur une seule facture.
          </DialogDescription>
        </DialogHeader>
        {orders.isSuccess && clients.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun client n’a plusieurs OR à facturer.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="grouped-client">Client</Label>
              <select
                id="grouped-client"
                className="h-11 w-full rounded-md border bg-transparent px-3 text-base"
                value={clientId}
                onChange={(event) => {
                  const id = event.target.value;
                  setClientId(id);
                  const list = clients.find(([key]) => key === id)?.[1].orders ?? [];
                  setSelected(list.filter((order) => READY.includes(order.status)).map((order) => order.id));
                }}
              >
                <option value="">— Choisir —</option>
                {clients.map(([id, entry]) => (
                  <option key={id} value={id}>
                    {entry.name} ({entry.orders.length} OR)
                  </option>
                ))}
              </select>
            </div>
            {clientOrders.length > 0 && (
              <ul className="space-y-2" aria-label="OR à regrouper">
                {clientOrders.map((order) => (
                  <li key={order.id} className="flex items-center gap-3">
                    <Checkbox
                      id={`grouped-${order.id}`}
                      checked={selected.includes(order.id)}
                      onCheckedChange={(checked) =>
                        setSelected((current) =>
                          checked === true ? [...current, order.id] : current.filter((id) => id !== order.id),
                        )
                      }
                    />
                    <Label htmlFor={`grouped-${order.id}`} className="font-normal">
                      {order.number} — {order.plate} — {STATUS_META[order.status].label}
                    </Label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={selected.length < 1 || build.isPending} onClick={() => build.mutate(undefined)}>
            Préparer la facture groupée
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
