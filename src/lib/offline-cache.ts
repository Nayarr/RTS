import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Query } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Données déjà consultées gardées sur l'appareil (IndexedDB) : sans réseau, l'appli
 * rouvre avec les derniers OR, clients, plannings… au lieu d'un écran vide.
 */
const DB_NAME = 'rts-atelier';
const STORE = 'cache';

/** Durée de conservation : au-delà, les données sont jugées trop anciennes et oubliées. */
export const OFFLINE_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

/** Change à chaque mise en ligne : un cache d'une ancienne version n'est jamais relu. */
export const OFFLINE_CACHE_BUSTER = __BUILD_ID__;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB indisponible'));
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB indisponible'));
    });
  } finally {
    db.close();
  }
}

/** Stockage clé → texte dans IndexedDB (bien plus de place que le localStorage). */
export const indexedDbStorage = {
  getItem: async (key: string) => {
    const value: unknown = await run('readonly', (s) => s.get(key));
    return typeof value === 'string' ? value : null;
  },
  setItem: async (key: string, value: string) => {
    await run('readwrite', (s) => s.put(value, key));
  },
  removeItem: async (key: string) => {
    await run('readwrite', (s) => s.delete(key));
  },
};

const CACHE_KEY = 'rts-query-cache';

/** Un cache par compte : sur un appareil partagé, personne ne relit les données d'un autre. */
async function accountKey(key: string): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  return userId ? `${key}:${userId}` : null;
}

export const accountStorage = {
  getItem: async (key: string) => {
    const scoped = await accountKey(key);
    return scoped ? indexedDbStorage.getItem(scoped) : null;
  },
  setItem: async (key: string, value: string) => {
    const scoped = await accountKey(key);
    if (scoped) await indexedDbStorage.setItem(scoped, value);
  },
  removeItem: async (key: string) => {
    const scoped = await accountKey(key);
    if (scoped) await indexedDbStorage.removeItem(scoped);
  },
};

/** Persistance du cache ; null si le navigateur n'a pas d'IndexedDB (tests, navigateur très ancien). */
export function createOfflinePersister() {
  if (typeof indexedDB === 'undefined') return null;
  return createAsyncStoragePersister({ storage: accountStorage, key: CACHE_KEY, throttleTime: 2000 });
}

/** À la déconnexion (session encore ouverte) : le cache du compte est effacé de l'appareil. */
export async function forgetOfflineCache(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await accountStorage.removeItem(CACHE_KEY);
}

/**
 * Requêtes gardées : réussies et utiles hors ligne. Les liens signés des fichiers
 * (valables 1 h) et l'état des notifications de l'appareil ne sont pas conservés.
 */
const NOT_PERSISTED = new Set(['file-urls', 'push-subscription']);
export const shouldPersistQuery = (query: Query) =>
  query.state.status === 'success' && !NOT_PERSISTED.has(String(query.queryKey[0]));
