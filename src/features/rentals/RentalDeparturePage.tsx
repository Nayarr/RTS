import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  Circle,
  FileText,
  IdCard,
  KeyRound,
  Loader2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/app/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PdfPreviewDialog, type PdfFile } from '@/components/PdfPreviewDialog';
import { SignaturePad } from '@/components/SignaturePad';
import { useSignaturePad } from '@/components/use-signature-pad';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { uploadFile } from '@/features/files/api';
import { StoredImage } from '@/features/files/StoredImage';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import { vehicleTitle } from './fleet-domain';
import { licenseBlockReason, licenseState } from './license-domain';
import { LicenseDialog } from './LicenseDialog';
import { InspectionEditor } from './InspectionEditor';
import { cancelRental, startRental, updateRental, type RentalDetail } from './rental-api';
import {
  present,
  DEPOSIT_MODES,
  RATE_PERIODS,
  RENTAL_STEPS,
  rentalBase,
  rentalDays,
  periodsFor,
  round2,
  shortDateTime,
  vehicleRate,
  type RatePeriod,
} from './rental-domain';
import { useMissing, useRental, useRentalMutation } from './rental-hooks';
import { buildRentalPdf } from './rental-pdf';
import { RemoteSignature } from './RentalSend';
import { Stepper } from './ui';

/** Départ d'un contrat réservé : permis, tarifs, état des lieux, signature, puis remise des clés. */
export function RentalDeparturePage() {
  const { id = '' } = useParams();
  const detail = useRental(id);
  if (detail.isPending) return <p className="text-muted-foreground">Chargement…</p>;
  if (detail.isError) return <p className="text-destructive">Impossible de charger le contrat.</p>;
  if (!detail.data) return <p className="text-muted-foreground">Contrat introuvable.</p>;
  if (detail.data.rental.status !== 'reserved') {
    return (
      <p className="empty">
        Les clés de ce contrat ont déjà été remises.{' '}
        <Link className="link" to={`/location/contrats/${id}`}>
          Ouvrir le contrat
        </Link>
      </p>
    );
  }
  return <Departure detail={detail.data} />;
}

