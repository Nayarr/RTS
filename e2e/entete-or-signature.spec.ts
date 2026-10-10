import { createClient } from '@supabase/supabase-js';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

/** OR sans signature (API : réception). */
async function unsignedOrder(plate: string) {
  const reception = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: false } },
  );
  await reception.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data, error } = await reception.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Remplacement Extincteur 6 kg camion',
  });
  if (error) throw error;
  return data;
}

const middle = async (locator: Locator) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error('élément non affiché');
  return box.y + box.height / 2;
};

test('en-tête de l’OR : « Aucune signature client » au niveau du badge de statut', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Colonne signature sous l’en-tête sur téléphone');
  const order = await unsignedOrder(`SG${String(Date.now()).slice(-7)}D`);
  await loginAs(page, 'direction@rts.local');
  await page.goto(`/or/${order.id}`);

  const header = page.locator('section').filter({ hasText: order.number }).first();
  // OR créé sans technicien : badge « Non assigné »
  const status = header.getByText('Non assigné', { exact: true });
  const warning = header.getByText('Aucune signature client enregistrée.');
  await expect(warning).toBeVisible();
  expect(Math.abs((await middle(warning)) - (await middle(status)))).toBeLessThanOrEqual(2);
});
