import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
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

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

/** OR créé par la réception (API). */
async function createOrder(plate: string, clientName: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data, error } = await client.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: clientName,
    p_requested_work: 'Freinage',
  });
  if (error) throw error;
  return data;
}

test('la réception retrouve un OR, un véhicule et un client depuis la recherche', async ({
  page,
}, testInfo) => {
  test.slow();
  const id = suffix(testInfo);
  const plate = `RS-${id.slice(0, 3)}-${id.slice(3)}`;
  const clientName = `Client recherche ${id}`;
  const order = await createOrder(plate, clientName);

  await loginAs(page, 'reception@rts.local');
  // Plaque saisie sans tirets
  await page.getByRole('button', { name: 'Rechercher' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rechercher' });
  await dialog
    .getByRole('searchbox', { name: 'Rechercher partout' })
    .fill(plate.replaceAll('-', '').toLowerCase());
  await expect(dialog.getByRole('region', { name: 'Véhicules' })).toContainText(plate);
  await dialog
    .getByRole('region', { name: 'Ordres de réparation' })
    .getByRole('link', { name: new RegExp(plate) })
    .click();
  await expect(page).toHaveURL(new RegExp(`/or/${order.id}$`));
  await expect(dialog).toBeHidden();

  // Client par nom partiel (raccourci Ctrl+K)
  await page.keyboard.press('Control+k');
  await dialog.getByRole('searchbox', { name: 'Rechercher partout' }).fill(`recherche ${id}`);
  await expect(dialog.getByRole('region', { name: 'Clients' })).toContainText(clientName);
  await dialog.getByRole('region', { name: 'Clients' }).getByRole('link', { name: clientName }).click();
  await expect(page.getByRole('heading', { name: clientName })).toBeVisible();
});

test('pas de recherche du bureau pour le technicien', async ({ page }) => {
  await loginAs(page, 'alice@rts.local');
  await expect(page.getByRole('button', { name: 'Rechercher' })).toHaveCount(0);
});
