import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

test('0,5 h estimée par le technicien : 1 h facturée et affichée sur le devis et la facture', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Devis et factures du bureau');
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: order, error } = await api.rpc('create_repair_order', {
    p_plate: `HF${String(Date.now()).slice(-6)}`,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Réglage des feux',
  });
  if (error) throw error;
  const estimate = await api
    .from('ro_lines')
    .update({ estimated_hours: 0.5 })
    .eq('repair_order_id', order.id);
  if (estimate.error) throw estimate.error;
  const quote = await api.rpc('build_quote_from_repair_order', { p_repair_order_id: order.id });
  if (quote.error) throw quote.error;
  const done = await api.from('repair_orders').update({ status: 'work_done' }).eq('id', order.id);
  if (done.error) throw done.error;
  const invoice = await api.rpc('build_invoice_draft', { p_repair_order_ids: [order.id] });
  if (invoice.error) throw invoice.error;

  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill('reception@rts.local');
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();

  for (const path of [`/devis/${quote.data}`, `/factures/${invoice.data}`]) {
    await page.goto(path);
    await expect(page.getByText(/^MO .+ · 1 h$/)).toBeVisible();
    await expect(page.getByText(/MO .+ · 0,5 h/)).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Quantité' }).first()).toHaveValue('1');
  }

  // Suivi de performance : le temps estimé du technicien reste 0,5 h
  const { data: line } = await api
    .from('ro_lines')
    .select('estimated_hours')
    .eq('repair_order_id', order.id)
    .single();
  expect(line?.estimated_hours).toBe(0.5);
});
