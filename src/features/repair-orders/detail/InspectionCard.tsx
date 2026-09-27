import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CHECK_FIELDS,
  countAlerts,
  FLUID_FIELDS,
  OK_HS_OPTIONS,
  optionFor,
  WARNING_LIGHT_FIELDS,
  WEAR_FIELDS,
  WEAR_OPTIONS,
  YES_NO_OPTIONS,
  type ChipOption,
  type InspectionData,
} from '../inspection';

function Value({ value, options }: { value: string | undefined; options: ChipOption[] }) {
  const option = optionFor(value, options);
  if (!option) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className="rounded px-2 py-0.5 text-xs font-bold text-white"
      style={{ backgroundColor: option.color }}
    >
      {option.label}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-1.5 text-sm last:border-0">
      <span>{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

/** Fiche de contrôle remplie par le technicien (lecture seule côté bureau). */
export function InspectionCard({ data }: { data: InspectionData | null }) {
  const alerts = countAlerts(data);
  const lights = WARNING_LIGHT_FIELDS.filter(([key]) => data?.voyants?.[key]).map(([, label]) => label);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl font-bold">Fiche de contrôle</h2>
        </CardTitle>
        <CardDescription>
          {!data
            ? 'Pas encore remplie par le technicien.'
            : alerts > 0
              ? `${alerts} point${alerts > 1 ? 's' : ''} à surveiller.`
              : 'Aucun point signalé.'}
        </CardDescription>
      </CardHeader>
      {data && (
        <CardContent className="grid gap-x-8 gap-y-4 md:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-semibold">Usure</h3>
            {WEAR_FIELDS.map(([key, label]) => (
              <Row key={key} label={label}>
                <Value value={data.usure?.[key]} options={WEAR_OPTIONS} />
              </Row>
            ))}
            <Row label={`Pneus avant${data.pneus?.avant_taille ? ` (${data.pneus.avant_taille})` : ''}`}>
              <Value value={data.pneus?.avant_etat} options={WEAR_OPTIONS} />
            </Row>
            <Row
              label={`Pneus arrière${data.pneus?.arriere_taille ? ` (${data.pneus.arriere_taille})` : ''}`}
            >
              <Value value={data.pneus?.arriere_etat} options={WEAR_OPTIONS} />
            </Row>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold">Contrôles</h3>
            {CHECK_FIELDS.map(([key, label]) => (
              <Row key={key} label={label}>
                <Value value={data.controles?.[key]} options={OK_HS_OPTIONS} />
              </Row>
            ))}
            <Row label="Problème électrique">
              <Value value={data.probleme_electrique} options={YES_NO_OPTIONS} />
            </Row>
            <Row label="Voyants allumés">
              {[...lights, data.voyants_autres].filter(Boolean).join(', ') || '—'}
            </Row>
            {FLUID_FIELDS.map(([key, label]) => {
              const fluid = data.niveaux?.[key];
              return (
                <Row key={key} label={label}>
                  {fluid?.etat === 'manque'
                    ? `Appoint fait${fluid.litres ? ` (${String(fluid.litres)} L)` : ''}`
                    : fluid?.etat === 'bon'
                      ? 'Niveau bon'
                      : '—'}
                </Row>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
