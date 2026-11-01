import { createClient } from '@supabase/supabase-js';
import { expect, type Page, test, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { parisDay } from './support/dates';

const env = loadEnv('production', process.cwd(), 'VITE_');
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
}

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

/** Facture d'un client comptant émise puis soldée par l'API, paiement sans date (réception). */
async function invoicePaidWithoutDate(plate: string, clientName: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: false } },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: order, error } = await client.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: clientName,
    p_requested_work: 'Vidange',
  });
  if (error) throw error;
  await client
    .from('clients')
    .update({ billing_address: '12 rue des Transporteurs, 95190 Goussainville' })
    .eq('id', order.client_id ?? '');
  const draft = await client.rpc('build_invoice_draft', { p_repair_order_ids: [order.id] });
  if (draft.error) throw draft.error;
  const line = await client.from('invoice_lines').insert({
    invoice_id: draft.data,
    line_type: 'labor',
    description: 'Vidange',
    unit_price: 100,
    quantity: 1,
  });
  if (line.error) throw line.error;
  const issued = await client.rpc('issue_invoice', { p_invoice_id: draft.data });
  if (issued.error) throw issued.error;
  const payment = await client
    .from('payments')
    .insert({ invoice_id: draft.data, amount_ttc: 120, method: 'bank_transfer' });
  if (payment.error) throw payment.error;
  return draft.data;
}

test('paiement sans date : payé le jour de Paris, le jour de l’échéance d’un client comptant', async ({
  page,
}, testInfo) => {
  const id = suffix(testInfo);
  const invoiceId = await invoicePaidWithoutDate(`PJ${id}`, `Client jour Paris ${id}`);
  const today = parisDay().split('-').reverse().join('/');

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/factures/${invoiceId}`);
  await expect(page.getByText(`Échéance ${today}`, { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Paiements' })).toContainText(`Payé le ${today}`);
});
