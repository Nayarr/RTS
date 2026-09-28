import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { LoginPage } from '@/features/auth/LoginPage';
import { NewPasswordPage } from '@/features/auth/NewPasswordPage';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { AttendancePage } from '@/features/attendance/AttendancePage';
import { TimesheetPage } from '@/features/attendance/TimesheetPage';
import { RequireRole } from '@/features/auth/RequireRole';
import { ConsumablesPage } from '@/features/catalogs/ConsumablesPage';
import { LeavePage } from '@/features/leave/LeavePage';
import { PackagesPage } from '@/features/catalogs/PackagesPage';
import { PartsPage } from '@/features/catalogs/PartsPage';
import { ContractsPage } from '@/features/contracts/ContractsPage';
import { ClientPage } from '@/features/customers/ClientPage';
import { ClientsPage } from '@/features/customers/ClientsPage';
import { DeadlinesPage } from '@/features/customers/DeadlinesPage';
import { VehiclePage } from '@/features/customers/VehiclePage';
import { VehiclesPage } from '@/features/customers/VehiclesPage';
import { InvoicePage } from '@/features/invoices/InvoicePage';
import { InvoicesPage } from '@/features/invoices/InvoicesPage';
import { AppointmentsPage } from '@/features/planning/AppointmentsPage';
import { PlanningPage } from '@/features/planning/PlanningPage';
import { PublicDocumentPage } from '@/features/public/PublicDocumentPage';
import { NewQuotePage } from '@/features/quotes/NewQuotePage';
import { QuotePage } from '@/features/quotes/QuotePage';
import { QuotesPage } from '@/features/quotes/QuotesPage';
import { NewRepairOrderPage } from '@/features/repair-orders/NewRepairOrderPage';
import { RepairOrderPage } from '@/features/repair-orders/RepairOrderPage';
import { RepairOrdersPage } from '@/features/repair-orders/RepairOrdersPage';
import { StatisticsPage } from '@/features/reporting/StatisticsPage';
import { TreasuryPage } from '@/features/reporting/TreasuryPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { TeamPage } from '@/features/team/TeamPage';
import { WarrantiesPage } from '@/features/warranties/WarrantiesPage';
import { TechRepairOrderPage } from '@/features/workshop/TechRepairOrderPage';
import { AppLayout } from './AppLayout';
import { HomePage } from './HomePage';
import { NotFoundPage } from './NotFoundPage';

/** Chaque écran a sa propre URL : le bouton « retour » et les favoris fonctionnent. */
export const routes: RouteObject[] = [
  { path: '/connexion', element: <LoginPage /> },
  { path: '/mot-de-passe/nouveau', element: <NewPasswordPage /> },
  // Lien envoyé au client (devis à signer) : sans compte.
  { path: '/d/:token', element: <PublicDocumentPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          {
            element: <RequireRole roles={['direction', 'reception']} />,
            children: [
              { path: '/or', element: <RepairOrdersPage /> },
              { path: '/or/nouveau', element: <NewRepairOrderPage /> },
              { path: '/or/:id', element: <RepairOrderPage /> },
              { path: '/planning', element: <PlanningPage /> },
              { path: '/rendez-vous', element: <AppointmentsPage /> },
              { path: '/clients', element: <ClientsPage /> },
              { path: '/clients/:id', element: <ClientPage /> },
              { path: '/vehicules', element: <VehiclesPage /> },
              { path: '/vehicules/echeances', element: <DeadlinesPage /> },
              { path: '/vehicules/:id', element: <VehiclePage /> },
              { path: '/contrats', element: <ContractsPage /> },
              { path: '/devis', element: <QuotesPage /> },
              { path: '/devis/nouveau', element: <NewQuotePage /> },
              { path: '/devis/:id', element: <QuotePage /> },
              { path: '/factures', element: <InvoicesPage /> },
              { path: '/factures/avoirs', element: <InvoicesPage /> },
              { path: '/factures/:id', element: <InvoicePage /> },
              { path: '/garanties', element: <WarrantiesPage /> },
            ],
          },
          {
            element: <RequireRole roles={['technician']} />,
            children: [{ path: '/atelier/or/:id', element: <TechRepairOrderPage /> }],
          },
          {
            element: <RequireRole roles={['direction']} />,
            children: [
              { path: '/equipe', element: <TeamPage /> },
              { path: '/pointages', element: <AttendancePage /> },
              { path: '/pointages/conges', element: <LeavePage /> },
              { path: '/pointages/releve', element: <TimesheetPage /> },
              // Liens des alertes (cloche)
              { path: '/equipe/conges', element: <Navigate to="/pointages/conges" replace /> },
              { path: '/equipe/pointages', element: <Navigate to="/pointages" replace /> },
              { path: '/reglages', element: <SettingsPage /> },
              { path: '/stock', element: <Navigate to="/stock/consommables" replace /> },
              { path: '/stock/consommables', element: <ConsumablesPage /> },
              { path: '/stock/pieces', element: <PartsPage /> },
              { path: '/stock/forfaits', element: <PackagesPage /> },
              { path: '/pilotage', element: <Navigate to="/pilotage/statistiques" replace /> },
              { path: '/pilotage/statistiques', element: <StatisticsPage /> },
              { path: '/pilotage/tresorerie', element: <TreasuryPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

export const createAppRouter = () => createBrowserRouter(routes);
