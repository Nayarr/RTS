import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { parisDay } from './support/dates';
import { goTo } from './support/nav';

const env = loadEnv('production', process.cwd(), 'VITE_');
const PASSWORD = 'atelier-dev-2026';

// PNG 1×1 : carte grise factice.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
}

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

/** Client et véhicule créés avec un OR (API : réception). */
async function createOrder(plate: string, clientName: string, mileage: number) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data, error } = await client.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: clientName,
    p_requested_work: 'Vidange',
    p_mileage: mileage,
  });
  if (error) throw error;
  return data;
}

test('fiche client : coordonnées, véhicules et OR ; fiche véhicule : carte grise, échéance, carnet', async ({
  page,
}, testInfo) => {
  test.slow();
  const id = suffix(testInfo);
  const plate = `CL${id}`;
  const clientName = `Client fiche ${id}`;
  const order = await createOrder(plate, clientName, 123456);

  await loginAs(page, 'reception@rts.local');
  await goTo(page, 'Clients', 'Clients');
  await page.getByRole('searchbox', { name: 'Rechercher un client' }).fill(clientName);
  await page.getByRole('link', { name: clientName, exact: true }).click();

  await expect(page.getByRole('heading', { name: clientName })).toBeVisible();
  await expect(page.getByLabel('Remise client (%)')).toHaveCount(0); // réservé à la direction
  await page.getByLabel('Téléphone').fill('01 02 03 04 05');
  await page.getByLabel('Adresse de facturation').fill('3 rue du Test, 95190 Goussainville');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Fiche client enregistrée')).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(`^${order.number}`) })).toBeVisible();

  // Fiche véhicule depuis la fiche client
  await page.getByRole('link', { name: new RegExp(`^${plate}`) }).click();
  await expect(page.getByRole('heading', { name: plate })).toBeVisible();
  await expect(page.getByText(/Dernier km : 123\s456 km/)).toBeVisible();

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Ajouter la carte grise' }).click();
  await (await chooser).setFiles({ name: 'carte-grise.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('img', { name: `Carte grise ${plate}` })).toBeVisible({ timeout: 15_000 });

  const overdue = parisDay(-3);
  await page.getByLabel('Contrôle technique').fill(overdue);
  await page.getByLabel('Marque').fill('Renault Trucks');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Fiche véhicule enregistrée')).toBeVisible();
  await expect(page.getByText('Dépassé (3 j)')).toBeVisible();

  await page.getByRole('button', { name: 'Carnet d’entretien (PDF)' }).click();
  const preview = page.getByRole('dialog', { name: 'Aperçu' });
  await expect(preview.getByText(`Carnet_entretien_${plate}.pdf`)).toBeVisible();
  await preview.getByRole('button', { name: 'Fermer' }).click();

  // Le contrôle technique dépassé apparaît dans les échéances
  await page.goto('/vehicules/echeances');
  await expect(page.getByRole('row', { name: new RegExp(plate) })).toContainText('Dépassé (3 j)');
});

test('la direction fixe la remise et le taux horaire du client', async ({ page }, testInfo) => {
  const id = suffix(testInfo);
  const clientName = `Client tarif ${id}`;
  await createOrder(`TA${id}`, clientName, 1000);

  await loginAs(page, 'direction@rts.local');
  await page.goto('/clients');
  await page.getByRole('searchbox', { name: 'Rechercher un client' }).fill(clientName);
  await page.getByRole('link', { name: clientName, exact: true }).click();
  await page.getByLabel('Remise client (%)').fill('5');
  await page.getByLabel('Taux horaire client (€ HT)').fill('82,50');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Fiche client enregistrée')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Taux horaire client (€ HT)')).toHaveValue('82,5');
});

test('depuis l’OR, la plaque et le client mènent à leurs fiches', async ({ page }, testInfo) => {
  const id = suffix(testInfo);
  const plate = `OR${id}`;
  const order = await createOrder(plate, `Client OR ${id}`, 5000);

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${order.id}`);
  await page.getByRole('link', { name: `Client OR ${id}` }).click();
  await expect(page.getByRole('heading', { name: `Client OR ${id}` })).toBeVisible();
  await page.goBack();
  await page.getByRole('link', { name: plate, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/vehicules/${order.vehicle_id}$`));
});
