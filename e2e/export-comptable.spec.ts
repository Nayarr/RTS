import { copyFileSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
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

/** Facture émise avec main d'œuvre et paiement partiel, véhicule vendu à la marge, même client. */
async function accountingCase(id: string) {
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const clientName = `Client compta ${id}`;
  const { data: order, error } = await api.rpc('create_repair_order', {
    p_plate: `CP${id}`,
    p_vehicle_type: 'pl',
    p_client_name: clientName,
    p_requested_work: 'Freinage',
  });
  if (error) throw error;
  const clientId = order.client_id ?? '';
  await api
    .from('clients')
    .update({ billing_address: '12 rue des Transporteurs, 95190 Goussainville' })
    .eq('id', clientId);
  await api.from('ro_lines').insert({
    repair_order_id: order.id,
    kind: 'done',
    line_type: 'labor',
    description: 'Contrôle freinage',
    estimated_hours: 1,
  });
  const draft = await api.rpc('build_invoice_draft', { p_repair_order_ids: [order.id] });
  if (draft.error) throw draft.error;
  const issued = await api.rpc('issue_invoice', { p_invoice_id: draft.data });
  if (issued.error) throw issued.error;
  const payment = await api
    .from('payments')
    .insert({ invoice_id: draft.data, amount_ttc: 50, method: 'cash' });
  if (payment.error) throw payment.error;

  const vehicle = await api
    .from('fleet_vehicles')
    .insert({ plate: `VC-${id}`, brand: 'Renault', model: 'Master', category: 'van', daily_rate: 80 })
    .select('id')
    .single();
  if (vehicle.error) throw vehicle.error;
  const sale = await api.rpc('sell_fleet_vehicle', {
    p_vehicle_id: vehicle.data.id,
    p_client_id: clientId,
    p_sold_at: new Date().toISOString(),
    p_mileage: 1000,
    p_vat_scheme: 'margin',
    p_price: 12000,
    p_purchase_price: 9000,
  });
  if (sale.error) throw sale.error;
  const soldIssued = await api.rpc('issue_invoice', { p_invoice_id: sale.data });
  if (soldIssued.error) throw soldIssued.error;
  return { clientName, invoiceNumber: issued.data, saleNumber: soldIssued.data };
}

test('export comptable : classeur Excel de 7 onglets, puis les mêmes tableaux en CSV', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Écran de bureau');
  test.slow();
  const id = suffix(testInfo);
  const { clientName, invoiceNumber, saleNumber } = await accountingCase(id);

  await loginAs(page, 'direction@rts.local');
  await page.goto('/factures');
  await page.getByRole('button', { name: 'Exporter' }).click();
  const dialog = page.getByRole('dialog', { name: 'Exporter des factures' });
  await dialog.getByLabel('Client').selectOption({ label: clientName });
  await expect(dialog.getByRole('status')).toContainText('2 factures');

  // Excel : onglets, montants en nombres
  await dialog.getByRole('radio', { name: /^Excel comptable/ }).check();
  await expect(dialog.getByRole('group', { name: 'États des factures exportées' })).toHaveCount(0);
  const excel = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Exporter' }).click();
  const excelFile = await excel;
  expect(excelFile.suggestedFilename()).toMatch(/^comptabilite-.*\.xlsx$/);
  const path = await excelFile.path();
  if (process.env.SHOTS) copyFileSync(path, `${process.env.SHOTS}/comptabilite.xlsx`);
  const workbook = unzipSync(readFileSync(path));
  const names = [...strFromU8(workbook['xl/workbook.xml']!).matchAll(/<sheet [^>]*name="([^"]+)"/g)].map(
    (m) => m[1],
  );
  expect(names).toEqual(['Synthèse', 'Factures', 'Lignes', 'TVA', 'Paiements', 'Avoirs', 'Écritures']);
  const strings = strFromU8(workbook['xl/sharedStrings.xml'] ?? new Uint8Array());
  const everything =
    strings +
    Object.values(workbook)
      .map((file) => strFromU8(file))
      .join('');
  expect(everything).toContain(invoiceNumber);
  expect(everything).toContain(saleNumber);
  expect(everything).toContain('TVA sur la marge');
  expect(everything).toContain('<v>11500</v>');
  expect(everything).toContain('<v>500</v>');

  // CSV : un fichier par onglet
  await page.getByRole('button', { name: 'Exporter' }).click();
  await dialog.getByLabel('Client').selectOption({ label: clientName });
  await dialog.getByRole('radio', { name: /^CSV comptable/ }).check();
  const csv = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Exporter' }).click();
  const csvFile = await csv;
  expect(csvFile.suggestedFilename()).toMatch(/^comptabilite-.*\.zip$/);
  const files = unzipSync(readFileSync(await csvFile.path()));
  expect(Object.keys(files).sort()).toEqual(
    ['avoirs', 'ecritures', 'factures', 'lignes', 'paiements', 'synthese', 'tva'].map((n) => `${n}.csv`),
  );
  const entries = strFromU8(files['ecritures.csv']!);
  expect(entries.split('\r\n')[0]).toContain('JournalCode;JournalLib;EcritureNum');
  expect(entries).toContain('775000');
  expect(entries).toContain('445710');
  expect(strFromU8(files['paiements.csv']!)).toContain('Espèces');
});
