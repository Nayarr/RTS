import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { RouterProvider } from 'react-router';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { OfflineBanner } from '@/features/offline/OfflineBanner';
import {
  createOfflinePersister,
  OFFLINE_CACHE_BUSTER,
  OFFLINE_CACHE_MAX_AGE,
  shouldPersistQuery,
} from '@/lib/offline-cache';
import { createAppRouter } from './router';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        // Données gardées en mémoire (et sur l'appareil) aussi longtemps que le cache hors ligne.
        gcTime: OFFLINE_CACHE_MAX_AGE,
        retry: 1,
        refetchOnWindowFocus: true,
      },
    },
  });
}

export function App() {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(createAppRouter);
  const [persister] = useState(createOfflinePersister);

  const content = (
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster position="top-center" richColors closeButton />
      <OfflineBanner />
    </AuthProvider>
  );

  if (!persister) return <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>;
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: OFFLINE_CACHE_MAX_AGE,
        buster: OFFLINE_CACHE_BUSTER,
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
      }}
      // Données restaurées : affichées tout de suite, puis relues dès que le réseau le permet.
      onSuccess={() => queryClient.invalidateQueries()}
    >
      {content}
    </PersistQueryClientProvider>
  );
}
