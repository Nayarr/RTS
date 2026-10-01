import { useState } from 'react';
import { useLocation } from 'react-router';
import { FileText } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { SectionNav } from '@/components/SectionNav';
import { Button } from '@/components/ui/button';
import { MonthlyReportDialog } from './MonthlyReportDialog';

const TABS = [
  { to: '/pilotage/statistiques', label: 'Statistiques' },
  { to: '/pilotage/tresorerie', label: 'Trésorerie' },
  { to: '/pilotage/rentabilite', label: 'Rentabilité' },
  { to: '/pilotage/performance', label: 'Performance' },
];

/** Onglets du pilotage (direction). */
export function ReportingTabs() {
  return <SectionNav label="Pilotage" links={TABS} variant="tabs" />;
}

/** En-tête commun des écrans de pilotage. */
export function ReportingHeader() {
  const [reportOpen, setReportOpen] = useState(false);
  const { pathname } = useLocation();
  const section = TABS.find((tab) => pathname.startsWith(tab.to))?.label;
  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Pilotage' }, ...(section ? [{ label: section }] : [])]}
        title="Pilotage"
        actions={
          <>
            <span className="sub hidden md:inline">Chiffre d’affaires, marges et encaissements</span>
            <Button variant="outline" onClick={() => setReportOpen(true)}>
              <FileText /> Rapport mensuel
            </Button>
          </>
        }
      />
      <ReportingTabs />
      {reportOpen && <MonthlyReportDialog onClose={() => setReportOpen(false)} />}
    </>
  );
}
