import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
const PASSWORD = 'atelier-dev-2026';
// Même code que l'e2e de la borne : les deux tests peuvent tourner en même temps.
const EXIT_CODE = '97531';

// La borne réclame la caméra en quittant le mode télé.
test.use({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
});

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).not.toHaveURL(/\/connexion/);
}

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

async function apiAs(email: string): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  return client;
}

/** OR sans date (donc affiché aujourd'hui), assigné au technicien donné. */
async function createOrder(plate: string, technicianId: string) {
  const office = await apiAs('reception@rts.local');
  const { data, error } = await office.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: `Client télé ${plate}`,
    p_requested_work: 'Remplacement disques avant',
    p_technician_id: technicianId,
  });
  if (error) throw error;
  return data;
}

/** Technicien propre au test : sa colonne ne contient que l'OR du test (4 cartes au plus par colonne). */
async function createTechnician(name: string) {
  const direction = await apiAs('direction@rts.local');
  const { data, error } = await direction
    .from('technicians')
    .insert({ display_name: name })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function deactivateTechnician(id: string) {
  const direction = await apiAs('direction@rts.local');
  await direction.from('technicians').update({ is_active: false }).eq('id', id);
}

test('atelier en direct : la réception voit le véhicule et ouvre son OR', async ({ page }, testInfo) => {
  const id = suffix(testInfo);
  const plate = `LV${id}`;
  const technicianId = await createTechnician(`Tech direct ${id}`);
  const order = await createOrder(plate, technicianId);

  await loginAs(page, 'reception@rts.local');
  await page.getByRole('link', { name: 'En direct' }).click();
  await expect(page.getByRole('heading', { name: 'Atelier en direct' })).toBeVisible();
  const card = page.getByRole('link', { name: new RegExp(plate) });
  await expect(card).toContainText(`Technicien : Tech direct ${id}`);
  await expect(page.getByRole('button', { name: 'Écran atelier (télé)' })).toHaveCount(0);
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/or/${order.id}$`));
  await deactivateTechnician(technicianId);
});

test('la borne devient l’écran atelier, y reste après rechargement, puis en sort avec le code', async ({
  page,
}, testInfo) => {
  test.slow();
  const id = suffix(testInfo);
  const plate = `TV${id}`;
  const technicianName = `Tech télé ${id}`;
  const technicianId = await createTechnician(technicianName);
  await createOrder(plate, technicianId);
  const direction = await apiAs('direction@rts.local');
  const { error } = await direction.rpc('set_kiosk_exit_code', { p_code: EXIT_CODE });
  if (error) throw error;

  await loginAs(page, 'borne@rts.local');
  await page.getByRole('button', { name: 'Quitter la borne' }).click();
  await page.getByLabel('Code de sortie').fill(EXIT_CODE);
  await page.getByRole('button', { name: 'Écran atelier (télé)' }).click();
  await expect(page).toHaveURL(/\/tele$/);

  const column = page.getByRole('region', { name: technicianName });
  await expect(column.getByRole('article', { name: plate })).toContainText('Remplacement disques avant');
  await expect(column.getByRole('article', { name: plate })).toContainText('À faire');
  await expect(page.getByText(/Véhicules attendus aujourd’hui/)).toBeVisible();

  // L'appareil reste en mode télé au redémarrage
  await page.goto('/');
  await expect(page).toHaveURL(/\/tele$/);

  await page.getByRole('button', { name: 'Quitter l’écran atelier' }).click();
  await page.getByLabel('Code de sortie').fill(EXIT_CODE);
  await page.getByRole('dialog').getByRole('button', { name: 'Quitter' }).click();
  await expect(page.getByRole('button', { name: 'Quitter la borne' })).toBeVisible();
  await deactivateTechnician(technicianId);
});
