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

test('retour : page précédente, sinon la page parente si la fiche est ouverte directement', async ({
  page,
}, testInfo) => {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: false } },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const plate = `RA${suffix(testInfo)}`;
  const { error } = await client.rpc('create_quote', {
    p_client_name: `Client retour ${plate}`,
    p_plate: plate,
    p_vehicle_type: 'pl',
  });
  if (error) throw error;
  const vehicleId = sql(`select id from public.vehicles where plate = '${plate}'`);
  const clientId = sql(`select client_id from public.vehicles where plate = '${plate}'`);

  await loginAs(page, 'reception@rts.local');

  // Fiche ouverte depuis la liste des véhicules : retour à la liste (et non au client)
  await page.goto('/vehicules');
  await page.getByRole('searchbox').first().fill(plate);
  await page.getByRole('row', { name: plate }).click();
  await expect(page).toHaveURL(new RegExp(`/vehicules/${vehicleId}$`));
  await page.getByRole('link', { name: 'Retour à la page précédente' }).click();
  await expect(page).toHaveURL(/\/vehicules$/);

  // Lien collé dans un onglet neuf : pas de page précédente, retour à la fiche du client
  const fresh = await page.context().newPage();
  await fresh.goto(`/vehicules/${vehicleId}`);
  await fresh.getByRole('link', { name: 'Retour au client' }).click();
  await expect(fresh).toHaveURL(new RegExp(`/clients/${clientId}$`));
  await fresh.close();

  // Formulaire validé : le retour ne repasse pas par le formulaire
  await page.goto('/clients');
  await page.getByRole('link', { name: 'Nouveau client' }).click();
  await page.getByRole('radio', { name: /Professionnel/ }).click();
  await page.getByLabel('Raison sociale *').fill(`Transports retour ${plate}`);
  await page.getByLabel('SIRET').fill('123 456 789 00015');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}$/);
  await page.getByRole('link', { name: 'Retour à la page précédente' }).click();
  await expect(page).toHaveURL(/\/clients$/);
});
