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

async function receptionClient() {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  return client;
}

const suffix = (project: string) =>
  `${project.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

test('OR « Devis envoyé » dès que son devis part au client, filtre « Devis envoyés »', async ({
  page,
}, testInfo) => {
  const plate = `DE${suffix(testInfo.project.name)}`;
  const reception = await receptionClient();
  const { data: order, error } = await reception.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: `Client devis ${plate}`,
    p_requested_work: 'Diagnostic',
  });
  if (error) throw error;
  const { data: quoteId, error: quoteError } = await reception.rpc('build_quote_from_repair_order', {
    p_repair_order_id: order.id,
  });
  if (quoteError) throw quoteError;
  const line = await reception
    .from('quote_lines')
    .insert({ quote_id: quoteId, description: 'Remplacement disques', unit_price: 300 });
  if (line.error) throw line.error;
  sql(`update public.repair_orders set status = 'quote_pending' where id = '${order.id}'`);

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${order.id}`);
  await expect(page.getByText('Devis à faire', { exact: true }).first()).toBeVisible();

  // Lien du devis préparé pour le client : devis envoyé
  const shared = await reception.rpc('share_quote', { p_quote_id: quoteId });
  if (shared.error) throw shared.error;
  await page.reload();
  await expect(page.getByText('Devis envoyé', { exact: true }).first()).toBeVisible();

  await page.goto('/or?filtre=quote_sent');
  await page.getByRole('searchbox', { name: /Rechercher/ }).fill(plate);
  await expect(page.getByText(plate).first()).toBeVisible();

  await page.goto('/devis?filtre=sent');
  await expect(page.getByRole('button', { name: /Devis envoyés/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('searchbox', { name: 'Rechercher un devis' }).fill(plate);
  await expect(page.getByText(plate).first()).toBeVisible();
});

test('facture envoyée au client : OR toujours « Facturé », filtre « Factures envoyées »', async ({
  page,
}, testInfo) => {
  const plate = `FE${suffix(testInfo.project.name)}`;
  const reception = await receptionClient();
  const { data: order, error } = await reception.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: `Client facture ${plate}`,
    p_requested_work: 'Freinage',
  });
  if (error) throw error;
  sql(`update public.clients set billing_address = '1 rue du Test, 95190 Goussainville'
        where id = '${order.client_id}'`);
  const work = await reception.from('ro_lines').insert({
    repair_order_id: order.id,
    kind: 'done',
    line_type: 'labor',
    description: 'Remplacement disques avant',
    estimated_hours: 1,
  });
  if (work.error) throw work.error;
  const { data: invoiceId, error: draftError } = await reception.rpc('build_invoice_draft', {
    p_repair_order_ids: [order.id],
  });
  if (draftError) throw draftError;
  const issued = await reception.rpc('issue_invoice', { p_invoice_id: invoiceId });
  if (issued.error) throw issued.error;

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${order.id}`);
  await expect(page.getByText('Facturé', { exact: true }).first()).toBeVisible();

  // « Envoyer au client » : lien de la facture préparé, facture envoyée
  await page.goto(`/factures/${invoiceId}`);
  await page.getByRole('button', { name: /Envoyer au client/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText(/envoyée le \d{2}\/\d{2}\/\d{4}/)).toBeVisible();

  await page.goto(`/or/${order.id}`);
  await expect(page.getByText('Facturé', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Facture envoyée', { exact: true })).toHaveCount(0);

  await page.goto('/factures?filtre=sent');
  await page.getByRole('searchbox', { name: 'Rechercher une facture' }).fill(plate);
  await expect(page.getByText(`Client facture ${plate}`).first()).toBeVisible();
});
