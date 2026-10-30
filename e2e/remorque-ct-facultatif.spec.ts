import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { sql } from './support/db';

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

/** OR assigné à Alice (API de la réception, comme le bureau). */
async function orderFor(vehicleType: 'pl' | 'remorque', plate: string) {
  const reception = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: false } },
  );
  await reception.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: order, error } = await reception.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: vehicleType,
    p_client_name: 'Transports remorques',
    p_requested_work: 'Freinage',
  });
  if (error) throw error;
  sql(`update public.repair_orders set technician_id = (select id from public.technicians where display_name = 'Alice')
       where id = '${order.id}'`);
  return order.id;
}

test('remorque : photo du contrôle technique facultative pour terminer l’OR', async ({ page }, testInfo) => {
  const id = `${String(Date.now()).slice(-5)}${Math.floor(Math.random() * 90 + 10)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const trailer = await orderFor('remorque', `RQ${id}`);
  const truck = await orderFor('pl', `PL${id}`);

  await loginAs(page, 'alice@rts.local');
  await page.goto(`/atelier/or/${trailer}`);
  await expect(page.getByRole('heading', { name: 'Échéances du véhicule' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Photo du contrôle technique' })).toBeVisible();
  await expect(page.getByText('Photo du contrôle technique obligatoire avant de terminer l’OR.')).toHaveCount(
    0,
  );
  await page.getByRole('group', { name: 'Devis nécessaire ?' }).getByRole('button', { name: 'NON' }).click();
  await expect(page.getByText('Photo du contrôle technique obligatoire', { exact: true })).toHaveCount(0);

  // Poids lourd : toujours exigée
  await page.goto(`/atelier/or/${truck}`);
  await expect(
    page.getByText('Photo du contrôle technique obligatoire avant de terminer l’OR.'),
  ).toBeVisible();
});
