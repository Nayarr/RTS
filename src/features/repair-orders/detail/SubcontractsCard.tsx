import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { formatEuro } from '@/lib/numbers';
import { formatDate } from '../constants';
import { isLateSubcontract, SUBCONTRACT_META } from '../supplies';
import type { Subcontract } from '../supplies-api';
import { SubcontractDialog } from './SubcontractDialog';

function SubcontractStatus({ subcontract }: { subcontract: Subcontract }) {
  const late = isLateSubcontract(subcontract);
  const meta = SUBCONTRACT_META[subcontract.status];
  return (
    <span
      className="text-sm font-semibold whitespace-nowrap"
      style={{ color: late ? 'var(--destructive)' : meta.color }}
    >
      {late ? 'En retard' : meta.label}
    </span>
  );
}

/** Travaux confiés à des prestataires (rectification, géométrie…), refacturés avec marge. */
export function SubcontractsCard({
  repairOrderId,
  subcontracts,
  editable,
}: {
  repairOrderId: string;
  subcontracts: Subcontract[];
  editable: boolean;
}) {
  const [editing, setEditing] = useState<Subcontract | 'new' | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl font-bold">Sous-traitance</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {subcontracts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun travail sous-traité.</p>
        ) : (
          <ul className="divide-y">
            {subcontracts.map((subcontract) => (
              <li key={subcontract.id}>
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 py-3 text-left disabled:cursor-default"
                  disabled={!editable}
                  aria-label={`${subcontract.service} — ${subcontract.supplier_name}`}
                  onClick={() => setEditing(subcontract)}
                >
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {subcontract.service} — {subcontract.supplier_name}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      Coût {formatEuro(subcontract.cost_ht)} → refacturé{' '}
                      {formatEuro(subcontract.resale_price_ht)} HT
                      {subcontract.expected_return_on &&
                        subcontract.status === 'sent' &&
                        ` · retour prévu le ${formatDate(subcontract.expected_return_on)}`}
                    </span>
                  </span>
                  <SubcontractStatus subcontract={subcontract} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {editable && (
        <CardFooter>
          <Button variant="outline" onClick={() => setEditing('new')}>
            <Plus /> Confier un travail à un prestataire
          </Button>
        </CardFooter>
      )}
      {editing && (
        <SubcontractDialog
          repairOrderId={repairOrderId}
          subcontract={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}
