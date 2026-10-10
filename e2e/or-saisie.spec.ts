import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
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

const stamp = (mobile: boolean) => `${String(Date.now()).slice(-6)}${mobile ? 'M' : 'D'}`;

test('client inconnu : sa fiche complète est demandée et créée avec l’OR', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Création d’OR au bureau');
  const id = stamp(false);
  const plate = `OS${id}`;
  await loginAs(page, 'reception@rts.local');
  await page.goto('/or/nouveau');
  await page.getByLabel('Immatriculation').fill(plate);
  await page.getByLabel('Client', { exact: true }).fill(`Garage Essai ${id}`);
  await page.getByLabel('Tâche à faire').fill('Révision');
  await page.getByRole('button', { name: 'Créer l’OR' }).click();

  // Fiche à compléter : tout est obligatoire
  await expect(page.getByText('Nouveau client : fiche à compléter')).toBeVisible();
  await page.getByRole('button', { name: 'Créer l’OR' }).click();
  await expect(page.getByText('Indique l’e-mail')).toBeVisible();
  await page.getByLabel('SIREN *').fill('552100554');
  await page.getByLabel('Téléphone *').fill('0612345678');
  await page.getByLabel('E-mail *').fill(`essai${id}@exemple.test`);
  await page.getByLabel('Adresse de facturation *').fill('2 rue des Essais, 95190 Goussainville');
  await page.getByRole('button', { name: 'Créer l’OR' }).click();
  await expect(page).toHaveURL(/\/or\/[0-9a-f-]{36}$/);

  const api = await reception();
  const { data } = await api.from('clients').select('email, phone').eq('name', `Garage Essai ${id}`).single();
  expect(data).toEqual({ email: `essai${id}@exemple.test`, phone: '0612345678' });
});

test('plaque connue proposée pendant la saisie : client et type repris', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Création d’OR au bureau');
  const plate = `SG-${String(Date.now()).slice(-3)}-RT`;
  const api = await reception();
  const { error } = await api.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'remorque',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Freins',
  });
  if (error) throw error;

  await loginAs(page, 'reception@rts.local');
  await page.goto('/or/nouveau');
  await page.getByLabel('Immatriculation').fill(plate.slice(0, 6));
  await page
    .getByRole('listbox', { name: 'Propositions : Immatriculation' })
    .getByRole('option', { name: new RegExp(plate) })
    .click();
  await expect(page.getByLabel('Immatriculation')).toHaveValue(plate);
  await expect(page.getByLabel('Client', { exact: true })).toHaveValue('Transports E2E');
  await expect(page.getByRole('button', { name: 'Remorque' })).toHaveAttribute('aria-pressed', 'true');
});

test('technicien : kilométrage enregistré sans bouton, fiche dans l’ordre de l’ancienne appli', async ({
  page,
}, testInfo) => {
  const api = await reception();
  const { data: alice } = await api.from('technicians').select('id').eq('display_name', 'Alice').single();
  const { data: order, error } = await api.rpc('create_repair_order', {
    p_plate: `KM${stamp(testInfo.project.name.includes('mobile'))}`,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Vidange',
    p_technician_id: alice?.id,
  });
  if (error) throw error;

  await loginAs(page, 'alice@rts.local');
  await page.goto(`/atelier/or/${order.id}`);
  await expect(page.getByText(/renseigne les photos/)).toBeVisible();
  await expect(page.getByText(/le kilométrage/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'OK', exact: true })).toHaveCount(0);
  await page.getByLabel('Kilométrage').fill('184320');
  await expect(page.getByText('Kilométrage enregistré')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Kilométrage')).toHaveValue('184320');

  // Photos et fiche de contrôle avant les travaux
  const headings = await page.getByRole('heading', { level: 2 }).allTextContents();
  const at = (name: string) => headings.findIndex((text) => text.includes(name));
  expect(at('Photos')).toBeLessThan(at('Travaux effectués'));
  expect(at('Fiche de contrôle')).toBeLessThan(at('Travaux effectués'));
});
