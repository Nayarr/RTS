import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
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

/** OR assigné à Alice, prévu à une date sans horaire (API : réception). */
async function untimedOrderForAlice(plate: string, date: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: false } },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: alice } = await client.from('technicians').select('id').eq('display_name', 'Alice').single();
  const { data, error } = await client.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Contrôle',
    p_technician_id: alice?.id,
    p_planned_date: date,
  });
  if (error) throw error;
  return data;
}

test('planning : OR prévu sans horaire en étiquette sous la date et sous le technicien', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Planning consulté sur PC');
  const plate = `PS${String(Date.now()).slice(-7)}D`;
  const date = parisDay(2);
  const order = await untimedOrderForAlice(plate, date);

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/planning?vue=semaine&date=${date}`);
  const week = page.getByTestId(`planning-untimed-${date}`);
  const chip = week.getByRole('link', { name: new RegExp(plate) });
  await expect(chip).toHaveAttribute('title', 'Prévu ce jour, sans horaire — Alice');
  // Pas de bloc horaire pour cet OR
  await expect(page.getByTestId(`planning-column-${date}`).getByText(plate)).toHaveCount(0);

  // Vue jour : sous Alice
  await page.getByRole('button', { name: 'Jour', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: new RegExp(`${date.slice(8, 10)}/${date.slice(5, 7)}`) }),
  ).toBeVisible();
  const aliceColumn = page.getByRole('list', { name: /OR sans horaire/ }).filter({ hasText: plate });
  await expect(aliceColumn).toHaveCount(1);

  // Un clic ouvre l'OR
  await aliceColumn.getByRole('link', { name: new RegExp(plate) }).click();
  await expect(page).toHaveURL(new RegExp(`/or/${order.id}$`));
  await expect(page.getByRole('link', { name: plate, exact: true })).toBeVisible();
});
