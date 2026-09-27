import { createBrowserRouter, type RouteObject } from 'react-router';
import { LoginPage } from '@/features/auth/LoginPage';
import { NewPasswordPage } from '@/features/auth/NewPasswordPage';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { RequireRole } from '@/features/auth/RequireRole';
import { NewRepairOrderPage } from '@/features/repair-orders/NewRepairOrderPage';
import { RepairOrderPage } from '@/features/repair-orders/RepairOrderPage';
import { RepairOrdersPage } from '@/features/repair-orders/RepairOrdersPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { TeamPage } from '@/features/team/TeamPage';
import { AppLayout } from './AppLayout';
import { HomePage } from './HomePage';
import { NotFoundPage } from './NotFoundPage';

/** Chaque écran a sa propre URL : le bouton « retour » et les favoris fonctionnent. */
export const routes: RouteObject[] = [
  { path: '/connexion', element: <LoginPage /> },
  { path: '/mot-de-passe/nouveau', element: <NewPasswordPage /> },
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
            ],
          },
          {
            element: <RequireRole roles={['direction']} />,
            children: [
              { path: '/equipe', element: <TeamPage /> },
              { path: '/reglages', element: <SettingsPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

export const createAppRouter = () => createBrowserRouter(routes);
