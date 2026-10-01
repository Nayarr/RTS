import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
}

/** Appareils abonnés du compte (lecture de ses propres abonnements, comme le permet le RLS). */
async function subscribedEndpoints(email: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  const { data } = await client.from('push_subscriptions').select('endpoint');
  return (data ?? []).map((row) => row.endpoint);
}

// Chromium sans affichage refuse toujours les notifications et ne joint pas les vrais
// services de push : autorisation et abonnement sont simulés (adresse unique, vraie clé
// de chiffrement), conservés au rechargement. Tout le reste est celui de l'appli.
test.beforeEach(async ({ page }, testInfo) => {
  const endpoint = `https://push.example/e2e-${testInfo.project.name.includes('mobile') ? 'm' : 'd'}-${Date.now()}`;
  await page.addInitScript((pushEndpoint) => {
    const PERMISSION = 'e2e_notification_permission';
    const SUBSCRIPTION = 'e2e_push_subscription';
    Object.defineProperty(Notification, 'permission', {
      configurable: true,
      get: () => localStorage.getItem(PERMISSION) ?? 'default',
    });
    Notification.requestPermission = () => {
      localStorage.setItem(PERMISSION, 'granted');
      return Promise.resolve('granted');
    };

    const subscriptionFrom = (keys: { p256dh: string; auth: string }) =>
      ({
        endpoint: pushEndpoint,
        toJSON: () => ({ endpoint: pushEndpoint, keys }),
        unsubscribe: () => {
          localStorage.removeItem(SUBSCRIPTION);
          return Promise.resolve(true);
        },
      }) as unknown as PushSubscription;
    const toBase64Url = (buffer: ArrayBuffer) =>
      btoa(String.fromCharCode(...new Uint8Array(buffer)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    PushManager.prototype.getSubscription = () => {
      const saved = localStorage.getItem(SUBSCRIPTION);
      return Promise.resolve(
        saved ? subscriptionFrom(JSON.parse(saved) as { p256dh: string; auth: string }) : null,
      );
    };
    PushManager.prototype.subscribe = async () => {
      const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
        'deriveBits',
      ]);
      const keys = {
        p256dh: toBase64Url(await crypto.subtle.exportKey('raw', pair.publicKey)),
        auth: toBase64Url(crypto.getRandomValues(new Uint8Array(16)).buffer),
      };
      localStorage.setItem(SUBSCRIPTION, JSON.stringify(keys));
      return subscriptionFrom(keys);
    };
  }, endpoint);
});

test('le technicien active les notifications ; la déconnexion les coupe sur cet appareil', async ({
  page,
}) => {
  await loginAs(page, 'bruno@rts.local');
  const banner = page.getByRole('region', { name: 'Notifications de l’appareil' });
  await expect(banner).toContainText('sois prévenu dès qu’un devis est accepté');

  await banner.getByRole('button', { name: 'Activer les notifications' }).click();
  await expect(page.getByText('Notifications activées sur cet appareil')).toBeVisible({ timeout: 25_000 }); // 1re ouverture : installation du service worker
  await expect(banner).toHaveCount(0);
  await expect
    .poll(() => subscribedEndpoints('bruno@rts.local'))
    .toContainEqual(expect.stringMatching(/^https:\/\/push\.example\/e2e-/));

  // Rechargement : l'appareil est reconnu comme abonné, plus d'invitation
  await page.reload();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
  await expect(banner).toHaveCount(0);

  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/connexion$/);
  const endpoint = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return (await registration.pushManager.getSubscription())?.endpoint ?? null;
  });
  expect(endpoint).toBeNull();
});

test('« Plus tard » masque l’invitation, qui ne revient pas au rechargement', async ({ page }) => {
  await loginAs(page, 'reception@rts.local');
  const banner = page.getByRole('region', { name: 'Notifications de l’appareil' });
  await banner.getByRole('button', { name: 'Plus tard' }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
  await expect(banner).toHaveCount(0);
});
