import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { sql } from './support/db';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

test('facture : 4 h badgées pour 2 h facturées, le bureau est prévenu', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Factures du bureau');
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: order, error } = await api.rpc('create_repair_order', {
    p_plate: `TN${String(Date.now()).slice(-6)}`,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Remplacement embrayage',
  });
  if (error) throw error;
  const estimate = await api.from('ro_lines').update({ estimated_hours: 2 }).eq('repair_order_id', order.id);
  if (estimate.error) throw estimate.error;
  // Alice a badgé 4 h sur l'OR, comme le fait la borne
  sql(`insert into public.time_entries (repair_order_id, technician_id, started_at, ended_at)
       select '${order.id}', t.id, now() - interval '5 hours', now() - interval '1 hour'
       from public.technicians t where t.display_name = 'Alice'`);
  const done = await api.from('repair_orders').update({ status: 'work_done' }).eq('id', order.id);
  if (done.error) throw done.error;
  const invoice = await api.rpc('build_invoice_draft', { p_repair_order_ids: [order.id] });
  if (invoice.error) throw invoice.error;

  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill('reception@rts.local');
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();

  await page.goto(`/factures/${invoice.data}`);
  const alert = page.getByRole('status', { name: 'Temps passé mais non facturé' });
  await expect(alert).toHaveText('4 h badgées, 2 h facturées : vérifie s’il manque une ligne.');

  // Ligne de main d'œuvre passée à 4 h : plus d'alerte
  await page.getByRole('textbox', { name: 'Quantité' }).first().fill('4');
  await page.getByRole('textbox', { name: 'Quantité' }).first().blur();
  await expect(alert).toHaveCount(0);
});
