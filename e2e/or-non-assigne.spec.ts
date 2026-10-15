import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
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

/** OR créé sans technicien (API : réception). */
async function unassignedOrder(plate: string) {
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
    p_requested_work: 'Contrôle freinage',
  });
  if (error) throw error;
  return data;
}

test('OR sans technicien : rangé dans « Non assigné », pas dans « Assigné »', async ({ page }) => {
  const plate = `NA${String(Date.now()).slice(-7)}E`;
  await unassignedOrder(plate);
  await loginAs(page, 'reception@rts.local');

  // Tableau de bord : tuile dédiée, qui mène au filtre
  await page.goto('/');
  await page
    .getByRole('link', { name: /Non assigné/ })
    .first()
    .click();
  await expect(page).toHaveURL(/filtre=unassigned/);

  const search = page.getByRole('searchbox', { name: 'Rechercher un OR' });
  await search.fill(plate);
  await expect(page.getByText(plate).first()).toBeVisible();

  await page.getByRole('button', { name: /^Assigné/ }).click();
  await expect(page.getByText('Aucun ordre de réparation ne correspond.')).toBeVisible();
});
