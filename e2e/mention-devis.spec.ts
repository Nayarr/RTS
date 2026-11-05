import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';
const MENTION = 'VALABLE SOUS RÉSERVE DE DÉMONTAGE';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

async function api() {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: false } },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  return client;
}

/** PDF de l'aperçu ouvert, en texte : jsPDF y écrit les chaînes en clair (Latin-1). */
async function previewPdf(page: Page) {
  const preview = page.getByRole('dialog', { name: 'Aperçu' });
  const download = page.waitForEvent('download');
  await preview.getByRole('link', { name: 'Télécharger' }).click();
  return readFileSync(await (await download).path()).toString('latin1');
}

test('devis : la mention figure sur le PDF et sur le devis en ligne', async ({ page }, testInfo) => {
  const client = await api();
  const name = `Mention ${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${Date.now()}`;
  const { data: quote, error } = await client.rpc('create_quote', { p_client_name: name });
  if (error) throw error;
  const line = await client
    .from('quote_lines')
    .insert({ quote_id: quote.id, description: 'Remplacement embrayage', unit_price: 900, quantity: 1 });
  if (line.error) throw line.error;

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/devis/${quote.id}`);
  await page.getByRole('button', { name: 'Générer le PDF' }).click();
  expect(await previewPdf(page)).toContain(`(${MENTION})`);
  await page.getByRole('dialog', { name: 'Aperçu' }).getByRole('button', { name: 'Fermer' }).click();

  await page.getByRole('button', { name: 'Envoyer au client (lien à signer)' }).click();
  const dialog = page.getByRole('dialog', { name: /prêt à envoyer/ });
  await dialog.getByLabel('E-mail du client').fill('compta@client-e2e.fr');
  await dialog.getByLabel('E-mail du client').blur();
  await expect(page.getByText('Coordonnées du client enregistrées')).toBeVisible();
  const link = await dialog.getByLabel('Lien', { exact: true }).inputValue();

  const online = await page.context().newPage();
  await online.goto(new URL(link).pathname);
  await expect(online.getByRole('heading', { name: 'DEVIS' })).toBeVisible();
  await expect(online.getByText(MENTION)).toBeVisible();
  await online.close();
});

test('facture : ni sur le PDF, ni en ligne', async ({ page }, testInfo) => {
  const client = await api();
  const created = await client
    .from('clients')
    .insert({
      name: `Sans mention ${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${Date.now()}`,
      billing_address: '5 rue Marc Seguin, 95190 Goussainville',
    })
    .select('id')
    .single();
  if (created.error) throw created.error;
  const invoice = await client.from('invoices').insert({ client_id: created.data.id }).select('id').single();
  if (invoice.error) throw invoice.error;
  const line = await client.from('invoice_lines').insert({
    invoice_id: invoice.data.id,
    position: 0,
    line_type: 'labor',
    description: 'Remplacement embrayage',
    unit_price: 900,
    quantity: 1,
  });
  if (line.error) throw line.error;
  const issued = await client.rpc('issue_invoice', { p_invoice_id: invoice.data.id });
  if (issued.error) throw issued.error;
  const token = await client.rpc('share_invoice', { p_invoice_id: invoice.data.id });
  if (token.error) throw token.error;

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/factures/${invoice.data.id}`);
  await page.getByRole('button', { name: /PDF/ }).first().click();
  const pdf = await previewPdf(page);
  expect(pdf).toContain('(Remplacement embrayage)');
  expect(pdf).not.toContain('DÉMONTAGE');

  await page.goto(`/d/${token.data}`);
  await expect(page.getByText('Remplacement embrayage')).toBeVisible();
  await expect(page.getByText(MENTION)).toHaveCount(0);
});