function Departure({ detail }: { detail: RentalDetail }) {
  const { rental, vehicle, client } = detail;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const step = Math.min(4, Math.max(1, Number(params.get('etape') ?? 1)));
  const goTo = (next: number) => setParams({ etape: String(next) }, { replace: true });
  const isLoan = rental.kind === 'loan';
  const missing = useMissing(rental.id, 'departure');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const start = useRentalMutation(() => startRental(rental.id), 'Clés remises : bonne route !');
  const cancel = useRentalMutation(() => cancelRental(rental.id), 'Contrat annulé');
  const missingList = missing.data ?? [];

  const checklist = [
    { label: 'Date et heure de départ', detail: shortDateTime(rental.departure_at), ok: true },
    ...(isLoan
      ? []
      : [
          {
            label: 'Permis de conduire scanné',
            detail: detail.license ? `${detail.license.categories.join(' · ')}` : 'recto et verso',
            ok: !missingList.some((item) => item.startsWith('Permis')),
          },
          { label: 'Signature du client', detail: '', ok: !missingList.includes('Signature du client') },
          {
            label: 'Photos du véhicule (4)',
            detail: 'avant, arrière, côtés',
            ok: !missingList.some((item) => item.startsWith('Photo ') && item !== 'Photo du tableau de bord'),
          },
          {
            label: 'Photo du tableau de bord',
            detail: 'km et jauge relevés',
            ok: !missingList.some((item) =>
              ['Photo du tableau de bord', 'Kilométrage', 'Niveau de carburant'].includes(item),
            ),
          },
        ]),
  ];
  const vehicleBlocked = missingList.find(
    (item) => item.startsWith('Assurance') || item.startsWith('Contrôle') || item.startsWith('Véhicule'),
  );

  return (
    <>
      <PageHeader
        crumbs={[
          { label: 'Location' },
          { label: 'Locations', to: '/location/contrats' },
          { label: rental.number },
        ]}
        title={`${isLoan ? 'Prêt' : 'Location'} ${rental.number}`}
        back={{ to: `/location/contrats/${rental.id}`, label: 'Retour au contrat' }}
        actions={
          <Button variant="ghost" className="text-destructive" onClick={() => setConfirmCancel(true)}>
            <X /> Annuler le contrat
          </Button>
        }
      />

      <Stepper
        steps={RENTAL_STEPS}
        current={step}
        done={[0]}
        onSelect={(index) => index > 0 && goTo(index)}
      />

      <div className="split grid-cols-1! lg:grid-cols-[minmax(0,1fr)_320px]!">
        <div className="col gap-4">
          {step === 1 && <LicenseStep detail={detail} />}
          {step === 2 && <RatesStep detail={detail} />}
          {step === 3 && <InspectionEditor detail={detail} phase="departure" editable required={!isLoan} />}
          {step === 4 && <ContractStep detail={detail} />}

          <div className="row between">
            <Button variant="outline" disabled={step === 1} onClick={() => goTo(step - 1)}>
              <ArrowLeft /> Étape précédente
            </Button>
            {step < 4 ? (
              <Button onClick={() => goTo(step + 1)}>
                Continuer <ArrowRight />
              </Button>
            ) : (
              <Button
                disabled={missingList.length > 0 || start.isPending}
                onClick={() =>
                  start.mutate(undefined, {
                    onSuccess: () => void navigate(`/location/contrats/${rental.id}`),
                  })
                }
              >
                <KeyRound /> Valider et remettre les clés
              </Button>
            )}
          </div>
        </div>

        <aside className="col gap-4">
          <section data-slot="card" className="card" aria-labelledby="departure-recap">
            <div className="card-h">
              <h2 className="h2" id="departure-recap">
                Récapitulatif
              </h2>
            </div>
            <dl className="card-b dl">
              <dt>Client</dt>
              <dd>{client.name}</dd>
              <dt>Véhicule</dt>
              <dd>
                {vehicle.plate} · {vehicleTitle(vehicle)}
              </dd>
              <dt>Départ</dt>
              <dd>{shortDateTime(rental.departure_at)}</dd>
              <dt>Retour prévu</dt>
              <dd>{shortDateTime(rental.planned_return_at)}</dd>
              {rental.billable && (
                <>
                  <dt>Estimé HT</dt>
                  <dd>{formatEuro(rentalBase(rental))}</dd>
                </>
              )}
            </dl>
          </section>
          <section data-slot="card" className="card" aria-labelledby="departure-required">
            <div className="card-h">
              <h2 className="h2" id="departure-required">
                Obligatoire avant la remise des clés
              </h2>
            </div>
            <ul className="card-b col gap-2.5">
              {checklist.map((item) => (
                <li key={item.label} className="row items-start gap-2.5">
                  {item.ok ? (
                    <CircleCheck className="i s mt-0.5 shrink-0 text-primary" aria-label="Fait" />
                  ) : (
                    <Circle className="i s mt-0.5 shrink-0 text-muted-foreground" aria-label="À faire" />
                  )}
                  <span className="c2">
                    <b className={cn(!item.ok && 'font-medium')}>{item.label}</b>
                    {item.detail && <span>{item.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
            {vehicleBlocked && (
              <p className="card-b alert s-bad" role="alert">
                {vehicleBlocked} : le véhicule ne peut pas partir.
              </p>
            )}
            {isLoan && (
              <p className="card-b hint">Prêt : photos, relevés et signature conseillés, pas obligatoires.</p>
            )}
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={`Annuler ${rental.number} ?`}
        description="La réservation est annulée et le véhicule redevient libre sur la période."
        confirmLabel="Annuler le contrat"
        destructive
        pending={cancel.isPending}
        onConfirm={() => cancel.mutate(undefined, { onSuccess: () => void navigate('/location/contrats') })}
      />
    </>
  );
}

// ---------------------------------------------------------------- Étape 2 : permis

function LicenseStep({ detail }: { detail: RentalDetail }) {
  const { rental, vehicle, licenses, client } = detail;
  const [scanning, setScanning] = useState(false);
  const select = useRentalMutation((licenseId: string) =>
    updateRental(rental.id, { driving_license_id: licenseId }),
  );
  const until = rental.planned_return_at.slice(0, 10);

  return (
    <section data-slot="card" className="card" aria-labelledby="departure-license">
      <div className="card-h">
        <h2 className="h2" id="departure-license">
          <IdCard className="i s text-muted-foreground" /> Permis de conduire du conducteur
        </h2>
        <Button size="sm" variant="outline" onClick={() => setScanning(true)}>
          Scanner un permis
        </Button>
      </div>
      <div className="card-b col gap-3">
        {rental.kind === 'rental' && (
          <p className="alert s-blue">
            <IdCard className="i" />
            <span>
              <b>Obligatoire pour une location.</b> Permis scanné recto et verso, valable jusqu’au retour,
              catégorie <b>{vehicle.license_category}</b> pour ce véhicule.
            </span>
          </p>
        )}
        {licenses.length === 0 && (
          <p className="hint">Aucun permis enregistré pour {client.name} : scanne-le maintenant.</p>
        )}
        <div className="grid gap-2.5 md:grid-cols-2" role="radiogroup" aria-label="Conducteur">
          {licenses.map((license) => {
            const on = rental.driving_license_id === license.id;
            const problem = licenseBlockReason(license, vehicle.license_category, until);
            const state = licenseState(license, until);
            return (
              <button
                key={license.id}
                type="button"
                role="radio"
                aria-checked={on}
                className={cn(
                  'card col cursor-pointer gap-2 p-3 text-left',
                  on && 'border-primary shadow-[0_0_0_1px_var(--primary)]',
                )}
                onClick={() => select.mutate(license.id)}
              >
                <span className="row between gap-2">
                  <b>
                    {license.first_name} {license.last_name}
                  </b>
                  <span className={cn('badge', problem ? 's-warn' : state.tone)}>
                    {problem ? 'À compléter' : 'Conforme'}
                  </span>
                </span>
                <span className="grid grid-cols-2 gap-1.5">
                  {[license.recto_file_id, license.verso_file_id].map((fileId, index) => (
                    <span
                      key={index}
                      className="aspect-[172/112] overflow-hidden rounded-[6px] border bg-muted"
                    >
                      {fileId && (
                        <StoredImage
                          fileId={fileId}
                          alt={`${index ? 'Verso' : 'Recto'} du permis`}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </span>
                  ))}
                </span>
                <span className="muted text-[12.5px]">
                  {license.license_number ?? 'N° à compléter'} ·{' '}
                  {license.categories.join(' · ') || 'catégories ?'}
                  {license.valid_until
                    ? ` · jusqu’au ${license.valid_until.split('-').reverse().join('/')}`
                    : ''}
                </span>
                {problem && <span className="err">{problem}</span>}
              </button>
            );
          })}
        </div>
      </div>
      {scanning && (
        <LicenseDialog
          clientId={client.id}
          license={null}
          title={client.kind === 'individual' ? 'Permis de conduire' : 'Nouveau conducteur'}
          identity={
            client.kind === 'individual'
              ? { first_name: client.first_name ?? '', last_name: client.last_name ?? '' }
              : undefined
          }
          onClose={() => setScanning(false)}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Étape 3 : tarifs et caution

function RatesStep({ detail }: { detail: RentalDetail }) {
  const { rental, vehicle } = detail;
  const days = rentalDays(rental.departure_at, rental.planned_return_at);
  const text = (value: number | null | undefined) => (!present(value) ? '' : String(value).replace('.', ','));
  const [values, setValues] = useState({
    rate_period: rental.rate_period as RatePeriod,
    unit_price: text(rental.unit_price),
    periods: text(rental.periods),
    discount_percent: text(rental.discount_percent),
    km_included: text(rental.km_included),
    extra_km_price: text(rental.extra_km_price),
    fuel_price_per_liter: text(rental.fuel_price_per_liter),
    cleaning_fee: text(rental.cleaning_fee),
    late_fee_per_hour: text(rental.late_fee_per_hour),
    deposit: text(rental.deposit),
    deposit_mode: rental.deposit_mode ?? '',
    franchise: text(rental.franchise),
    billable: rental.billable,
  });
  const num = (value: string) => (value.trim() ? Number(value.replace(/\s/g, '').replace(',', '.')) : null);
  const invalid = Object.entries(values).some(
    ([key, value]) =>
      typeof value === 'string' &&
      !['rate_period', 'deposit_mode'].includes(key) &&
      value.trim() &&
      !Number.isFinite(num(value)),
  );
  const save = useRentalMutation(
    () =>
      updateRental(rental.id, {
        rate_period: values.rate_period,
        unit_price: num(values.unit_price) ?? 0,
        periods: num(values.periods) ?? 1,
        discount_percent: num(values.discount_percent) ?? 0,
        km_included: num(values.km_included),
        extra_km_price: num(values.extra_km_price),
        fuel_price_per_liter: num(values.fuel_price_per_liter),
        cleaning_fee: num(values.cleaning_fee),
        late_fee_per_hour: num(values.late_fee_per_hour),
        deposit: num(values.deposit) ?? 0,
        deposit_mode: values.deposit_mode || null,
        franchise: num(values.franchise),
        billable: values.billable,
      }),
    'Tarifs enregistrés',
  );
  const set =
    (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setValues((current) => ({ ...current, [key]: event.target.value }));
  const choosePeriod = (period: RatePeriod) =>
    setValues((current) => ({
      ...current,
      rate_period: period,
      unit_price: text(vehicleRate(vehicle, period)),
      periods: text(periodsFor(period, days)),
    }));
  const estimate = rentalBase({
    unit_price: num(values.unit_price) ?? 0,
    periods: num(values.periods) ?? 1,
    discount_percent: num(values.discount_percent) ?? 0,
  });
  const vat = round2(estimate * 0.2);
  const field = (key: keyof typeof values, label: string, hint?: string) => (
    <div className="field">
      <Label htmlFor={`rate-${key}`}>{label}</Label>
      <Input
        id={`rate-${key}`}
        inputMode="decimal"
        className="num"
        value={values[key] as string}
        onChange={set(key)}
      />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );

  return (
    <form
      className="col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!invalid) save.mutate(undefined);
      }}
    >
      {rental.kind === 'loan' && (
        <section data-slot="card" className="card" aria-labelledby="loan-billing">
          <div className="card-b row between gap-3">
            <span className="c2">
              <b id="loan-billing">Prêt facturé</b>
              <span>Sinon le prêt est gratuit (véhicule de courtoisie).</span>
            </span>
            <Switch
              aria-labelledby="loan-billing"
              checked={values.billable}
              onCheckedChange={(billable) => setValues((current) => ({ ...current, billable }))}
            />
          </div>
        </section>
      )}
      <section data-slot="card" className="card" aria-labelledby="rate-card">
        <div className="card-h">
          <h2 className="h2" id="rate-card">
            Tarif
          </h2>
        </div>
        <div className="card-b col gap-3.5">
          <div className="seg w-fit" role="group" aria-label="Tarif">
            {RATE_PERIODS.map((period) => (
              <button
                key={period.value}
                type="button"
                className={cn(values.rate_period === period.value && 'on')}
                aria-pressed={values.rate_period === period.value}
                onClick={() => choosePeriod(period.value)}
              >
                {period.label}
              </button>
            ))}
          </div>
          <div className="grid gap-3.5 sm:grid-cols-4">
            {field('unit_price', 'Prix HT (€)')}
            {field('periods', 'Nombre de périodes', `${days} jour${days > 1 ? 's' : ''} réservés`)}
            {field('km_included', 'Km inclus (total)')}
            {field('extra_km_price', 'Km supplémentaire HT (€)')}
            {field('discount_percent', 'Remise (%)')}
            {field('fuel_price_per_liter', 'Carburant manquant (€ / L)')}
            {field('cleaning_fee', 'Forfait nettoyage (€)', 'si rendu sale')}
            {field('late_fee_per_hour', 'Retard (€ / h)', 'au-delà de 1 h')}
          </div>
        </div>
      </section>
      <section data-slot="card" className="card" aria-labelledby="deposit-card">
        <div className="card-h">
          <h2 className="h2" id="deposit-card">
            Caution et franchise
          </h2>
        </div>
        <div className="card-b grid gap-3.5 sm:grid-cols-3">
          {field('deposit', 'Caution (€)')}
          <div className="field">
            <Label htmlFor="rate-deposit_mode">Mode</Label>
            <select
              id="rate-deposit_mode"
              className="inp"
              value={values.deposit_mode}
              onChange={set('deposit_mode')}
            >
              <option value="">-</option>
              {DEPOSIT_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </div>
          {field('franchise', 'Franchise dommages (€)')}
        </div>
      </section>
      <section data-slot="card" className="card" aria-labelledby="estimate-card">
        <div className="card-h">
          <h2 className="h2" id="estimate-card">
            Montant estimé
          </h2>
          <Button type="submit" size="sm" disabled={invalid || save.isPending}>
            Enregistrer les tarifs
          </Button>
        </div>
        <dl className="card-b dl">
          <dt>Total HT</dt>
          <dd className="num">{formatEuro(values.billable ? estimate : 0)}</dd>
          <dt>TVA 20 %</dt>
          <dd className="num">{formatEuro(values.billable ? vat : 0)}</dd>
          <dt>Total TTC estimé</dt>
          <dd className="num b">{formatEuro(values.billable ? round2(estimate + vat) : 0)}</dd>
        </dl>
        <p className="card-b hint">
          Km supplémentaires, carburant, retard et dommages sont calculés au retour.
        </p>
      </section>
    </form>
  );
}

// ---------------------------------------------------------------- Étape 5 : contrat et signature

function ContractStep({ detail }: { detail: RentalDetail }) {
  const { rental } = detail;
  const pad = useSignaturePad();
  const [terms, setTerms] = useState(rental.terms_accepted);
  const [pdf, setPdf] = useState<PdfFile | null>(null);
  const [pdfPending, setPdfPending] = useState(false);
  const sign = useRentalMutation(async () => {
    const blob = await pad.toBlob();
    if (!blob) throw new Error('Le client doit signer dans le cadre');
    const fileId = await uploadFile(blob, { category: 'signature', name: `signature-${rental.number}.png` });
    await updateRental(rental.id, {
      signature_file_id: fileId,
      signed_at: new Date().toISOString(),
      terms_accepted: true,
    });
  }, 'Contrat signé');

  const openPdf = async () => {
    setPdfPending(true);
    try {
      setPdf(await buildRentalPdf(detail));
    } catch {
      toast.error('Contrat PDF impossible à générer');
    } finally {
      setPdfPending(false);
    }
  };

  return (
    <>
      <section data-slot="card" className="card" aria-labelledby="contract-card">
        <div className="card-h">
          <h2 className="h2" id="contract-card">
            Contrat {rental.number}
          </h2>
          <Button size="sm" variant="outline" disabled={pdfPending} onClick={() => void openPdf()}>
            {pdfPending ? <Loader2 className="animate-spin" /> : <FileText />} Aperçu PDF
          </Button>
        </div>
        <p className="card-b hint">
          Le contrat reprend le locataire, le permis, le véhicule, la période, les conditions financières et
          l’état des lieux de départ (photos, kilométrage, carburant, dommages).
        </p>
      </section>
      <section data-slot="card" className="card" aria-labelledby="signature-card">
        <div className="card-h">
          <h2 className="h2" id="signature-card">
            Signature du client
          </h2>
          {rental.signed_at && <span className="badge s-ok">Signé le {shortDateTime(rental.signed_at)}</span>}
        </div>
        <div className="card-b col gap-3">
          {rental.signature_file_id ? (
            <div className="max-w-[360px] rounded-xl border bg-white p-2">
              <StoredImage
                fileId={rental.signature_file_id}
                alt="Signature du client"
                className="h-[120px] w-full object-contain"
              />
            </div>
          ) : (
            <>
              <label className="row cursor-pointer gap-2.5 text-[13.5px]">
                <input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} />
                Le client a lu les conditions générales de location
              </label>
              <SignaturePad pad={pad} label="Signature du client" />
              <Button
                className="self-start"
                disabled={!terms || pad.isEmpty || sign.isPending}
                onClick={() => sign.mutate(undefined)}
              >
                Enregistrer la signature
              </Button>
              <div className="col gap-2 border-t pt-3">
                <span className="text-[13px] font-semibold">Client absent ?</span>
                <RemoteSignature detail={detail} />
              </div>
            </>
          )}
          {rental.kind === 'loan' && !rental.signature_file_id && (
            <span className="hint">Prêt : signature conseillée, pas obligatoire.</span>
          )}
        </div>
      </section>
      {pdf && <PdfPreviewDialog file={pdf} onClose={() => setPdf(null)} />}
    </>
  );
}
