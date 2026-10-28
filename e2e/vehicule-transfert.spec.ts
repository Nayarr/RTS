import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { sql } from './support/db';

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
  `${String(Date.now()).slice(-6)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;

test('camion racheté par un autre client : transféré depuis sa fiche, historique gardé des deux côtés', async ({
  page,
}, testInfo) => {
  test.slow();
  const id = suffix(testInfo);
  const plate = `TR${id}`;
  const seller = `Transports Vendeur ${id}`;
  const buyer = `Logistique Acheteur ${id}`;
  // Le vendeur a déjà fait entretenir le camion (OR facturé)
  const vehicleId = sql(`
    with seller as (insert into public.clients (name) values ('${seller}') returning id),
         buyer as (insert into public.clients (name) values ('${buyer}') returning id),
         vehicle as (insert into public.vehicles (plate, client_id, vehicle_type)
                     select '${plate}', id, 'pl' from seller returning id, client_id),
         orders as (insert into public.repair_orders (vehicle_id, client_id, vehicle_type, requested_work, status)
                    select id, client_id, 'pl', 'Vidange', 'invoiced' from vehicle returning id)
    select v.id from vehicle v, orders, buyer`);

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/vehicules/${vehicleId}`);
  await page.getByRole('button', { name: 'Transférer à un autre client' }).click();
  const dialog = page.getByRole('dialog', { name: `Transférer ${plate} à un autre client` });
  await expect(dialog).toContainText(`Propriétaire actuel : ${seller}`);
  await dialog.getByLabel('Nouveau propriétaire').fill(`Acheteur ${id}`);
  await dialog.getByRole('option', { name: buyer }).click();
  await dialog.getByLabel('Motif (facultatif)').fill('Rachat de la flotte');
  await dialog.getByRole('button', { name: 'Transférer' }).click();
  await expect(dialog).toBeHidden();

  // Fiche véhicule : nouveau propriétaire, l'ancien dans l'historique avec son passage
  await expect(page.getByRole('link', { name: buyer })).toBeVisible();
  const owners = page.getByRole('region', { name: 'Propriétaires' });
  await expect(owners.getByRole('listitem')).toHaveCount(2);
  await expect(owners.getByRole('listitem').first()).toContainText(`${buyer}Actuel`);
  await expect(owners.getByRole('listitem').first()).toContainText('Rachat de la flotte');
  await expect(owners.getByRole('listitem').last()).toContainText(seller);
  const history = page.getByRole('region', { name: 'Historique des passages' });
  await expect(history.getByRole('row')).toHaveCount(2);
  await expect(history.getByRole('cell', { name: seller })).toBeVisible();

  // Fiche de l'ancien propriétaire : le camion parmi ses véhicules cédés, son OR toujours là
  const sellerId = sql(`select id from public.clients where name = '${seller}'`);
  await page.goto(`/clients/${sellerId}`);
  const sold = page.getByLabel('Véhicules cédés');
  await expect(sold.getByRole('link', { name: plate })).toBeVisible();
  await expect(sold).toContainText(`à ${buyer} le`);
  await expect(page.getByRole('region', { name: 'Ordres de réparation' })).toContainText(plate);
});
