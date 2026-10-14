import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { parisDay } from './support/dates';

const env = loadEnv('production', process.cwd(), 'VITE_');
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

async function reception() {
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

const uid = (name: string) => `${name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-5)}`;

/** Même jour, `months` mois plus tard (« 2026-10-14 » + 2 → « 2026-12-14 »). */
function monthsLater(iso: string, months: number) {
  const [year = 0, month = 1, day = 1] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

test('contrat au mois : retour calculé, tacite reconduction au mois', async ({ page }, testInfo) => {
  const id = uid(testInfo.project.name);
  const api = await reception();
  const vehicle = await api
    .from('fleet_vehicles')
    .insert({
      plate: `RC-${id}`,
      brand: 'Renault',
      model: `Master ${id}`,
      category: 'van',
      daily_rate: 95,
      month_rate: 1500,
      deposit: 1500,
      mileage: 48210,
    })
    .select('id')
    .single();
  expect(vehicle.error).toBeNull();
  const client = await api
    .from('clients')
    .insert({ kind: 'pro', name: `Transports Mois ${id}` })
    .select('id, name')
    .single();
  expect(client.error).toBeNull();

  await loginAs(page, 'reception@rts.local');
  await page.goto('/location/nouvelle');
  await page.getByLabel('Rechercher un client').fill(client.data!.name);
  await page
    .getByRole('list', { name: 'Clients' })
    .getByRole('button', { name: new RegExp(client.data!.name) })
    .click();

  const departure = parisDay(1);
  await page.getByLabel('Date de départ *').fill(departure);
  await page.getByLabel('Heure de départ *').fill('09:30');
  await page.getByRole('group', { name: 'Contrat' }).getByRole('button', { name: 'Mois' }).click();
  await page.getByLabel('Durée (mois)').fill('2');
  await expect(page.getByLabel('Date de retour prévue *')).toHaveValue(monthsLater(departure, 2));
  await expect(page.getByText('le contrat se prolonge d’un mois à la fois', { exact: false })).toBeVisible();

  await page.getByRole('radio', { name: new RegExp(`RC-${id}`) }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page).toHaveURL(/\/location\/contrats\/[0-9a-f-]+/);

  const { data: rental } = await api
    .from('rentals')
    .select('id, rate_period, periods, unit_price, tacit_renewal')
    .eq('client_id', client.data!.id)
    .single();
  expect(rental).toMatchObject({ rate_period: 'month', periods: 2, unit_price: 1500, tacit_renewal: true });

  await page.goto(`/location/contrats/${rental!.id}`);
  await expect(page.getByText('Tacite, d’un mois à la fois')).toBeVisible();
});

test('flotte : lecture de la carte grise proposée à l’ajout d’un véhicule', async ({ page }) => {
  await loginAs(page, 'reception@rts.local');
  await page.goto('/location/flotte/nouveau');
  const card = page.getByRole('region', { name: 'Carte grise' });
  await expect(card.getByRole('button', { name: 'Lire la carte grise' })).toBeVisible();
  await expect(page.getByLabel('Année (€)')).toBeVisible();
});
