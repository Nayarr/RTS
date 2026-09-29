import { useSearchParams } from 'react-router';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BackupCard } from './BackupCard';
import { BillingForm } from './BillingForm';
import { CompanyForm } from './CompanyForm';
import { useSettings } from './hooks';
import { LaborRatesForm } from './LaborRatesForm';
import { LogoCard } from './LogoCard';
import { WorkshopForm } from './WorkshopForm';

const TABS = ['entreprise', 'facturation', 'taux', 'atelier', 'sauvegarde'];

/** Écran « Réglages » (direction) : entreprise, facturation, taux horaires, atelier, sauvegarde. */
export function SettingsPage() {
  const settings = useSettings();
  // Lien de l'alerte « Sauvegarde à faire » : /reglages?onglet=sauvegarde
  const [params] = useSearchParams();
  const requested = params.get('onglet') ?? '';
  const tab = TABS.includes(requested) ? requested : 'entreprise';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Réglages</h1>
        <p className="text-muted-foreground">Informations de l’entreprise et paramètres de l’atelier.</p>
      </div>

      {settings.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {settings.isError && <p className="text-destructive">Impossible de charger les réglages.</p>}

      {settings.isSuccess && (
        <Tabs key={tab} defaultValue={tab} className="gap-4">
          <TabsList className="grid h-auto w-full grid-cols-2 sm:flex sm:w-fit">
            <TabsTrigger value="entreprise">Entreprise</TabsTrigger>
            <TabsTrigger value="facturation">Devis et factures</TabsTrigger>
            <TabsTrigger value="taux">Taux horaires</TabsTrigger>
            <TabsTrigger value="atelier">Atelier</TabsTrigger>
            <TabsTrigger value="sauvegarde">Sauvegarde</TabsTrigger>
          </TabsList>
          <TabsContent value="entreprise" className="space-y-6">
            <LogoCard logoFileId={settings.data.company.logo_file_id} />
            <CompanyForm company={settings.data.company} />
          </TabsContent>
          <TabsContent value="facturation">
            <BillingForm company={settings.data.company} />
          </TabsContent>
          <TabsContent value="taux">
            <LaborRatesForm rates={settings.data.laborRates} />
          </TabsContent>
          <TabsContent value="atelier">
            <WorkshopForm app={settings.data.app} />
          </TabsContent>
          <TabsContent value="sauvegarde">
            <BackupCard lastBackupAt={settings.data.app.last_backup_at} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
