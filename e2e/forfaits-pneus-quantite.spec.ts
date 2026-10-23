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

test('devis : dépose/repose pneumatique en quantité 2 à 18 € l’unité, sans « Remplacement Pneus »', async ({
  page,
}, testInfo) => {
  test.slow();
  const plate = `PQ${String(Date.now()).slice(-6)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const reception = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await reception.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: order, error } = await reception.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Contrôle pneus',
  });
  if (error) throw error;
  // Fiche de contrôle : pneus avant HS
  sql(
    `insert into public.inspections (repair_order_id, data) values ('${order.id}', '{"pneus": {"avant_etat": "HS"}}')`,
  );
  const quote = await reception.rpc('build_quote_from_repair_order', { p_repair_order_id: order.id });
  if (quote.error) throw quote.error;

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/devis/${quote.data}`);
  const row = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: 'Supprimer DÉPOSE/REPOSE PNEUMATIQUE (avant)' }) });
  await expect(row.getByRole('textbox', { name: 'Quantité' })).toHaveValue('2');
  await expect(row.getByRole('textbox', { name: 'Prix unit. HT' })).toHaveValue(/^18([,.]00)?$/);
  await expect(row).toContainText('36,00');
  await expect(page.getByText('Remplacement Pneus avant')).toHaveCount(0);
  await expect(page.getByText(/ X2 /)).toHaveCount(0);
});
