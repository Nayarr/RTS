import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { sql } from './support/db';
import { parisDay } from './support/dates';

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

test('charge atelier, vue jour : temps saisi un samedi, jauge gardée', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Tableau de bord du bureau');
  // Dernier samedi passé (atelier fermé), au calendrier de Paris
  const today = parisDay();
  const back = (new Date(`${today}T12:00:00Z`).getUTCDay() + 1) % 7 || 7;
  const saturday = parisDay(-back);
  const reception = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: false } },
  );
  await reception.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: order, error } = await reception.rpc('create_repair_order', {
    p_plate: `SA${String(Date.now()).slice(-7)}`,
    p_vehicle_type: 'pl',
    p_client_name: 'Client du samedi',
    p_requested_work: 'Dépannage',
  });
  if (error) throw error;
  // Travail déclaré par Alice ce samedi-là
  sql(`insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours, technician_id, created_at)
       select '${order.id}', 'done', 'labor', 'Dépannage du samedi', 2, t.id,
              ('${saturday}'::date + time '10:00') at time zone 'Europe/Paris'
       from public.technicians t where t.display_name = 'Alice'`);

  await loginAs(page, 'reception@rts.local');
  const card = page.getByRole('region', { name: 'Charge de travail atelier' });
  await card.getByRole('tab', { name: 'Jour' }).click();
  for (let day = 0; day < back; day += 1) {
    await card.getByRole('button', { name: 'Période précédente' }).click();
  }
  const alice = card.getByRole('listitem', { name: 'Alice' });
  await expect(alice).toContainText('hors heures d’ouverture');
  await expect(alice.getByTestId('gauge-off-hours')).toBeVisible();
});
