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

test('charge atelier : chrono des OR compté dans « Badgé », même sans pointage à la borne', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Tableau de bord du bureau');
  const day = parisDay(-1);
  const reception = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: false } },
  );
  await reception.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: order, error } = await reception.rpc('create_repair_order', {
    p_plate: `HB${String(Date.now()).slice(-7)}`,
    p_vehicle_type: 'pl',
    p_client_name: 'Client heures badgées',
    p_requested_work: 'Freinage',
  });
  if (error) throw error;
  // Hier, Alice a badgé 3 h sur l'OR (chrono), comme le fait la borne
  sql(`insert into public.time_entries (repair_order_id, technician_id, started_at, ended_at)
       select '${order.id}', t.id, ('${day}'::date + time '13:00') at time zone 'Europe/Paris',
              ('${day}'::date + time '16:00') at time zone 'Europe/Paris'
       from public.technicians t where t.display_name = 'Alice'`);

  await loginAs(page, 'reception@rts.local');
  const card = page.getByRole('region', { name: 'Charge de travail atelier' });
  await card.getByRole('tab', { name: 'Jour' }).click();
  await card.getByRole('button', { name: 'Période précédente' }).click();
  const row = card.getByRole('listitem', { name: 'Alice' });
  await expect(row).toContainText(/Badgé (\d+|\d+,\d+) h sur les OR/);
  await expect(row).not.toContainText('Badgé 0 h sur les OR');

  await row.getByRole('button', { name: 'Détail des heures de Alice' }).click();
  const dialog = page.getByRole('dialog', { name: 'Heures de Alice' });
  await expect(dialog).toContainText('Badgé sur les OR');
  await expect(dialog).toContainText('Présence borne');
});
