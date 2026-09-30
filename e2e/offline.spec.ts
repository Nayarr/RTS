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

function client() {
  return createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
}

/** OR assigné à Alice par la réception (API, comme le ferait l'écran bureau). */
async function createOrderForAlice(plate: string) {
  const reception = client();
  await reception.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: alice } = await reception
    .from('technicians')
    .select('id')
    .eq('display_name', 'Alice')
    .single();
  const { data, error } = await reception.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: `Hors ligne ${plate}`,
    p_requested_work: 'Contrôle freinage',
    p_technician_id: alice?.id,
  });
  if (error) throw error;
  return data;
}

/** Appli installée par le service worker (fichiers en cache) : prête à rouvrir sans réseau. */
async function waitForOfflineReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve));
    }
  });
}

test('sans réseau, le technicien rouvre ses OR et son kilométrage part au retour du réseau', async ({
  page,
  context,
}, testInfo) => {
  test.slow(); // rechargements et attente du cache sur l'appareil
  const plate = `HL${String(Date.now()).slice(-6)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const order = await createOrderForAlice(plate);

  await loginAs(page, 'alice@rts.local');
  await waitForOfflineReady(page);
  await page.getByRole('link', { name: new RegExp(plate) }).click();
  await expect(page.getByRole('heading', { name: plate, level: 1 })).toBeVisible();
  // Laisse le temps au cache d'être écrit sur l'appareil (écritures regroupées toutes les 2 s)
  await page.waitForTimeout(2500);

  // Coupure du réseau : bandeau, puis réouverture de l'appli depuis le cache
  await context.setOffline(true);
  await expect(page.getByRole('status')).toContainText('Hors connexion');
  await page.reload();
  await expect(page.getByRole('heading', { name: plate, level: 1 })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Hors connexion');

  // Kilométrage saisi hors connexion : mis en attente
  await page.getByLabel('Kilométrage').fill('250000');
  await page.getByLabel('Kilométrage').press('Enter');
  await expect(page.getByRole('status')).toContainText('1 modification en attente.');

  // Retour du réseau : envoi automatique
  await context.setOffline(false);
  await expect(page.getByText('Connexion rétablie : envoi des modifications en attente')).toBeVisible();
  await expect(page.getByText('Kilométrage enregistré')).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);

  const reception = client();
  await reception.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data } = await reception.from('repair_orders').select('mileage').eq('id', order.id).single();
  expect(data?.mileage).toBe(250000);
});

test('à la déconnexion, les données gardées pour le hors-ligne sont effacées', async ({ page }) => {
  await loginAs(page, 'alice@rts.local');
  await expect(page.getByRole('heading', { name: 'Mes ordres de réparation' })).toBeVisible();
  const cacheKeys = () =>
    page.evaluate(
      () =>
        new Promise<string[]>((resolve, reject) => {
          const request = indexedDB.open('rts-atelier', 1);
          request.onupgradeneeded = () => request.result.createObjectStore('cache');
          request.onerror = () => reject(new Error('IndexedDB'));
          request.onsuccess = () => {
            const keys = request.result.transaction('cache').objectStore('cache').getAllKeys();
            keys.onsuccess = () => {
              resolve(keys.result.map(String));
              request.result.close();
            };
          };
        }),
    );
  await expect
    .poll(cacheKeys, { timeout: 10_000 })
    .toContainEqual(expect.stringMatching(/^rts-query-cache:/));

  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/connexion$/);
  await expect.poll(cacheKeys).toEqual([]);
});
