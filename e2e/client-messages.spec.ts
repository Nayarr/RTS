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

/** OR en cours pour un nouveau client (API : réception). */
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

test('la réception informe le client de la prise en charge ; l’envoi est tracé', async ({
  page,
}, testInfo) => {
  test.slow();
  const id = suffix(testInfo);
  const plate = `MC${id}`;
  const order = await createOrder(plate, `Client message ${id}`);

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${order.id}`);
  const card = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('heading', { name: 'Informer le client' }) });
  await expect(card).toContainText('Suggestion : « Véhicule pris en charge »');

  await card.getByRole('button', { name: 'Véhicule pris en charge' }).click();
  const dialog = page.getByRole('dialog', { name: 'Véhicule pris en charge' });
  await dialog.getByLabel('Téléphone du client').fill('06 12 34 56 78');
  const sms = dialog.getByRole('link', { name: /Envoyer par SMS/ });
  await expect(sms).toHaveAttribute('href', new RegExp(`^sms:0612345678\\?body=.*${plate}`));
  // Le lien « sms: » ouvrirait l'appli de messagerie : on garde la page.
  await sms.evaluate((link) => link.addEventListener('click', (event) => event.preventDefault()));
  await sms.click();
  await page.keyboard.press('Escape');

  await expect(page.getByText('Message au client (SMS) : Véhicule pris en charge')).toBeVisible();
  await expect(card.getByRole('button', { name: /Véhicule pris en charge\s*\(déjà envoyé\)/ })).toBeVisible();
  await expect(card).not.toContainText('Suggestion');
});
