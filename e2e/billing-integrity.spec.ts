import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
}

/** OR terminé (3 h déclarées) puis facturé : tout par la réception (API). */
async function invoicedOrder(plate: string) {
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
    p_client_name: `Double facture ${plate}`,
    p_requested_work: 'Freinage',
  });
  if (error) throw error;
  // Adresse de facturation : mention obligatoire pour émettre une facture
  await client
    .from('clients')
    .update({ billing_address: '12 rue des Transporteurs, 95190 Goussainville' })
    .eq('id', order.client_id ?? '');
  await client.from('ro_lines').insert({
    repair_order_id: order.id,
    kind: 'done',
    line_type: 'labor',
    description: 'Remplacement disques avant',
    estimated_hours: 3,
  });
  await client.from('repair_orders').update({ status: 'work_done' }).eq('id', order.id);
  const { data: invoiceId } = await client.rpc('build_invoice_draft', { p_repair_order_ids: [order.id] });
  await client.rpc('issue_invoice', { p_invoice_id: invoiceId ?? '' });
  return { client, order, invoiceId: invoiceId ?? '' };
}

test('un OR facturé ne se refacture qu’après un avoir total', async ({ page }, testInfo) => {
  const plate = `DF${String(Date.now()).slice(-6)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const { client, order, invoiceId } = await invoicedOrder(plate);

  // Tentative de seconde facture (API) : refusée par la base
  const again = await client.rpc('build_invoice_draft', { p_repair_order_ids: [order.id] });
  expect(again.error?.message).toMatch(/déjà facturé \(F\d+\) : fais d'abord un avoir/);

  // Fiche OR : plus de bouton pour facturer
  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${order.id}`);
  await expect(page.getByText(/^F\d+$/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Facturer/ })).toHaveCount(0);

  // Avoir sur la totalité (270 € HT), puis refacturation possible
  await page.goto(`/factures/${invoiceId}`);
  await page.getByRole('button', { name: 'Générer un avoir' }).click();
  const credit = page.getByRole('dialog', { name: 'Générer un avoir' });
  await credit.getByLabel('Montant HT à créditer (€)').fill('270');
  await credit.getByLabel('Motif').fill('Erreur de tarif');
  await credit.getByRole('button', { name: 'Générer l’avoir' }).click();
  await page.getByRole('dialog', { name: 'Aperçu' }).getByRole('button', { name: 'Fermer' }).click();

  await page.goto(`/or/${order.id}`);
  await page.getByRole('button', { name: 'Refacturer (après avoir)' }).click();
  await expect(page).toHaveURL(/\/factures\/[0-9a-f-]+$/);
  await expect(page).not.toHaveURL(new RegExp(invoiceId));
});
