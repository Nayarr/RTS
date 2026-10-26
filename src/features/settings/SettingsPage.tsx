import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Archive, Building2, FileText, Timer, Wrench, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { cn } from '@/lib/utils';
import { BillingForm } from './BillingForm';
import { CompanyForm } from './CompanyForm';
import { useSettings } from './hooks';
import { LaborRatesForm } from './LaborRatesForm';
import { LogoCard } from './LogoCard';
import { ArchivesPanel } from './ArchivesPanel';
import { WorkshopForm } from './WorkshopForm';

type Section = 'entreprise' | 'facturation' | 'taux' | 'atelier' | 'archives';

const SECTIONS: { value: Section; label: string; icon: LucideIcon }[] = [
  { value: 'entreprise', label: 'Entreprise', icon: Building2 },
  { value: 'facturation', label: 'Devis et factures', icon: FileText },
  { value: 'taux', label: 'Taux horaires', icon: Timer },
  { value: 'atelier', label: 'Atelier', icon: Wrench },
  { value: 'archives', label: 'Archives', icon: Archive },
];

const isSection = (value: string): value is Section => SECTIONS.some((section) => section.value === value);

/** Écran « Réglages » (direction) : entreprise, facturation, taux horaires, atelier. */
export function SettingsPage() {
  const settings = useSettings();
  // Lien direct vers une section : /reglages?onglet=atelier
  const [params] = useSearchParams();
  const requested = params.get('onglet') ?? '';
  return (
    <SettingsSections
      key={requested}
      initial={isSection(requested) ? requested : 'entreprise'}
      settings={settings}
    />
  );
}

function SettingsSections({
  initial,
  settings,
}: {
  initial: Section;
  settings: ReturnType<typeof useSettings>;
}) {
  const [section, setSection] = useState<Section>(initial);

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Réglages' }]}
        title="Réglages"
        actions={
          <span className="sub hidden md:inline">
            Informations de l’entreprise et paramètres de l’atelier
          </span>
        }
      />

      {settings.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {settings.isError && <p className="text-destructive">Impossible de charger les réglages.</p>}

      {settings.isSuccess && (
        <div className="grid items-start gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
          <nav
            className="snav max-lg:static! max-lg:flex-row! max-lg:overflow-x-auto max-lg:[&>button]:shrink-0"
            aria-label="Sections des réglages"
            role="tablist"
            aria-orientation="vertical"
          >
            {SECTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="tab"
                id={`settings-tab-${value}`}
                aria-selected={section === value}
                aria-controls="settings-panel"
                className={cn(section === value && 'on')}
                onClick={() => setSection(value)}
              >
                <Icon className="i s" />
                {label}
              </button>
            ))}
          </nav>
          <div
            className="col gap-5"
            role="tabpanel"
            id="settings-panel"
            aria-labelledby={`settings-tab-${section}`}
          >
            {section === 'entreprise' && (
              <>
                <LogoCard logoFileId={settings.data.company.logo_file_id} />
                <CompanyForm company={settings.data.company} />
              </>
            )}
            {section === 'facturation' && <BillingForm company={settings.data.company} />}
            {section === 'taux' && <LaborRatesForm rates={settings.data.laborRates} />}
            {section === 'atelier' && <WorkshopForm app={settings.data.app} />}
            {section === 'archives' && <ArchivesPanel />}
          </div>
        </div>
      )}
    </>
  );
}
