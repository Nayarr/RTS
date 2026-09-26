import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import type { Session } from '@supabase/supabase-js';
import { AuthContext, type AuthState } from '@/features/auth/auth-context';

/** Session factice pour les tests. */
export function fakeSession(email = 'direction@test.fr'): Session {
  return {
    access_token: 'token',
    refresh_token: 'refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: '00000000-0000-0000-0000-0000000000d1',
      email,
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-09-26T00:00:00Z',
    },
  };
}

interface RenderOptions {
  initialPath?: string;
  auth?: Partial<AuthState>;
}

/** Rend des routes avec le routeur, React Query et un état d'authentification simulé. */
export function renderRoutes(routes: RouteObject[], { initialPath = '/', auth }: RenderOptions = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const authState: AuthState = { session: null, isLoading: false, ...auth };

  const wrapper = (children: ReactNode) => (
    <QueryClientProvider client={queryClient}>
      <AuthContext value={authState}>{children}</AuthContext>
    </QueryClientProvider>
  );

  return { router, ...render(wrapper(<RouterProvider router={router} />)) };
}
