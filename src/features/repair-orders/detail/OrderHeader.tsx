import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  Hash,
  Package,
} from 'lucide-react';
import { StoredImage } from '@/features/files/StoredImage';
import type { SignatureChannel } from '@/features/signature/api';
import { SignatureRequestPanel } from '@/features/signature/SignatureRequestPanel';
import type { RepairOrderOverview } from '../api';
import { formatDate, VEHICLE_TYPES } from '../constants';
import { StatusBadge } from '../StatusBadge';
import { TaskList } from '../TaskList';

/**
 * En-tête de la fiche OR : véhicule, client, statut, tâche demandée, signature du client (ou sa
 * demande sur la borne / par e-mail). `autoSignature` : demande choisie à la création de l'OR.
 */
export function OrderHeader({
  order,
  autoSignature,
}: {
  order: RepairOrderOverview;
  autoSignature?: SignatureChannel | null;
}) {
  return (
    <section data-slot="card" className="card" aria-label="Véhicule et demande">
      <div className="card-b row top flex-wrap gap-7 px-6 py-[22px]">
        <div className="col grow basis-[340px] gap-3">
          <div className="row wrap gap-3.5">
            <Link
              to={`/vehicules/${order.vehicle_id}`}
              className="plate-tag h-11 border-2 px-3.5 text-[28px]"
              title="Fiche véhicule"
            >
              {order.plate}
            </Link>
            <div className="col gap-0.5">
              {order.client_id && order.client_name ? (
                <Link to={`/clients/${order.client_id}`} className="b ul text-base" title="Fiche client">
                  {order.client_name}
                </Link>
              ) : (
                <span className="b text-base">Client non renseigné</span>
              )}
              <span className="muted">{VEHICLE_TYPES[order.vehicle_type]}</span>
            </div>
            <div className="row ml-auto gap-2">
              {order.inspection_required && (
                <span className="badge lg" title="Exigé par la direction : tous les points OK / 50 % / HS">
                  <ClipboardCheck className="i xs" /> Fiche complète exigée
                </span>
              )}
              {(order.parts_pending_count ?? 0) > 0 && (
                <span className="badge lg s-bad">
                  <Package className="i xs" /> Attente pièces ({order.parts_pending_count})
                </span>
              )}
              <StatusBadge
                status={order.status}
                technicianId={order.technician_id}
                quoteSent={order.quote_sent}
                invoiceSent={order.invoice_sent}
                className="lg solid"
              />
            </div>
          </div>

          <TaskList text={order.requested_work} className="text-[15px] leading-normal" />

          <div className="row wrap muted gap-[18px] text-[13.5px]">
            <span className="row gap-1.5">
              <Hash className="i xs" />
              {order.number}
            </span>
            <span className="row gap-1.5">
              <span
                className="tdot"
                style={{ '--c': order.technician_color ?? '#9aa0a6' } as CSSProperties}
              />
              Technicien : {order.technician_name ?? 'non assigné'}
            </span>
            <span className="row gap-1.5">
              <CalendarDays className="i xs" />
              Créé le {formatDate(order.created_at)}
            </span>
            {order.mileage !== null && (
              <span className="row gap-1.5">
                <Gauge className="i xs" />
                {order.mileage.toLocaleString('fr-FR')} km
              </span>
            )}
          </div>
        </div>

        {/* Colonne signature : sa 1re ligne a la hauteur de la plaque (h-11), au niveau du statut. */}
        {order.customer_signature_file_id ? (
          <div className="col w-[250px] gap-2">
            <span className="row min-h-11 gap-1.5 text-[13px] font-semibold text-success">
              <CheckCircle2 className="i xs" /> Signature client (accord avant intervention)
            </span>
            <StoredImage
              fileId={order.customer_signature_file_id}
              alt="Signature du client"
              className="h-24 w-full rounded-[7px] border bg-white object-contain"
            />
          </div>
        ) : order.status === 'invoiced' ? (
          <p className="row min-h-11 w-[250px] gap-1.5 text-[13px] font-semibold text-destructive">
            <AlertTriangle className="i xs" /> Aucune signature client enregistrée.
          </p>
        ) : (
          <SignatureRequestPanel order={order} autoRequest={autoSignature} />
        )}
      </div>
    </section>
  );
}
