import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
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

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

/** Facture émise pour un OR (API : réception). */
async function createIssuedInvoice(plate: string, clientName: string) {
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
    p_requested_work: 'Freinage',
  });
  if (error) throw error;
  const work = await client.from('ro_lines').insert({
    repair_order_id: order.id,
    kind: 'done',
    line_type: 'labor',
    description: 'Remplacement disques avant',
    estimated_hours: 3,
  });
  if (work.error) throw work.error;
  const draft = await client.rpc('build_invoice_draft', { p_repair_order_ids: [order.id] });
  if (draft.error) throw draft.error;
  const issued = await client.rpc('issue_invoice', { p_invoice_id: draft.data });
  if (issued.error) throw issued.error;
  return { id: draft.data, number: issued.data };
}

test('la facture est envoyée par lien ; le client la consulte sans compte', async ({
  page,
  browser,
}, testInfo) => {
  test.slow();
  const id = suffix(testInfo);
  const invoice = await createIssuedInvoice(`L${id}`, `Client lien ${id}`);

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/factures/${invoice.id}`);
  await expect(page.getByRole('button', { name: 'Relancer' })).toHaveCount(0); // pas encore échue
  await page.getByRole('button', { name: 'Envoyer au client' }).click();
  const dialog = page.getByRole('dialog', { name: `Envoyer la facture ${invoice.number}` });
  await expect(dialog.getByRole('link', { name: /Envoyer par e-mail/ })).toHaveAttribute(
    'href',
    new RegExp(`subject=Facture%20${invoice.number}%20`),
  );
  const link = await dialog.getByLabel('Lien', { exact: true }).inputValue();
  await page.keyboard.press('Escape');

  const { baseURL, viewport, userAgent, isMobile, hasTouch, locale, timezoneId } = testInfo.project.use;
  const context = await browser.newContext({
    baseURL,
    viewport,
    userAgent,
    isMobile,
    hasTouch,
    locale,
    timezoneId,
  });
  const client = await context.newPage();
  await client.goto(new URL(link).pathname);
  await expect(client.getByRole('heading', { name: 'FACTURE' })).toBeVisible();
  await expect(client.getByText(new RegExp(invoice.number))).toBeVisible();
  await expect(client.getByText(`Client lien ${id}`)).toBeVisible();
  await expect(client.getByLabel('Totaux')).toContainText('324,00 €');
  await expect(client.getByText(/Facture à régler avant le/)).toBeVisible();
  await expect(client.getByText('TVA sur les encaissements.')).toBeVisible();
  await expect(client.getByRole('button', { name: /Imprimer/ })).toBeVisible();
  await context.close();
});

test('la direction exporte la liste des factures en CSV', async ({ page }, testInfo) => {
  const id = suffix(testInfo);
  const invoice = await createIssuedInvoice(`X${id}`, `Client export ${id}`);

  await loginAs(page, 'direction@rts.local');
  await page.goto('/factures');
  await page.getByRole('searchbox', { name: 'Rechercher une facture' }).fill(invoice.number);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^factures-\d{4}-\d{2}-\d{2}\.csv$/);
  const content = await readFile((await file.path()) ?? '', 'utf8');
  expect(content).toContain('Numéro;Date d’émission;Échéance;Client;Véhicule;OR;Total HT');
  expect(content).toContain(`${invoice.number};`);
  expect(content).toContain(`Client export ${id}`);
  expect(content).toContain('270,00;54,00;324,00');
});

test('la réception n’a pas l’export CSV', async ({ page }) => {
  await loginAs(page, 'reception@rts.local');
  await page.goto('/factures');
  await page.getByRole('button', { name: /^Toutes/ }).click();
  await expect(page.getByRole('button', { name: 'Export CSV' })).toHaveCount(0);
});
