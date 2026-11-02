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

test('remorque : essieu à 4 roues jumelées, forfaits des pneus par 4, repassé à 2 roues', async ({
  page,
  browser,
}, testInfo) => {
  const order = await trailerOrder(testInfo);
  await loginAs(page, 'alice@rts.local');
  await page.goto(`/atelier/or/${order.id}`);

  await choose(page, 'Roues essieu 1', '4 roues (jumelées)');
  await choose(page, 'Pneus essieu 1', 'HS');
  await page.getByLabel('Taille pneus essieu 1').fill('38565225');
  await expect(page.getByLabel('Taille pneus essieu 1')).toHaveValue('385/65/22.5');

  const tyrePackages = () =>
    sql(`select string_agg(description || ' x' || quantity::integer, ' | ' order by description)
         from public.ro_lines where repair_order_id = '${order.id}' and kind = 'planned' and line_type = 'package'`);
  await expect
    .poll(tyrePackages, { timeout: 10_000 })
    .toBe(
      'DÉPOSE/REPOSE PNEUMATIQUE (essieu 1) x4 | DÉPOSE/REPOSE ROUE (essieu 1) x4 | RECYCLAGE PNEUMATIQUE (essieu 1) x4',
    );

  // Côté bureau : essieu jumelé indiqué sur la fiche
  const office = await browser.newPage();
  await loginAs(office, 'reception@rts.local');
  await office.goto(`/or/${order.id}`);
  await expect(
    office
      .getByRole('region', { name: 'Fiche de contrôle' })
      .getByText('Pneus essieu 1 (385/65/22.5, 4 roues)'),
  ).toBeVisible();

  // Le technicien corrige : 2 roues, forfaits déjà prévus repassés par 2
  await choose(page, 'Roues essieu 1', '2 roues');
  await expect
    .poll(tyrePackages, { timeout: 10_000 })
    .toBe(
      'DÉPOSE/REPOSE PNEUMATIQUE (essieu 1) x2 | DÉPOSE/REPOSE ROUE (essieu 1) x2 | RECYCLAGE PNEUMATIQUE (essieu 1) x2',
    );
});
