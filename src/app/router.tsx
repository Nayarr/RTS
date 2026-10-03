import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { FullPageMessage } from '@/components/FullPageMessage';
import { LoginPage } from '@/features/auth/LoginPage';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { RequireRole } from '@/features/auth/RequireRole';
import { AppLayout } from './AppLayout';
import { HomePage } from './HomePage';
import { NotFoundPage } from './NotFoundPage';

/**
 * Écran chargé à la demande : chaque écran est un fichier JavaScript séparé, téléchargé
 * la première fois qu'on l'ouvre (le téléphone d'un technicien ne charge jamais la
 * facturation). Le service worker les garde ensuite en cache pour les ouvertures suivantes.
 */
function page<M>(load: () => Promise<M>, name: keyof M & string): RouteObject['lazy'] {
  return async () => ({ Component: (await load())[name] as ComponentType });
}

/** Chaque écran a sa propre URL : le bouton « retour » et les favoris fonctionnent. */
export const routes: RouteObject[] = [
  {
    // Premier affichage d'un écran chargé à la demande (lien ouvert directement, rechargement).
    hydrateFallbackElement: <FullPageMessage />,
    children: [
      { path: '/connexion', element: <LoginPage /> },
      {
        path: '/mot-de-passe/nouveau',
        lazy: page(() => import('@/features/auth/NewPasswordPage'), 'NewPasswordPage'),
      },
      // Lien envoyé au client (devis à signer, facture, espace client) : sans compte.
      {
        path: '/d/:token',
        lazy: page(() => import('@/features/public/PublicDocumentPage'), 'PublicDocumentPage'),
      },
      {
        element: <RequireAuth />,
        children: [
          // Écran atelier (télé) : plein écran, sans menu ; sur la borne ou un poste de la direction.
          {
            element: <RequireRole roles={['direction', 'kiosk']} />,
            children: [
              { path: '/tele', lazy: page(() => import('@/features/workshop-board/TvPage'), 'TvPage') },
            ],
          },
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <HomePage /> },
              {
                element: <RequireRole roles={['direction', 'reception']} />,
                children: [
                  {
                    path: '/or',
                    lazy: page(() => import('@/features/repair-orders/RepairOrdersPage'), 'RepairOrdersPage'),
                  },
                  {
                    path: '/or/nouveau',
                    lazy: page(
                      () => import('@/features/repair-orders/NewRepairOrderPage'),
                      'NewRepairOrderPage',
                    ),
                  },
                  {
                    path: '/or/:id',
                    lazy: page(() => import('@/features/repair-orders/RepairOrderPage'), 'RepairOrderPage'),
                  },
                  {
                    path: '/planning',
                    lazy: page(() => import('@/features/planning/PlanningPage'), 'PlanningPage'),
                  },
                  {
                    path: '/rendez-vous',
                    lazy: page(() => import('@/features/planning/AppointmentsPage'), 'AppointmentsPage'),
                  },
                  {
                    path: '/clients',
                    lazy: page(() => import('@/features/customers/ClientsPage'), 'ClientsPage'),
                  },
                  {
                    path: '/clients/nouveau',
                    lazy: page(() => import('@/features/customers/NewClientPage'), 'NewClientPage'),
                  },
                  {
                    path: '/clients/:id',
                    lazy: page(() => import('@/features/customers/ClientPage'), 'ClientPage'),
                  },
                  {
                    path: '/vehicules',
                    lazy: page(() => import('@/features/customers/VehiclesPage'), 'VehiclesPage'),
                  },
                  {
                    path: '/vehicules/echeances',
                    lazy: page(() => import('@/features/customers/DeadlinesPage'), 'DeadlinesPage'),
                  },
                  {
                    path: '/vehicules/:id',
                    lazy: page(() => import('@/features/customers/VehiclePage'), 'VehiclePage'),
                  },
                  {
                    path: '/location',
                    lazy: page(() => import('@/features/rentals/RentalsOverviewPage'), 'RentalsOverviewPage'),
                  },
                  {
                    path: '/location/contrats',
                    lazy: page(() => import('@/features/rentals/RentalsPage'), 'RentalsPage'),
                  },
                  {
                    path: '/location/nouvelle',
                    lazy: page(() => import('@/features/rentals/NewRentalPage'), 'NewRentalPage'),
                  },
                  {
                    path: '/location/contrats/:id',
                    lazy: page(() => import('@/features/rentals/RentalPage'), 'RentalPage'),
                  },
                  {
                    path: '/location/contrats/:id/depart',
                    lazy: page(() => import('@/features/rentals/RentalDeparturePage'), 'RentalDeparturePage'),
                  },
                  {
                    path: '/location/contrats/:id/retour',
                    lazy: page(() => import('@/features/rentals/RentalReturnPage'), 'RentalReturnPage'),
                  },
                  {
                    path: '/location/flotte',
                    lazy: page(() => import('@/features/rentals/FleetPage'), 'FleetPage'),
                  },
                  {
                    path: '/location/flotte/nouveau',
                    lazy: page(
                      () => import('@/features/rentals/FleetVehicleFormPage'),
                      'FleetVehicleFormPage',
                    ),
                  },
                  {
                    path: '/location/flotte/:id',
                    lazy: page(() => import('@/features/rentals/FleetVehiclePage'), 'FleetVehiclePage'),
                  },
                  {
                    path: '/location/flotte/:id/modifier',
                    lazy: page(
                      () => import('@/features/rentals/FleetVehicleFormPage'),
                      'FleetVehicleFormPage',
                    ),
                  },
                  {
                    path: '/contrats',
                    lazy: page(() => import('@/features/contracts/ContractsPage'), 'ContractsPage'),
                  },
                  { path: '/devis', lazy: page(() => import('@/features/quotes/QuotesPage'), 'QuotesPage') },
                  {
                    path: '/devis/nouveau',
                    lazy: page(() => import('@/features/quotes/NewQuotePage'), 'NewQuotePage'),
                  },
                  {
                    path: '/devis/:id',
                    lazy: page(() => import('@/features/quotes/QuotePage'), 'QuotePage'),
                  },
                  {
                    path: '/factures',
                    lazy: page(() => import('@/features/invoices/InvoicesPage'), 'InvoicesPage'),
                  },
                  {
                    path: '/factures/avoirs',
                    lazy: page(() => import('@/features/invoices/InvoicesPage'), 'InvoicesPage'),
                  },
                  {
                    path: '/factures/:id',
                    lazy: page(() => import('@/features/invoices/InvoicePage'), 'InvoicePage'),
                  },
                  {
                    path: '/garanties',
                    lazy: page(() => import('@/features/warranties/WarrantiesPage'), 'WarrantiesPage'),
                  },
                  {
                    path: '/atelier-en-direct',
                    lazy: page(
                      () => import('@/features/workshop-board/LiveWorkshopPage'),
                      'LiveWorkshopPage',
                    ),
                  },
                ],
              },
              {
                element: <RequireRole roles={['direction', 'reception', 'technician']} />,
                children: [
                  { path: '/aide', lazy: page(() => import('@/features/help/HelpPage'), 'HelpPage') },
                ],
              },
              {
                element: <RequireRole roles={['technician']} />,
                children: [
                  {
                    path: '/atelier/or/:id',
                    lazy: page(
                      () => import('@/features/workshop/TechRepairOrderPage'),
                      'TechRepairOrderPage',
                    ),
                  },
                ],
              },
              {
                element: <RequireRole roles={['direction']} />,
                children: [
                  { path: '/equipe', lazy: page(() => import('@/features/team/TeamPage'), 'TeamPage') },
                  {
                    path: '/pointages',
                    lazy: page(() => import('@/features/attendance/AttendancePage'), 'AttendancePage'),
                  },
                  {
                    path: '/pointages/conges',
                    lazy: page(() => import('@/features/leave/LeavePage'), 'LeavePage'),
                  },
                  {
                    path: '/pointages/releve',
                    lazy: page(() => import('@/features/attendance/TimesheetPage'), 'TimesheetPage'),
                  },
                  // Liens des alertes (cloche)
                  { path: '/equipe/conges', element: <Navigate to="/pointages/conges" replace /> },
                  { path: '/equipe/pointages', element: <Navigate to="/pointages" replace /> },
                  {
                    path: '/reglages',
                    lazy: page(() => import('@/features/settings/SettingsPage'), 'SettingsPage'),
                  },
                  { path: '/stock', element: <Navigate to="/stock/consommables" replace /> },
                  {
                    path: '/stock/consommables',
                    lazy: page(() => import('@/features/catalogs/ConsumablesPage'), 'ConsumablesPage'),
                  },
                  {
                    path: '/stock/pieces',
                    lazy: page(() => import('@/features/catalogs/PartsPage'), 'PartsPage'),
                  },
                  {
                    path: '/stock/forfaits',
                    lazy: page(() => import('@/features/catalogs/PackagesPage'), 'PackagesPage'),
                  },
                  { path: '/pilotage', element: <Navigate to="/pilotage/statistiques" replace /> },
                  {
                    path: '/pilotage/statistiques',
                    lazy: page(() => import('@/features/reporting/StatisticsPage'), 'StatisticsPage'),
                  },
                  {
                    path: '/pilotage/tresorerie',
                    lazy: page(() => import('@/features/reporting/TreasuryPage'), 'TreasuryPage'),
                  },
                  {
                    path: '/pilotage/rentabilite',
                    lazy: page(() => import('@/features/reporting/ProfitabilityPage'), 'ProfitabilityPage'),
                  },
                  {
                    path: '/pilotage/performance',
                    lazy: page(() => import('@/features/reporting/PerformancePage'), 'PerformancePage'),
                  },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
