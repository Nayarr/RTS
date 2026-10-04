import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import {
  BookOpen,
  ClipboardCheck,
  CreditCard,
  Download,
  FileBadge,
  FileText,
  FolderOpen,
  Gauge,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { fetchFileUrls } from '@/features/files/api';
import { formatDate } from '@/features/repair-orders/constants';
import { todayIso } from '@/features/repair-orders/schemas';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import {
  addFleetDocument,
  deleteFleetDocument,
  saveFleetVehicle,
  type FleetDocument,
  type FleetDocumentKind,
  type FleetVehicle,
} from './fleet-api';
import {
  blockReason,
  CATEGORY_META,
  DEADLINE_BADGE,
  fleetDeadlines,
  fleetStatus,
  GLOVE_BOX,
  hasEngine,
  vehicleTitle,
} from './fleet-domain';
import { useFleetDocuments, useFleetMutation, useFleetVehicle } from './fleet-hooks';
import { DocumentUploadButton, Kpi, VehicleVisual } from './ui';

const DOC_ICONS: Record<FleetDocumentKind, LucideIcon> = {
  registration: FileBadge,
  insurance: ShieldCheck,
  technical_inspection: ClipboardCheck,
  accident_report: FileText,
  maintenance_book: BookOpen,
  fuel_card: CreditCard,
  other: FileText,
};

/** Fiche d'un véhicule de la flotte : boîte à gants, caractéristiques, tarifs, échéances. */
export function FleetVehiclePage() {
  const { id = '' } = useParams();
  const vehicle = useFleetVehicle(id);
  if (vehicle.isPending) return <p className="text-muted-foreground">Chargement…</p>;
  if (vehicle.isError || !vehicle.data) {
    return (
      <div className="col items-center gap-4 py-16 text-center">
        <h1 className="title">Véhicule introuvable</h1>
        <Button asChild variant="outline">
          <Link to="/location/flotte">Retour à la flotte</Link>
        </Button>
      </div>
    );
  }
  return <FleetVehicleDetail vehicle={vehicle.data} />;
}

function FleetVehicleDetail({ vehicle }: { vehicle: FleetVehicle }) {
  const today = todayIso();
  const status = fleetStatus(vehicle, today);
  const blocked = blockReason(vehicle, today);
  const engine = hasEngine(vehicle.category);
  const maintenance = useFleetMutation(
    (on: boolean) => saveFleetVehicle(vehicle.id, { in_maintenance: on }),
    vehicle.in_maintenance ? 'Véhicule remis en service' : 'Véhicule mis en entretien',
  );

  return (
    <>
      <PageHeader
        crumbs={[
          { label: 'Location' },
          { label: 'Flotte', to: '/location/flotte' },
          { label: vehicle.plate },
        ]}
        back={{ to: '/location/flotte', label: 'Retour à la flotte' }}
        title={
          <span className="row flex-wrap gap-x-3 gap-y-1">
            <span className="plate-tag">{vehicle.plate}</span>
            {vehicleTitle(vehicle)}
            <span className={cn('badge lg', status.tone)}>{status.label}</span>
          </span>
        }
        actions={
          <>
            <Button
              variant="outline"
              disabled={maintenance.isPending}
              onClick={() => maintenance.mutate(!vehicle.in_maintenance)}
            >
              <Wrench /> {vehicle.in_maintenance ? 'Remettre en service' : 'Mettre en entretien'}
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/location/flotte/${vehicle.id}/modifier`}>
                <Pencil /> Modifier
              </Link>
            </Button>
          </>
        }
      />

      {blocked && (
        <p className="alert s-bad" role="alert">
          {blocked} : le véhicule ne peut être ni loué ni prêté.
        </p>
      )}

      <ul className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        <Kpi
          icon={<Gauge className="i s" />}
          value={engine && vehicle.mileage !== null ? `${vehicle.mileage.toLocaleString('fr-FR')} km` : '-'}
          label={engine ? 'Kilométrage connu' : 'Sans moteur ni compteur'}
        />
        <Kpi
          icon={<FolderOpen className="i s" />}
          value={<DocumentsCount vehicleId={vehicle.id} />}
          label="Documents dans la boîte à gants"
        />
        <Kpi icon={<CreditCardIcon />} value={formatEuro(vehicle.daily_rate)} label="Prix par jour HT" />
        <Kpi icon={<ShieldCheck className="i s" />} value={formatEuro(vehicle.deposit)} label="Caution" />
      </ul>

      <div className="split grid-cols-1! lg:grid-cols-[minmax(0,1fr)_400px]!">
        <GloveBox vehicle={vehicle} />

        <div className="col gap-5">
          <section data-slot="card" className="card" aria-labelledby="fleet-vehicle">
            <div className="card-h">
              <h2 className="h2" id="fleet-vehicle">
                Véhicule
              </h2>
            </div>
            <div className="card-b col gap-3.5">
              <VehicleVisual
                category={vehicle.category}
                fileId={vehicle.photo_file_id}
                alt={`Photo ${vehicle.plate}`}
                className="h-[150px] w-full rounded-lg border"
              />
              <dl className="dl grid-cols-[130px_1fr]!">
                <Pair
                  term="Catégorie"
                  value={`${CATEGORY_META[vehicle.category].label} · permis ${vehicle.license_category}`}
                />
                <Pair term="N° de série" value={vehicle.vin} />
                <Pair
                  term="Mise en circulation"
                  value={vehicle.first_registration && formatDate(vehicle.first_registration)}
                />
                {engine && (
                  <Pair
                    term="Carburant"
                    value={[vehicle.fuel_type, vehicle.tank_liters && `${vehicle.tank_liters} L`]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                )}
                <Pair term="Prêt pendant un OR" value={vehicle.loanable ? 'Oui' : 'Non'} />
              </dl>
            </div>
          </section>

          <section data-slot="card" className="card" aria-labelledby="fleet-rates">
            <div className="card-h">
              <h2 className="h2" id="fleet-rates">
                Tarifs
              </h2>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/location/flotte/${vehicle.id}/modifier`}>Modifier</Link>
              </Button>
            </div>
            <div className="card-b">
              <dl className="dl grid-cols-[90px_1fr]!">
                <Pair
                  term="Jour"
                  value={`${formatEuro(vehicle.daily_rate)} HT${vehicle.km_included_per_day ? ` · ${vehicle.km_included_per_day} km inclus` : ''}`}
                />
                <Pair
                  term="Week-end"
                  value={vehicle.weekend_rate !== null && `${formatEuro(vehicle.weekend_rate)} HT`}
                />
                <Pair
                  term="Semaine"
                  value={vehicle.week_rate !== null && `${formatEuro(vehicle.week_rate)} HT`}
                />
                <Pair
                  term="Mois"
                  value={vehicle.month_rate !== null && `${formatEuro(vehicle.month_rate)} HT`}
                />
                {engine && (
                  <Pair
                    term="Km sup."
                    value={vehicle.extra_km_price !== null && `${formatEuro(vehicle.extra_km_price)} HT`}
                  />
                )}
                <Pair term="Caution" value={formatEuro(vehicle.deposit)} />
                <Pair term="Franchise" value={vehicle.franchise !== null && formatEuro(vehicle.franchise)} />
              </dl>
            </div>
          </section>

          <section data-slot="card" className="card" aria-labelledby="fleet-deadlines">
            <div className="card-h">
              <h2 className="h2" id="fleet-deadlines">
                Échéances
              </h2>
            </div>
            <ul>
              {fleetDeadlines(vehicle, today).map((deadline) => (
                <li key={deadline.label} className="li">
                  <span className="c2">
                    <b>{deadline.label}</b>
                    <span>{deadline.when}</span>
                  </span>
                  <span className={cn('badge', DEADLINE_BADGE[deadline.state])}>{deadline.text}</span>
                </li>
              ))}
              {fleetDeadlines(vehicle, today).length === 0 && (
                <li className="li hint">Aucune échéance renseignée.</li>
              )}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}

const CreditCardIcon = () => <CreditCard className="i s" />;

function Pair({ term, value }: { term: string; value: ReactNode }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{value || <span className="muted">-</span>}</dd>
    </>
  );
}

function DocumentsCount({ vehicleId }: { vehicleId: string }) {
  const documents = useFleetDocuments(vehicleId);
  return <>{documents.data?.length ?? '-'}</>;
}

async function openDocument(fileId: string, disposition: 'inline' | 'attachment') {
  const urls = await fetchFileUrls([fileId], disposition);
  const url = urls[fileId];
  if (url) window.open(url, '_blank', 'noopener');
}

/** Boîte à gants : documents du véhicule (photo ou PDF), aucun n'est obligatoire. */
function GloveBox({ vehicle }: { vehicle: FleetVehicle }) {
  const documents = useFleetDocuments(vehicle.id);
  const [toDelete, setToDelete] = useState<FleetDocument | null>(null);
  const add = useFleetMutation(
    (input: { kind: FleetDocumentKind; label: string; file_id: string }) =>
      addFleetDocument({ ...input, fleet_vehicle_id: vehicle.id }),
    'Document ajouté à la boîte à gants',
  );
  const remove = useFleetMutation((id: string) => deleteFleetDocument(id), 'Document retiré');
  const list = documents.data ?? [];
  const others = list.filter((doc) => !GLOVE_BOX.some((slot) => slot.kind === doc.kind));

  return (
    <section data-slot="card" className="card self-start" aria-labelledby="glove-box">
      <div className="card-h">
        <h2 className="h2" id="glove-box">
          <FolderOpen className="i s text-muted-foreground" /> Boîte à gants{' '}
          <span className="cnt">{list.length}</span>
        </h2>
        <DocumentUploadButton
          onUploaded={(fileId) => add.mutate({ kind: 'other', label: 'Autre document', file_id: fileId })}
        >
          Ajouter un document
        </DocumentUploadButton>
      </div>
      <div className="card-b col gap-3">
        <span className="hint">
          Les documents du véhicule, à portée de main au comptoir et sur le téléphone. Aucun n’est
          obligatoire.
        </span>
        <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {GLOVE_BOX.map((slot) => {
            const doc = list.find((item) => item.kind === slot.kind);
            const Icon = DOC_ICONS[slot.kind];
            return doc ? (
              <DocumentCard key={slot.kind} doc={doc} icon={Icon} onDelete={() => setToDelete(doc)} />
            ) : (
              <li
                key={slot.kind}
                className="row gap-2.5 rounded-[10px] border border-dashed p-3 text-muted-foreground"
              >
                <span className="kpi-ico shrink-0 border border-dashed bg-transparent">
                  <Icon className="i s" />
                </span>
                <span className="col grow gap-0.5">
                  <b className="text-[13px] text-foreground">{slot.label}</b>
                  <span className="text-xs">Photo ou PDF</span>
                </span>
                <DocumentUploadButton
                  variant="ghost"
                  label={`Ajouter : ${slot.label}`}
                  onUploaded={(fileId) => add.mutate({ kind: slot.kind, label: slot.label, file_id: fileId })}
                >
                  <Plus className="sr-only" />
                </DocumentUploadButton>
              </li>
            );
          })}
          {others.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} icon={FileText} onDelete={() => setToDelete(doc)} />
          ))}
        </ul>
      </div>
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Retirer ce document ?"
        description={`« ${toDelete?.label ?? ''} » est retiré de la boîte à gants du véhicule ${vehicle.plate}.`}
        confirmLabel="Retirer"
        destructive
        pending={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
      />
    </section>
  );
}

