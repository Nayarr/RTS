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

const newClient = () =>
  createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });

async function receptionClient() {
  const client = newClient();
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  return client;
}

test('un devis refusé en ligne arrive en direct dans la cloche de la direction', async ({
  page,
}, testInfo) => {
  test.slow();
  await loginAs(page, 'direction@rts.local');
  const bell = page.getByRole('button', { name: /^Alertes/ });
  await expect(bell).toBeVisible();

  // Devis envoyé par la réception, refusé par le client depuis son lien (sans compte)
  const office = await receptionClient();
  const { data: quote, error } = await office.rpc('create_quote', {
    p_client_name: `Client alerte ${suffix(testInfo)}`,
  });
  if (error) throw error;
  const line = await office
    .from('quote_lines')
    .insert({ quote_id: quote.id, description: 'Diagnostic', unit_price: 90 });
  if (line.error) throw line.error;
  const shared = await office.rpc('share_quote', { p_quote_id: quote.id });
  if (shared.error) throw shared.error;
  const { data: sent } = await office.from('quotes').select('number').eq('id', quote.id).single();
  const refused = await newClient().functions.invoke('quote-response', {
    body: { token: shared.data, accept: false, signer_name: '', signature: null },
  });
  if (refused.error) throw refused.error;

  // Sans recharger la page
  await bell.click();
  const dialog = page.getByRole('dialog', { name: 'Alertes' });
  const alert = dialog.getByRole('button', { name: new RegExp(`Devis ${sent?.number} refusé en ligne`) });
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await alert.click();
  await expect(page).toHaveURL(new RegExp(`/devis/${quote.id}$`));
});

test('le tableau de bord mène aux OR qui attendent des pièces', async ({ page }, testInfo) => {
  const plate = `DB${suffix(testInfo)}`;
  const office = await receptionClient();
  const { data: order, error } = await office.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: `Client tableau ${plate}`,
    p_requested_work: 'Freinage',
  });
  if (error) throw error;
  const part = await office.from('ro_lines').insert({
    repair_order_id: order.id,
    kind: 'planned',
    line_type: 'part',
    description: 'Disques avant',
    quantity: 2,
    order_status: 'to_order',
  });
  if (part.error) throw part.error;

  await loginAs(page, 'reception@rts.local');
  const orders = page.getByRole('region', { name: 'Ordres de réparation' });
  const tile = orders.getByRole('link', { name: /Pièces à commander/ });
  await expect(tile).not.toHaveText(/^0/);
  await tile.click();
  await expect(page).toHaveURL(/\/or\?filtre=parts$/);
  await expect(page.getByRole('button', { name: /^Pièces en attente/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText(plate).first()).toBeVisible();
  // La réception ne traite pas les congés
  await page.goto('/');
  await expect(
    page.getByRole('region', { name: 'À suivre' }).getByRole('link', { name: /congé/ }),
  ).toHaveCount(0);
});

test('pas de cloche ni de tableau de bord pour le technicien', async ({ page }) => {
  await loginAs(page, 'alice@rts.local');
  await expect(page.getByRole('heading', { name: 'Mes ordres de réparation' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Alertes/ })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'À suivre' })).toHaveCount(0);
});
