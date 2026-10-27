import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';
// PNG 1×1 : photo factice (assez légère pour ne pas être recompressée).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Se déconnecter' }).first().click();
  await expect(page).toHaveURL(/\/connexion$/);
}

/** Devis accepté (embrayage et dépose/repose des roues avant), puis OR créé pour Alice (API : réception). */
async function orderFromQuote(plate: string, clientName: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: quote, error } = await client.rpc('create_quote', {
    p_client_name: clientName,
    p_plate: plate,
    p_vehicle_type: 'pl',
  });
  if (error) throw error;
  const lines = await client.from('quote_lines').insert([
    {
      quote_id: quote.id,
      position: 0,
      line_type: 'labor',
      description: 'Remplacement embrayage',
      estimated_hours: 3,
      unit_price: 85,
      quantity: 3,
    },
    {
      quote_id: quote.id,
      position: 1,
      line_type: 'package',
      description: 'DÉPOSE/REPOSE ROUE (avant)',
      unit_price: 18,
      quantity: 2,
    },
  ]);
  if (lines.error) throw lines.error;
  const accepted = await client.rpc('set_quote_response', { p_quote_id: quote.id, p_status: 'accepted' });
  if (accepted.error) throw accepted.error;
  const { data: alice } = await client.from('technicians').select('id').eq('display_name', 'Alice').single();
  const created = await client.rpc('create_repair_order_from_quote', {
    p_quote_id: quote.id,
    p_technician_id: alice?.id,
  });
  if (created.error) throw created.error;
  return created.data;
}

test('OR issu d’un devis : forfaits des pneus à leur prix, « Terminé atelier » à la fin des travaux', async ({
  page,
}, testInfo) => {
  test.slow();
  const id = `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-6)}`;
  const plate = `QF${id}`;
  const orderId = await orderFromQuote(plate, `Client devis facture ${id}`);

  // Technicien : ses temps, la photo du contrôle technique, travaux terminés
  await loginAs(page, 'alice@rts.local');
  await page.goto(`/atelier/or/${orderId}`);
  await expect(page.getByRole('heading', { name: plate, level: 1 })).toBeVisible();
  const done = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('heading', { name: 'Travaux effectués' }) });
  const tasks = done.getByRole('textbox', { name: 'Description de la tâche' });
  await expect(tasks).toHaveCount(2);
  const times = done.getByRole('combobox', { name: 'Temps estimé' });
  for (const index of [0, 1]) {
    await times.nth(index).selectOption('1h');
    await expect(times.nth(index)).toHaveValue('1h');
  }
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Photo du contrôle technique', exact: true }).click();
  await (await chooser).setFiles({ name: 'ct.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('button', { name: 'Photo du contrôle technique (déjà prise)' })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('group', { name: 'Devis nécessaire ?' }).getByRole('button', { name: 'NON' }).click();
  await page.getByRole('button', { name: 'Travaux terminés' }).click();
  await expect(page.getByRole('heading', { name: 'Mes ordres de réparation' })).toBeVisible();
  await logout(page);

  // Bureau : OR « Terminé atelier », à valider ; forfait des pneus à son prix, sans temps de barème
  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${orderId}`);
  await expect(page.getByText('Terminé atelier').first()).toBeVisible();
  const lines = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('heading', { name: 'Intervention atelier' }) });
  await expect(lines.getByText('2 × 18,00 € HT')).toBeVisible();
  await expect(lines.getByText(/\(barème\)/)).toHaveCount(0);
});
