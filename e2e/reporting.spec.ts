import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { goTo, sideNav } from './support/nav';

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

/** Facture émise puis soldée le jour même (API : réception). */
async function createPaidInvoice(plate: string, clientName: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: order, error } = await client.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: clientName,
    p_requested_work: 'Vidange',
  });
  if (error) throw error;
  // Adresse de facturation : mention obligatoire pour émettre une facture
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
}

test('la direction consulte les statistiques et la trésorerie', async ({ page }, testInfo) => {
  test.slow();
  const id = suffix(testInfo);
  const clientName = `Client trésorerie ${id}`;
  await createPaidInvoice(`TR${id}`, clientName);

  await loginAs(page, 'direction@rts.local');
  await goTo(page, 'Pilotage', 'Statistiques');
  await expect(page).toHaveURL(/\/pilotage\/statistiques$/);
  await expect(page.getByRole('figure', { name: 'Chiffre d’affaires HT par mois' })).toBeVisible();
  // 12 mois + l'en-tête ; le mois en cours a au moins une facture
  await expect(page.getByRole('row')).toHaveCount(13);
  await expect(page.getByRole('row').nth(1).getByRole('cell').nth(1)).not.toHaveText('0');

  await page.getByRole('main').getByRole('link', { name: 'Trésorerie' }).click();
  await expect(page.getByText('Encaissé ce mois')).toBeVisible();
  await expect(page.getByRole('figure', { name: 'Encaissements attendus par semaine' })).toBeVisible();
  // Client comptant : échéance le jour de la facture, payée le jour même (délai 0 j)
  const habit = page.getByRole('row', { name: new RegExp(clientName) });
  await expect(habit).toContainText(/1\s*0 j/);
  await habit.getByRole('link', { name: clientName }).click();
  await expect(page.getByRole('heading', { name: clientName })).toBeVisible();
});

test('la réception n’a pas accès au pilotage', async ({ page }) => {
  await loginAs(page, 'reception@rts.local');
  await expect((await sideNav(page)).getByRole('button', { name: 'Pilotage' })).toHaveCount(0);
  await page.goto('/pilotage/tresorerie');
  await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
});
