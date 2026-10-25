import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { unzipSync } from 'fflate';
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

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

/** Trois factures émises de 324 € TTC pour un nouveau client : payée, payée 100 €, impayée. */
async function createClientInvoices(id: string) {
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const clientName = `Client extrait ${id}`;
  const invoices: { id: string; number: string; clientId: string; plate: string }[] = [];
  for (const [index, paid] of [324, 100, 0].entries()) {
    const plate = `X${index}${id}`;
    const { data: order, error } = await api.rpc('create_repair_order', {
      p_plate: plate,
      p_vehicle_type: 'pl',
      p_client_name: clientName,
      p_requested_work: 'Freinage',
    });
    if (error) throw error;
    await api
      .from('clients')
      .update({ billing_address: '383 rue de la Belle Étoile, 95700 Roissy-en-France' })
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
    invoices.push({ id: draft.data, number: issued.data, clientId: order.client_id ?? '', plate });
  }
  sql(`update public.vehicles set brand = 'MAN', model = 'TGS' where plate = '${invoices[1]!.plate}'`);
  return invoices;
}

test('extrait de compte : états choisis, totaux, tri, PDF de l’extrait et lot de factures', async ({
  page,
}, testInfo) => {
  test.slow();
  const id = suffix(testInfo);
  const [paid, partial, unpaid] = await createClientInvoices(id);
  expect(new Set([paid!.clientId, partial!.clientId, unpaid!.clientId]).size).toBe(1);

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/clients/${paid!.clientId}`);
  await page.getByRole('link', { name: 'Extrait de compte' }).click();
  await expect(page.getByRole('heading', { name: /Extrait de compte/ })).toBeVisible();

  const table = page.getByRole('table', { name: /Extrait de compte/ });
  const body = table.locator('tbody tr');
  await expect(body).toHaveCount(3);
  const partialRow = body.filter({ hasText: partial!.number });
  await expect(partialRow).toContainText('MAN');
  await expect(partialRow).toContainText('TGS');
  await expect(partialRow).toContainText(/Partielle/);
  await expect(table.locator('tfoot')).toContainText(/972,00/);
  await expect(table.locator('tfoot')).toContainText(/548,00/);

  // Impayées et partielles seulement
  await page
    .getByRole('group', { name: 'Factures affichées' })
    .getByRole('button', { name: /Payées/ })
    .click();
  await expect(body).toHaveCount(2);
  await expect(body.filter({ hasText: paid!.number })).toHaveCount(0);
  await expect(table.locator('tfoot')).toContainText(/648,00/);

  // Tri sur le reste dû, puis dans l'autre sens
  await table.getByRole('button', { name: 'Reste dû' }).click();
  await expect(table.getByRole('columnheader', { name: 'Reste dû' })).toHaveAttribute(
    'aria-sort',
    'ascending',
  );
  await expect(body.first()).toContainText(partial!.number);
  await table.getByRole('button', { name: 'Reste dû' }).click();
  await expect(body.first()).toContainText(unpaid!.number);

  // PDF de l'extrait
  await page.getByRole('button', { name: 'PDF de l’extrait' }).click();
  const preview = page.getByRole('dialog', { name: 'Aperçu' });
  await expect(preview).toContainText(/Extrait_Client_extrait/);
  await preview.getByRole('button', { name: 'Fermer' }).click();

  // Factures en un PDF, puis en ZIP (extrait + une facture par fichier)
  const pdf = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Factures en un PDF' }).click();
  expect((await pdf).suggestedFilename()).toMatch(/^Factures_Client_extrait.*\.pdf$/);

  const zip = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Factures en ZIP' }).click();
  const download = await zip;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  const names = Object.keys(unzipSync(readFileSync(await download.path())));
  expect(names).toHaveLength(3);
  expect(names[0]).toMatch(/^Extrait_/);
  expect(names.filter((name) => name.startsWith('Facture_'))).toHaveLength(2);
});
