import { createClient } from '@supabase/supabase-js';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
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

async function receptionClient() {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  return client;
}

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-6)}`;

const tileValue = async (tile: Locator) => Number((await tile.textContent())?.match(/\d+/)?.[0] ?? NaN);

test('accueil tenu à jour en direct, chiffres gardés hors connexion', async ({ page, context }, testInfo) => {
  // Compteurs communs à toute la base : un seul navigateur à la fois
  test.skip(testInfo.project.name.includes('mobile'), 'Compteurs partagés entre navigateurs');
  const plate = `LA${suffix(testInfo)}`;
  await loginAs(page, 'reception@rts.local');
  const freshness = page.getByRole('status', { name: 'Fraîcheur des chiffres' });
  await expect(freshness).toHaveText(/^À jour à \d{2}:\d{2}$/);
  const tile = page
    .getByRole('region', { name: 'Ordres de réparation' })
    .getByRole('link', { name: /Non assigné/ });
  const before = await tileValue(tile);

  // OR créé ailleurs (autre poste) : le compteur bouge sans recharger la page
  const office = await receptionClient();
  const { error } = await office.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: `Client accueil ${plate}`,
    p_requested_work: 'Vidange',
  });
  if (error) throw error;
  await expect.poll(() => tileValue(tile), { timeout: 15_000 }).toBeGreaterThan(before);

  // Sans réseau : les chiffres restent, avec leur date
  await context.setOffline(true);
  await expect(freshness).toHaveText(/^Hors connexion : chiffres du \d{2}\/\d{2} à \d{2}:\d{2}$/);
  await expect(tile).toBeVisible();
  await context.setOffline(false);
  await expect(freshness).toHaveText(/^À jour à \d{2}:\d{2}$/);
});

test('devis accepté saisi par la réception : la direction est prévenue en direct', async ({
  page,
}, testInfo) => {
  test.slow();
  await loginAs(page, 'direction@rts.local');
  const bell = page.getByRole('button', { name: /^Alertes/ });
  await expect(bell).toBeVisible();

  const office = await receptionClient();
  const { data: quote, error } = await office.rpc('create_quote', {
    p_client_name: `Client réponse ${suffix(testInfo)}`,
  });
  if (error) throw error;
  const line = await office
    .from('quote_lines')
    .insert({ quote_id: quote.id, description: 'Diagnostic', unit_price: 90 });
  if (line.error) throw line.error;
  const accepted = await office.rpc('set_quote_response', { p_quote_id: quote.id, p_status: 'accepted' });
  if (accepted.error) throw accepted.error;

  // Sans recharger la page
  await bell.click();
  const dialog = page.getByRole('dialog', { name: 'Alertes' });
  const alert = dialog.getByRole('button', {
    name: new RegExp(`Devis ${accepted.data.number} accepté \\(saisi par `),
  });
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await alert.click();
  await expect(page).toHaveURL(new RegExp(`/devis/${quote.id}$`));
});