function DocumentCard({
  doc,
  icon: Icon,
  onDelete,
}: {
  doc: FleetDocument;
  icon: LucideIcon;
  onDelete: () => void;
}) {
  return (
    <li className="card row items-start gap-2.5 p-3">
      <span className="kpi-ico shrink-0">
        <Icon className="i s" />
      </span>
      <button
        type="button"
        className="col grow cursor-pointer gap-0.5 text-left"
        onClick={() => void openDocument(doc.file_id, 'inline')}
      >
        <b className="text-[13px]">{doc.label}</b>
        <span className="muted text-xs">
          {doc.valid_until ? `valable jusqu’au ${formatDate(doc.valid_until)}` : 'Ouvrir'}
        </span>
        <span className="muted text-[11.5px]">Ajouté le {formatDate(doc.created_at)}</span>
      </button>
      <div className="col shrink-0 gap-1">
        <button
          type="button"
          className="ibtn sm ghost"
          aria-label={`Télécharger ${doc.label}`}
          onClick={() => void openDocument(doc.file_id, 'attachment')}
        >
          <Download className="i s" />
        </button>
        <button
          type="button"
          className="ibtn sm ghost"
          aria-label={`Retirer ${doc.label}`}
          onClick={onDelete}
        >
          <Trash2 className="i s" />
        </button>
      </div>
    </li>
  );
}
