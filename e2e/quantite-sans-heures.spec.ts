import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

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

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-6)}`;

async function api() {
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

/** PDF de l'aperçu, en texte (polices standard, non compressés). */
async function previewPdf(page: Page) {
  const preview = page.getByRole('dialog', { name: 'Aperçu' });
  const download = page.waitForEvent('download');
  await preview.getByRole('link', { name: 'Télécharger' }).click();
  return readFileSync(await (await download).path()).toString('latin1');
}

test('facture émise : quantité de main d’œuvre sans l’unité « h »', async ({ page }, testInfo) => {
  const id = suffix(testInfo);
  const client = await api();
  const { data: order, error } = await client.rpc('create_repair_order', {
    p_plate: `QF${id}`,
    p_vehicle_type: 'pl',
    p_client_name: `Client quantité ${id}`,
    p_requested_work: 'Freinage',
  });
  if (error) throw error;
  await client
    .from('clients')
    .update({ billing_address: '12 rue des Transporteurs, 95190 Goussainville' })
    .eq('id', order.client_id ?? '');
  await client.from('ro_lines').delete().eq('repair_order_id', order.id).eq('kind', 'done');
  await client.from('ro_lines').insert({
    repair_order_id: order.id,
    kind: 'done',
    line_type: 'labor',
    description: 'Remplacement disques avant',
    estimated_hours: 3,
  });
  const draft = await client.rpc('build_invoice_draft', { p_repair_order_ids: [order.id] });
  if (draft.error) throw draft.error;
  const issued = await client.rpc('issue_invoice', { p_invoice_id: draft.data });
  if (issued.error) throw issued.error;

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/factures/${draft.data}`);
  await page.getByRole('button', { name: 'PDF de la facture' }).click();
  const pdf = await previewPdf(page);
  expect(pdf).toContain('(Remplacement disques avant)');
  expect(pdf).not.toContain('(3 h)');
  expect(pdf).toContain('(3)');
});

test('devis : quantité de main d’œuvre sans l’unité « h »', async ({ page }, testInfo) => {
  const id = suffix(testInfo);
  const client = await api();
  const { data: quote, error } = await client.rpc('create_quote', {
    p_client_name: `Client devis quantité ${id}`,
    p_plate: `QD${id}`,
    p_vehicle_type: 'pl',
  });
  if (error) throw error;
  const line = await client.from('quote_lines').insert({
    quote_id: quote.id,
    position: 0,
    line_type: 'labor',
    description: 'Remplacement turbo',
    unit_price: 75,
    quantity: 3,
  });
  if (line.error) throw line.error;

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/devis/${quote.id}`);
  await page.getByRole('button', { name: 'Générer le PDF' }).click();
  const pdf = await previewPdf(page);
  expect(pdf).toContain('(Remplacement turbo)');
  expect(pdf).not.toContain('heure entam');
  expect(pdf).not.toContain('(3 h)');
  expect(pdf).toContain('(3)');
});
