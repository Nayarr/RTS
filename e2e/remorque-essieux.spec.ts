import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
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

/** OR de la remorque confié à Alice (API : réception). */
async function trailerOrder(testInfo: TestInfo) {
  const reception = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: false } },
  );
  await reception.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: alice } = await reception
    .from('technicians')
    .select('id')
    .eq('display_name', 'Alice')
    .single();
  const id = `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-6)}`;
  const { data, error } = await reception.rpc('create_repair_order', {
    p_plate: `RE${id}`,
    p_vehicle_type: 'remorque',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Contrôle général',
    p_technician_id: alice?.id,
  });
  if (error) throw error;
  return data;
}

const choose = (page: Page, group: string, value: string) =>
  page.getByRole('radiogroup', { name: group }).getByRole('radio', { name: value }).click();

test('remorque : deux essieux remplis, le troisième vide ignoré, forfaits des pneus nommés par essieu', async ({
  page,
  browser,
}, testInfo) => {
  const order = await trailerOrder(testInfo);
  await loginAs(page, 'alice@rts.local');
  await page.goto(`/atelier/or/${order.id}`);

  await choose(page, 'Disques de frein essieu 1', 'HS');
  await choose(page, 'Plaquettes essieu 1', 'OK');
  await choose(page, 'Pneus essieu 1', 'OK');
  await choose(page, 'Disques de frein essieu 2', 'OK');
  await choose(page, 'Plaquettes essieu 2', 'OK');
  await choose(page, 'Pneus essieu 2', 'HS');
  await page.getByLabel('Taille pneus essieu 2').fill('38565225');
  await expect(page.getByLabel('Taille pneus essieu 2')).toHaveValue('385/65/22.5');

  // Lignes à prévoir et forfaits des pneus de l'essieu 2 (2 pneus)
  const planned = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('heading', { name: 'Pièces / réparations à prévoir (devis)' }) });
  await expect(planned.getByRole('textbox', { name: 'Description de la tâche' }).first()).toBeVisible({
    timeout: 10_000,
  });
  await expect
    .poll(() =>
      sql(`select string_agg(description || ' x' || quantity::integer, ' | ' order by description)
           from public.ro_lines where repair_order_id = '${order.id}' and kind = 'planned'
             and (line_type = 'package' or description like 'Remplacement%')`),
    )
    .toBe(
      'DÉPOSE/REPOSE PNEUMATIQUE (essieu 2) x2 | DÉPOSE/REPOSE ROUE (essieu 2) x2 | ' +
        'RECYCLAGE PNEUMATIQUE (essieu 2) x2 | Remplacement Disques de frein essieu 1 x1 | Remplacement Pneus essieu 2 x1',
    );

  // Côté bureau : essieux remplis seulement
  const office = await browser.newPage();
  await loginAs(office, 'reception@rts.local');
  await office.goto(`/or/${order.id}`);
  const sheet = office.getByRole('region', { name: 'Fiche de contrôle' });
  await expect(sheet.getByText('Pneus essieu 2 (385/65/22.5)')).toBeVisible();
  await expect(sheet.getByText('Disques de frein essieu 1')).toBeVisible();
  await expect(sheet.getByText('Pneus essieu 3')).toHaveCount(0);
});
