import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
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
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-6)}`;

test('véhicule vendu en TVA sur la marge : facture sans TVA ni marge pour l’acheteur, compta juste, cerfa prérempli', async ({
  page,
}, testInfo) => {
  const id = suffix(testInfo);
  const plate = `VF-${id}`;
  const buyer = `Acheteur ${id}`;
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const vehicle = await api
    .from('fleet_vehicles')
    .insert({ plate, brand: 'Renault', model: 'Master', category: 'van', daily_rate: 80, mileage: 120000 })
    .select('id')
    .single();
  if (vehicle.error) throw vehicle.error;
  const client = await api
    .from('clients')
    .insert({ name: buyer, billing_address: '5 rue Marc Seguin, 95190 Goussainville' })
    .select('id')
    .single();
  if (client.error) throw client.error;

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/location/flotte/${vehicle.data.id}`);
  await page.getByRole('button', { name: 'Vendre' }).click();
  const dialog = page.getByRole('dialog', { name: `Vendre ${plate}` });
  await dialog.getByRole('searchbox', { name: 'Rechercher l’acheteur' }).fill(buyer);
  await dialog.getByRole('button', { name: new RegExp(buyer) }).click();
  await dialog.getByLabel('Kilométrage au compteur').fill('120500');
  await dialog.getByRole('button', { name: 'TVA sur la marge' }).click();
  await dialog.getByLabel('Prix de vente TTC (€)').fill('12000');
  await dialog.getByRole('button', { name: 'Vendre et préparer la facture' }).click();
  await expect(dialog.getByText('Indique le prix d’achat : la TVA en dépend')).toBeVisible();
  await dialog.getByLabel('Prix d’achat TTC (€)').fill('9000');
  await expect(dialog.getByLabel('TVA sur la marge')).toContainText('500,00');
  await dialog.getByRole('button', { name: 'Vendre et préparer la facture' }).click();

  // Facture en brouillon : prix TTC seul, chiffres internes dans la carte TVA
  await expect(page).toHaveURL(/\/factures\/[0-9a-f-]{36}$/);
  const invoiceId = page.url().split('/').pop() ?? '';
  const totals = page.getByRole('definition').filter({ hasText: '12' });
  await expect(page.getByLabel('Totaux')).toContainText('Prix de vente TTC');
  await expect(page.getByLabel('Totaux')).not.toContainText('TVA');
  await expect(totals.first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'TVA sur la marge' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajouter une pièce' })).toHaveCount(0);

  // Comptabilité : TVA de la marge après émission (API : mêmes règles que le bouton)
  const issued = await api.rpc('issue_invoice', { p_invoice_id: invoiceId });
  if (issued.error) throw issued.error;
  expect(
    sql(
      `select total_ht || '/' || total_vat || '/' || total_ttc from public.invoices where id = '${invoiceId}'`,
    ),
  ).toBe('11500.00/500.00/12000.00');

  // Facture en ligne : ni TVA ni marge
  const token = await api.rpc('share_invoice', { p_invoice_id: invoiceId });
  if (token.error) throw token.error;
  const online = await page.context().newPage();
  await online.goto(`/d/${token.data}`);
  await expect(
    online.getByText(/régime particulier - biens d’occasion|régime particulier - biens d'occasion/),
  ).toBeVisible();
  await expect(online.getByLabel('Totaux')).toContainText('Total TTC');
  await expect(online.getByLabel('Totaux')).not.toContainText('Total HT');
  await expect(
    online.getByRole('heading', { name: 'Conditions générales de vente et de réparation' }),
  ).toBeVisible();
  await online.close();

  // Fiche du véhicule : vendu, certificat de cession prérempli (2 exemplaires)
  await page.goto(`/location/flotte/${vehicle.data.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Vendu');
  await expect(page.getByRole('button', { name: 'Vendre', exact: true })).toHaveCount(0);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Certificat de cession (cerfa)' }).click(),
  ]);
  expect(download.suggestedFilename()).toContain('Certificat-de-cession');
  const pdf = await PDFDocument.load(readFileSync(await download.path()));
  expect(pdf.getPageCount()).toBe(2);

  // Flotte : plus proposé à la location, retrouvé dans « Vendus »
  await page.goto('/location/flotte');
  await expect(page.getByRole('link', { name: new RegExp(plate) })).toHaveCount(0);
  await page.getByRole('button', { name: /^Vendus/ }).click();
  await expect(page.getByRole('link', { name: new RegExp(plate) })).toBeVisible();
});

test('vente annulée tant que la facture est en brouillon : véhicule de retour dans la flotte', async ({
  page,
}, testInfo) => {
  const id = suffix(testInfo);
  const plate = `VA-${id}`;
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const vehicle = await api
    .from('fleet_vehicles')
    .insert({ plate, brand: 'Iveco', model: 'Daily', category: 'van', daily_rate: 80 })
    .select('id')
    .single();
  if (vehicle.error) throw vehicle.error;
  const client = await api
    .from('clients')
    .insert({ name: `Annulation ${id}`, billing_address: '1 rue du Test, 95190 Goussainville' })
    .select('id')
    .single();
  if (client.error) throw client.error;
  const sale = await api.rpc('sell_fleet_vehicle', {
    p_vehicle_id: vehicle.data.id,
    p_client_id: client.data.id,
    p_sold_at: new Date().toISOString(),
    p_mileage: 1000,
    p_vat_scheme: 'normal',
    p_price: 10000,
  });
  if (sale.error) throw sale.error;

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/location/flotte/${vehicle.data.id}`);
  await page.getByRole('button', { name: 'Annuler la vente' }).click();
  await page
    .getByRole('dialog', { name: 'Annuler cette vente ?' })
    .getByRole('button', { name: 'Annuler la vente' })
    .click();
  await expect(page.getByRole('button', { name: 'Vendre', exact: true })).toBeVisible();
  expect(sql(`select count(*) from public.invoices where id = '${sale.data}'`)).toBe('0');
});
