import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
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
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

/** Deux factures émises de 324 € TTC pour un nouveau client : une payée, une impayée. */
async function createClientInvoices(id: string) {
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const numbers: string[] = [];
  for (const [index, paid] of [324, 0].entries()) {
    const { data: order, error } = await api.rpc('create_repair_order', {
      p_plate: `E${index}${id}`,
      p_vehicle_type: 'pl',
      p_client_name: `Client export lot ${id}`,
      p_requested_work: 'Freinage',
    });
    if (error) throw error;
    await api
      .from('clients')
      .update({ billing_address: '12 rue des Transporteurs, 95190 Goussainville' })
      .eq('id', order.client_id ?? '');
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
    if (paid > 0) {
      const payment = await api.from('payments').insert({
        invoice_id: draft.data,
        amount_ttc: paid,
        method: 'card',
        paid_on: new Date().toISOString().slice(0, 10),
      });
      if (payment.error) throw payment.error;
    }
    numbers.push(issued.data);
  }
  return numbers;
}

test('export des factures d’un client : états choisis, ZIP puis PDF unique', async ({ page }, testInfo) => {
  test.slow();
  const id = suffix(testInfo);
  const [paid, unpaid] = await createClientInvoices(id);

  await loginAs(page, 'direction@rts.local');
  await page.goto('/factures');
  await page.getByRole('button', { name: 'Exporter' }).click();
  const dialog = page.getByRole('dialog', { name: 'Exporter des factures' });
  await dialog.getByLabel('Client').selectOption({ label: `Client export lot ${id}` });
  await expect(dialog.getByRole('status')).toContainText('2 factures');

  // Impayées et partielles seulement, en ZIP : un PDF par facture
  await dialog.getByRole('button', { name: 'Payées', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('1 facture · 324,00');
  await dialog.getByRole('radio', { name: /^ZIP/ }).check();
  const zip = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Exporter' }).click();
  const zipFile = await zip;
  expect(zipFile.suggestedFilename()).toMatch(/^Factures_.*\.zip$/);
  const names = Object.keys(unzipSync(readFileSync(await zipFile.path())));
  expect(names).toEqual([expect.stringContaining(`Facture_${unpaid}`)]);
  expect(names.join()).not.toContain(paid!);

  // Toutes, en un seul PDF : les deux factures à la suite
  await page.getByRole('button', { name: 'Exporter' }).click();
  await dialog.getByLabel('Client').selectOption({ label: `Client export lot ${id}` });
  await dialog.getByRole('radio', { name: /^PDF/ }).check();
  const pdf = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Exporter' }).click();
  const pdfFile = await pdf;
  expect(pdfFile.suggestedFilename()).toMatch(/^Factures_.*\.pdf$/);
  const merged = await PDFDocument.load(readFileSync(await pdfFile.path()));
  expect(merged.getPageCount()).toBe(2);
});
