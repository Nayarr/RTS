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

test('le client consulte son espace en ligne ; le bureau peut changer le lien', async ({
  page,
  browser,
}, testInfo) => {
  test.slow();
  const id = suffix(testInfo);
  const plate = `EC${id}`;
  const clientName = `Client espace ${id}`;
  const order = await createOrder(plate, clientName);

  // Le bureau prépare le lien depuis la fiche client
  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${order.id}`);
  await page.getByRole('link', { name: clientName }).first().click();
  await page.getByRole('button', { name: 'Envoyer le lien au client' }).click();
  const share = page.getByRole('dialog', { name: `Espace client — ${clientName}` });
  const link = await share.getByLabel('Lien', { exact: true }).inputValue();
  expect(link).toMatch(/\/d\/[A-Za-z0-9_-]{32,}$/);
  await page.keyboard.press('Escape');

  // Le client ouvre le lien, sans compte
  const visitor = await browser.newPage();
  await visitor.goto(link);
  await expect(visitor.getByRole('heading', { name: 'Bonjour' })).toBeVisible();
  await expect(visitor.getByText(clientName)).toBeVisible();
  await expect(visitor.getByRole('listitem', { name: plate })).toContainText('À l’atelier — Assigné');

  // Nouveau lien : l'ancien ne fonctionne plus
  await page.getByRole('button', { name: 'Changer le lien' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Changer le lien' }).click();
  const newLink = await page
    .getByRole('dialog', { name: `Espace client — ${clientName}` })
    .getByLabel('Lien', { exact: true })
    .inputValue();
  expect(newLink).not.toBe(link);
  await visitor.reload();
  await expect(visitor.getByText('Ce document est introuvable ou le lien a expiré.')).toBeVisible();
  await visitor.goto(newLink);
  await expect(visitor.getByText(clientName)).toBeVisible();
  await visitor.close();
});
