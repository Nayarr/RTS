import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

test('extincteur estimé 0,5 h : 0,5 h au devis et à la facture ; autre travail arrondi à 1 h', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Devis et factures du bureau');
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: order, error } = await api.rpc('create_repair_order', {
    p_plate: `EX${String(Date.now()).slice(-6)}`,
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
  const extinguisher = await api.from('ro_lines').insert({
    repair_order_id: order.id,
    kind: 'done',
    position: 5,
    line_type: 'labor',
    description: 'Remplacement Extincteur 6 kg camion',
    estimated_hours: 0.5,
  });
  if (extinguisher.error) throw extinguisher.error;
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
    await expect(page.getByText(/^MO .+ · 0,5 h$/)).toHaveCount(1);
    await expect(page.getByText(/^MO .+ · 1 h$/)).toHaveCount(1);
    await expect(page.getByRole('textbox', { name: 'Désignation' }).nth(1)).toHaveValue(
      'Remplacement Extincteur 6 kg camion',
    );
    await expect(page.getByRole('textbox', { name: 'Quantité' }).nth(1)).toHaveValue('0,5');
  }
});
