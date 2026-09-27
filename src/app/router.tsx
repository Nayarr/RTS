import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { LoginPage } from '@/features/auth/LoginPage';
import { NewPasswordPage } from '@/features/auth/NewPasswordPage';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { RequireRole } from '@/features/auth/RequireRole';
import { ConsumablesPage } from '@/features/catalogs/ConsumablesPage';
import { PartsPage } from '@/features/catalogs/PartsPage';
import { InvoicePage } from '@/features/invoices/InvoicePage';
import { InvoicesPage } from '@/features/invoices/InvoicesPage';
import { PublicDocumentPage } from '@/features/public/PublicDocumentPage';
import { NewQuotePage } from '@/features/quotes/NewQuotePage';
import { QuotePage } from '@/features/quotes/QuotePage';
import { QuotesPage } from '@/features/quotes/QuotesPage';
import { NewRepairOrderPage } from '@/features/repair-orders/NewRepairOrderPage';
import { RepairOrderPage } from '@/features/repair-orders/RepairOrderPage';
import { RepairOrdersPage } from '@/features/repair-orders/RepairOrdersPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { TeamPage } from '@/features/team/TeamPage';
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
              { path: '/devis', element: <QuotesPage /> },
              { path: '/devis/nouveau', element: <NewQuotePage /> },
              { path: '/devis/:id', element: <QuotePage /> },
              { path: '/factures', element: <InvoicesPage /> },
              { path: '/factures/avoirs', element: <InvoicesPage /> },
              { path: '/factures/:id', element: <InvoicePage /> },
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
              { path: '/reglages', element: <SettingsPage /> },
              { path: '/stock', element: <Navigate to="/stock/consommables" replace /> },
              { path: '/stock/consommables', element: <ConsumablesPage /> },
              { path: '/stock/pieces', element: <PartsPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

export const createAppRouter = () => createBrowserRouter(routes);
