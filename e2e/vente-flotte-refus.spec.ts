import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
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

/** État du contrat posé directement : le départ et le retour ont leurs propres e2e. */
const setRentalStatus = (id: string, status: string) =>
  sql(
    `set session_replication_role = replica; update public.rentals set status = '${status}' where id = '${id}'`,
  );

test('véhicule sous contrat : le refus de la vente nomme le contrat, puis la vente passe une fois le contrat réglé', async ({
  page,
}, testInfo) => {
  const id = suffix(testInfo);
  const plate = `VR-${id}`;
  const buyer = `Acheteur refus ${id}`;
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const vehicle = await api
    .from('fleet_vehicles')
    .insert({ plate, brand: 'Renault', model: 'Master', category: 'van', daily_rate: 80, mileage: 50000 })
    .select('id')
    .single();
  if (vehicle.error) throw vehicle.error;
  const client = await api
    .from('clients')
    .insert({ name: buyer, billing_address: '5 rue Marc Seguin, 95190 Goussainville' })
    .select('id')
    .single();
  if (client.error) throw client.error;
  const rental = await api
    .from('rentals')
    .insert({
      number: '',
      client_id: client.data.id,
      fleet_vehicle_id: vehicle.data.id,
      departure_at: new Date(Date.now() + 864e5).toISOString(),
      planned_return_at: new Date(Date.now() + 2 * 864e5).toISOString(),
    })
    .select('id, number')
    .single();
  if (rental.error) throw rental.error;

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/location/flotte/${vehicle.data.id}`);
  await page.getByRole('button', { name: 'Vendre', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Vendre ${plate}` });
  await dialog.getByRole('searchbox', { name: 'Rechercher l’acheteur' }).fill(buyer);
  await dialog.getByRole('button', { name: new RegExp(buyer) }).click();
  await dialog.getByLabel('Prix de vente HT (€)').fill('10000');

  // Contrat réservé : la vraie raison s'affiche et la fenêtre reste ouverte
  const sell = dialog.getByRole('button', { name: 'Vendre et préparer la facture' });
  await sell.click();
  await expect(
    page.getByText(`Vente impossible : location réservée (${rental.data.number}). Annule-la d'abord.`),
  ).toBeVisible();
  await expect(page.getByText('Enregistrement impossible')).toHaveCount(0);
  await expect(dialog).toBeVisible();

  // Contrat rendu, pas encore clôturé
  setRentalStatus(rental.data.id, 'returned');
  await sell.click();
  await expect(
    page.getByText(`Vente impossible : location à facturer (${rental.data.number}). Clôture-la d'abord.`),
  ).toBeVisible();

  // Contrat annulé : TVA normale, la facture part en brouillon
  setRentalStatus(rental.data.id, 'cancelled');
  await sell.click();
  await expect(page).toHaveURL(/\/factures\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Véhicule vendu : facture prête en brouillon')).toBeVisible();
  const invoiceId = page.url().split('/').pop() ?? '';
  expect(
    sql(`select count(*) from public.fleet_vehicle_sales
         where invoice_id = '${invoiceId}' and fleet_vehicle_id = '${vehicle.data.id}'`),
  ).toBe('1');
});
