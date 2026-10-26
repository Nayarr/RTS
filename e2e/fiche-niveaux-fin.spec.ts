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

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Se déconnecter' }).first().click();
  await expect(page).toHaveURL(/\/connexion$/);
}

/** OR assigné à Alice par la réception (API). */
async function orderForAlice(plate: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: alice } = await client.from('technicians').select('id').eq('display_name', 'Alice').single();
  const { data, error } = await client.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Contrôle complet',
    p_technician_id: alice?.id,
  });
  if (error) throw error;
  return data;
}

/** Vrai si `first` est avant `second` dans la page. */
const isBefore = async (first: Locator, second: Locator) => {
  const handle = await second.elementHandle();
  return first.evaluate(
    (node, other) => Boolean(other && node.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING),
    handle,
  );
};

test('fiche de contrôle : les niveaux viennent en dernier, pour le technicien et au bureau', async ({
  page,
}, testInfo) => {
  const plate = `NV${String(Date.now()).slice(-7)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const order = await orderForAlice(plate);

  await loginAs(page, 'alice@rts.local');
  await page.goto(`/atelier/or/${order.id}`);
  const sheet = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('heading', { name: 'Fiche de contrôle véhicule' }) });
  const firstWear = sheet.getByRole('radiogroup', { name: 'Plaquettes avant' });
  const electric = sheet.getByRole('radiogroup', { name: 'Problème électrique constaté' });
  const oil = sheet.getByRole('radiogroup', { name: 'Huile' });
  await expect(oil).toBeVisible();
  expect(await isBefore(firstWear, oil)).toBe(true);
  expect(await isBefore(electric, oil)).toBe(true);
  await oil.getByRole('radio', { name: 'Niveau bon' }).click();
  await expect(oil.getByRole('radio', { name: 'Niveau bon' })).toBeChecked();
  await expect(sheet.getByText('Enregistrée automatiquement.', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Retour à mes OR' }).click();
  await logout(page);

  // Bureau : la colonne « Niveaux » après « Contrôles »
  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${order.id}`);
  const card = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('heading', { name: /Fiche de contrôle/ }) });
  const levels = card.getByRole('heading', { name: 'Niveaux' });
  await expect(levels).toBeVisible();
  expect(await isBefore(card.getByRole('heading', { name: 'Contrôles' }), levels)).toBe(true);
  await expect(card.getByText('Niveau bon')).toBeVisible();
});
