import { useState, type CSSProperties } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatEuro } from '@/lib/numbers';
import { formatDate } from '../constants';
import { isLateSubcontract, SUBCONTRACT_META } from '../supplies';
import type { Subcontract } from '../supplies-api';
import { SubcontractDialog } from './SubcontractDialog';

function SubcontractStatus({ subcontract }: { subcontract: Subcontract }) {
  const late = isLateSubcontract(subcontract);
  const meta = SUBCONTRACT_META[subcontract.status];
  return (
    <span className="row gap-1.5">
      <span className="badge" style={{ '--c': meta.color } as CSSProperties}>
        {meta.label}
      </span>
      {late && <span className="badge s-bad">En retard</span>}
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
    <section data-slot="card" className="card" aria-labelledby="ro-subcontracts">
      <div className="card-h">
        <h2 className="h2" id="ro-subcontracts">
          Sous-traitance
        </h2>
        {editable && (
          <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
            <Plus /> Confier un travail à un prestataire
          </Button>
        )}
      </div>
      {subcontracts.length === 0 ? (
        <p className="card-b hint">Aucun travail sous-traité.</p>
      ) : (
        <ul>
          {subcontracts.map((subcontract) => (
            <li key={subcontract.id}>
              <button
                type="button"
                className="li w-full cursor-pointer text-left hover:bg-hover disabled:cursor-default disabled:hover:bg-transparent"
                disabled={!editable}
                aria-label={`${subcontract.service} · ${subcontract.supplier_name}`}
                onClick={() => setEditing(subcontract)}
              >
                <span className="col grow gap-0.5">
                  <b>
                    {subcontract.service} · {subcontract.supplier_name}
                  </b>
                  <span className="muted text-[12.5px]">
                    {subcontract.expected_return_on &&
                      subcontract.status === 'sent' &&
                      `Retour prévu le ${formatDate(subcontract.expected_return_on)} · `}
                    Coût {formatEuro(subcontract.cost_ht)} → refacturé{' '}
                    {formatEuro(subcontract.resale_price_ht)} HT
                  </span>
                </span>
                <b className="num">{formatEuro(subcontract.resale_price_ht)}</b>
                <SubcontractStatus subcontract={subcontract} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <SubcontractDialog
          repairOrderId={repairOrderId}
          subcontract={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
