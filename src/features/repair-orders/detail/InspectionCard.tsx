import type { CSSProperties, ReactNode } from 'react';
import {
  CHECK_FIELDS,
  countAlerts,
  extraAxleLabel,
  FLUID_FIELDS,
  OK_HS_OPTIONS,
  optionFor,
  TIRE_AXLES,
  WARNING_LIGHT_FIELDS,
  WEAR_FIELDS,
  WEAR_OPTIONS,
  YES_NO_OPTIONS,
  type ChipOption,
  type InspectionData,
} from '../inspection';

function Value({ value, options }: { value: string | undefined; options: ChipOption[] }) {
  const option = optionFor(value, options);
  if (!option) return <span className="muted">-</span>;
  return (
    <span className="badge" style={{ '--c': option.color } as CSSProperties}>
      {option.label}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row between gap-3">
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
    <section data-slot="card" className="card" aria-labelledby="ro-inspection">
      <div className="card-h">
        <h2 className="h2" id="ro-inspection">
          Fiche de contrôle
        </h2>
        {!data ? (
          <span className="hint">Pas encore remplie par le technicien.</span>
        ) : alerts > 0 ? (
          <span className="badge s-warn dot">
            {alerts} point{alerts > 1 ? 's' : ''} à surveiller.
          </span>
        ) : (
          <span className="badge s-ok dot">Aucun point signalé.</span>
        )}
      </div>
      {data && (
        <div className="card-b grid gap-5 md:grid-cols-3">
          <div className="col gap-2">
            <h3 className="overline">Niveaux</h3>
            {FLUID_FIELDS.map(([key, label]) => {
              const fluid = data.niveaux?.[key];
              return (
                <Row key={key} label={label}>
                  {fluid?.etat === 'manque' ? (
                    <span className="badge s-warn">
                      Appoint fait{fluid.litres ? ` (${String(fluid.litres)} L)` : ''}
                    </span>
                  ) : fluid?.etat === 'bon' ? (
                    <span className="badge s-ok">Niveau bon</span>
                  ) : (
                    <span className="muted">-</span>
                  )}
                </Row>
              );
            })}
          </div>
          <div className="col gap-2">
            <h3 className="overline">Pneus · usure</h3>
            {WEAR_FIELDS.map(([key, label]) => (
              <Row key={key} label={label}>
                <Value value={data.usure?.[key]} options={WEAR_OPTIONS} />
              </Row>
            ))}
            {TIRE_AXLES.map(([side, label]) => {
              const size = data.pneus?.[`${side}_taille`];
              const state = data.pneus?.[`${side}_etat`];
              // Essieu du milieu : affiché seulement s'il a été renseigné
              if (side === 'milieu' && !size && !state) return null;
              return (
                <Row key={side} label={`${label}${size ? ` (${size})` : ''}`}>
                  <Value value={state} options={WEAR_OPTIONS} />
                </Row>
              );
            })}
            {(data.pneus?.essieux ?? []).map((axle, index) => (
              <Row key={index} label={`${extraAxleLabel(index)}${axle.taille ? ` (${axle.taille})` : ''}`}>
                <Value value={axle.etat} options={WEAR_OPTIONS} />
              </Row>
            ))}
          </div>
          <div className="col gap-2">
            <h3 className="overline">Contrôles</h3>
            <Row label="Voyants allumés">
              {lights.length > 0 || data.voyants_autres ? (
                <span className="badge s-bad">
                  {[...lights, data.voyants_autres].filter(Boolean).join(', ')}
                </span>
              ) : (
                <span className="muted">-</span>
              )}
            </Row>
            <Row label="Problème électrique">
              <Value value={data.probleme_electrique} options={YES_NO_OPTIONS} />
            </Row>
            {CHECK_FIELDS.map(([key, label]) => (
              <Row key={key} label={label}>
                <Value value={data.controles?.[key]} options={OK_HS_OPTIONS} />
              </Row>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
