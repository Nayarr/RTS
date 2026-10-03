import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/features/repair-orders/constants';
import {
  DEPOSIT_MODES,
  fuelLabel,
  present,
  RATE_PERIODS,
  rentalBase,
  round2,
  shortDateTime,
} from '@/features/rentals/rental-domain';
import { formatEuro } from '@/lib/numbers';
import { companyAddress, type PublicRental, type PublicRentalSignature } from './api';
import { DocumentHead, Notice, OnlineSignatureForm, PublicHeader } from './document-ui';

const STATUS_BADGE: Record<PublicRental['rental_status'], { label: string; tone: string }> = {
  reserved: { label: 'Réservé', tone: 's-blue' },
  active: { label: 'En cours', tone: 's-ok' },
  returned: { label: 'Véhicule rendu', tone: 's-grey' },
  closed: { label: 'Clôturé', tone: 's-grey' },
  cancelled: { label: 'Annulé', tone: 's-grey' },
};

/** Contrat de location (ou bon de prêt) lu par le client : à signer à distance, ou à relire et imprimer. */
export function RentalDocument({
  contract,
  token,
}: {
  contract: PublicRental | PublicRentalSignature;
  token: string;
}) {
  const { company, conditions } = contract;
  const loan = contract.kind === 'loan';
  const toSign = contract.type === 'rental_signature';
  const period = RATE_PERIODS.find((entry) => entry.value === conditions.rate_period) ?? RATE_PERIODS[0];
  const base = rentalBase(conditions);
  const vat = round2((base * conditions.vat_rate) / 100);
  const depositMode = DEPOSIT_MODES.find((mode) => mode.value === conditions.deposit_mode)?.label;
  const badge = contract.signed_at
    ? { label: 'Signé', tone: 's-ok' }
    : toSign
      ? { label: 'À signer', tone: 's-blue' }
      : STATUS_BADGE[contract.rental_status];
  // Signé en ligne puis conditions modifiées par l'atelier : nouvelle signature à venir.
  const changedSinceSigning = toSign && contract.status === 'signed' && !contract.signed_at;

  const money = (value: number | null, suffix = '') =>
    present(value) ? `${formatEuro(value)}${suffix}` : '—';
  const rows: [string, string][] = conditions.billable
    ? [
        [
          'Tarif',
          `${formatEuro(conditions.unit_price)} HT / ${period.unit} × ${conditions.periods} ${
            conditions.periods > 1 ? period.units : period.unit
          }${conditions.discount_percent ? ` · remise ${conditions.discount_percent} %` : ''}`,
        ],
        ['Montant de la location', `${formatEuro(base)} HT · ${formatEuro(round2(base + vat))} TTC`],
        ['Kilomètres inclus', present(conditions.km_included) ? `${conditions.km_included} km` : 'Illimités'],
        ['Kilomètre supplémentaire', money(conditions.extra_km_price, ' HT')],
        ['Carburant manquant', money(conditions.fuel_price_per_liter, ' / L')],
        ['Nettoyage si nécessaire', money(conditions.cleaning_fee, ' HT')],
        ['Retard', money(conditions.late_fee_per_hour, ' HT / heure')],
        ['Caution', `${formatEuro(conditions.deposit)}${depositMode ? ` · ${depositMode}` : ''}`],
        ['Franchise en cas de dommage', money(conditions.franchise)],
      ]
    : [['Prix', 'Prêt gratuit']];

  return (
    <>
      <PublicHeader company={company} subtitle={companyAddress(company)}>
        <span className={`badge lg ${badge.tone}`}>{badge.label}</span>
      </PublicHeader>
      <main className="col mx-auto w-full max-w-[880px] gap-5 px-3 py-5 sm:py-8 print:p-0">
        <article data-slot="card" className="card overflow-hidden print:border-0 print:shadow-none">
          <DocumentHead
            title={loan ? 'BON DE PRÊT' : 'CONTRAT DE LOCATION'}
            meta={
              <>
                N° {contract.number} · établi le {formatDate(contract.created_at)}
              </>
            }
            aside={
              <>
                <span>
                  <span className="muted">{loan ? 'Client' : 'Locataire'} :</span>{' '}
                  <b>{contract.client_name}</b>
                </span>
                {contract.vehicle && (
                  <span>
                    <span className="muted">Véhicule :</span>{' '}
                    <b className="plate">{contract.vehicle.plate}</b> {contract.vehicle.brand}{' '}
                    {contract.vehicle.model}
                  </span>
                )}
              </>
            }
          />
          <dl
            className="dl border-b px-5 py-4 text-[14px] sm:grid-cols-[220px_1fr]! sm:px-7"
            aria-label="Période"
          >
            <dt>Départ</dt>
            <dd>{shortDateTime(contract.departure_at)}</dd>
            <dt>Retour prévu</dt>
            <dd>{shortDateTime(contract.planned_return_at)}</dd>
            {contract.returned_at && (
              <>
                <dt>Rendu le</dt>
                <dd>{shortDateTime(contract.returned_at)}</dd>
              </>
            )}
          </dl>
          <div className="col gap-2 border-b px-5 py-4 sm:px-7">
            <span className="overline">Conditions</span>
            <dl className="dl text-[14px] sm:grid-cols-[220px_1fr]!" aria-label="Conditions">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt>{label}</dt>
                  <dd className="num">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          {contract.departure_inspection && (
            <div className="col gap-2 px-5 py-4 sm:px-7">
              <span className="overline">État des lieux de départ</span>
              <p className="text-[14px]">
                {present(contract.departure_inspection.mileage) &&
                  `${contract.departure_inspection.mileage.toLocaleString('fr-FR')} km · `}
                Carburant {fuelLabel(contract.departure_inspection.fuel_eighths)} ·{' '}
                {contract.departure_damages.length
                  ? `Dommages existants : ${contract.departure_damages.join(' ; ')}`
                  : 'Aucun dommage existant'}
              </p>
            </div>
          )}
          {contract.signed_at && (
            <p className="border-t px-5 py-3.5 text-[13.5px] sm:px-7">
              Signé{contract.signer_name && ` par ${contract.signer_name}`} le{' '}
              {shortDateTime(contract.signed_at)}.
            </p>
          )}
        </article>

        {toSign && contract.status === 'pending' && !contract.signed_at && (
          <>
            <Notice tone="s-blue">
              Relisez le contrat puis signez-le en ligne. Lien valable jusqu’au{' '}
              {formatDate(contract.expires_at)}.
            </Notice>
            <OnlineSignatureForm
              token={token}
              title={loan ? 'Signature du bon de prêt' : 'Signature du contrat'}
              submitLabel={loan ? 'Signer le bon de prêt' : 'Signer le contrat'}
              consent="J’ai lu et j’accepte les conditions ci-dessus et les conditions générales de location de l’atelier."
            />
          </>
        )}
        {toSign && contract.signed_at && (
          <Notice tone="s-ok">Contrat signé. Merci, l’atelier a bien reçu votre signature.</Notice>
        )}
        {changedSinceSigning && (
          <Notice tone="s-grey">
            L’atelier a modifié le contrat depuis votre signature : vous recevrez un nouveau lien pour le
            signer.
          </Notice>
        )}
        {toSign &&
          !contract.signed_at &&
          (contract.status === 'expired' || contract.status === 'cancelled') && (
            <Notice tone="s-grey">
              Ce lien de signature n’est plus valable : contactez l’atelier pour en recevoir un nouveau.
            </Notice>
          )}
        {!toSign && (
          <div className="row justify-end print:hidden">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer /> Imprimer / enregistrer en PDF
            </Button>
          </div>
        )}
        <p className="hint text-center print:hidden">
          {company.legal_name} — {companyAddress(company)}
          {company.phone && ` — ${company.phone}`}
          {company.email && ` — ${company.email}`}
        </p>
      </main>
    </>
  );
}
