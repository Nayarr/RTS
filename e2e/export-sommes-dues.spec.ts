import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

test('sommes dues : période, type de règlement, reste dû par client, PDF', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Export du bureau');
  const id = String(Date.now()).slice(-7);
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  // Client en prélèvement le 5 : une facture émise, payée en partie (324 € TTC, 100 € reçus)
  const clientName = `Client sommes dues ${id}`;
  const { data: order, error } = await api.rpc('create_repair_order', {
    p_plate: `SD${id}`,
    p_vehicle_type: 'pl',
    p_client_name: clientName,
    p_requested_work: 'Freinage',
  });
  if (error) throw error;
  const account = await api
    .from('clients')
    .update({
      account_type: 'prelevement',
      direct_debit_day: 5,
      billing_address: '1 rue de Paris, 95190 Goussainville',
    })
    .eq('id', order.client_id ?? '');
  if (account.error) throw account.error;
  const work = await api.from('ro_lines').insert({
    repair_order_id: order.id,
    kind: 'done',
    line_type: 'labor',
    description: 'Remplacement disques avant',
    estimated_hours: 3,
  });
  if (work.error) throw work.error;
  const draft = await api.rpc('build_invoice_draft', { p_repair_order_ids: [order.id] });
  if (draft.error) throw draft.error;
  const issued = await api.rpc('issue_invoice', { p_invoice_id: draft.data });
  if (issued.error) throw issued.error;
  const payment = await api.from('payments').insert({
    invoice_id: draft.data,
    amount_ttc: 100,
    method: 'card',
    paid_on: new Date().toISOString().slice(0, 10),
  });
  if (payment.error) throw payment.error;
  const { data: invoice } = await api
    .from('v_invoices_overview')
    .select('issued_at, balance_due')
    .eq('id', draft.data)
    .single();
  const day = (invoice?.issued_at ?? '').slice(0, 10);

  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill('direction@rts.local');
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
  await page.goto('/factures');

  await page.getByRole('button', { name: 'Sommes dues' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sommes dues par les clients' });
  // Par défaut : le mois précédent
  await expect(dialog.getByLabel('Factures du')).toHaveValue(/^\d{4}-\d{2}-01$/);
  await dialog.getByLabel('Factures du').fill(day);
  await dialog.getByLabel('au').fill(day);
  await dialog.getByRole('button', { name: 'Comptant' }).click();
  // Le client en prélèvement n'est pas compté avec les clients au comptant
  const comptant = await dialog.getByText(/client.*TTC dus/).textContent();
  await dialog.getByRole('button', { name: 'Comptant' }).click();
  await dialog.getByRole('button', { name: 'Prélèvement le 5' }).click();
  await expect(dialog.getByText(/client.*TTC dus/)).not.toHaveText(comptant ?? '');
  await expect(dialog.getByText(/client.*TTC dus/)).toContainText('facture');

  await dialog.getByRole('button', { name: 'PDF des sommes dues' }).click();
  await expect(page.getByText(`Sommes_dues_${day}_${day}.pdf`)).toBeVisible();
  expect(invoice?.balance_due).toBe(224);
});
