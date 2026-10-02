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

/** Client créé avec un premier OR (API : réception). */
async function createClientWithOrder(plate: string, clientName: string) {
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
  });
  if (error) throw error;
  return data.client_id ?? '';
}

test('fiche client : contact de référence puis autres numéros libellés, retrouvés par la recherche', async ({
  page,
}, testInfo) => {
  const id = `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;
  const clientName = `Client numéros ${id}`;
  const clientId = await createClientWithOrder(`TEL${id}`, clientName);
  const accounting = `01 4${id.slice(-1)} ${id.slice(1, 3)} ${id.slice(3, 5)} ${id.slice(5, 7)}`;

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/clients/${clientId}`);
  await expect(page.getByRole('heading', { name: clientName })).toBeVisible();

  await page.getByLabel('Contact de référence').fill('Paul Martin');
  await page.getByLabel('Téléphone du contact').fill('06 12 34 56 78');
  await page.getByRole('button', { name: 'Ajouter un numéro' }).click();
  const first = page.getByRole('group', { name: 'Autre numéro 1' });
  await first.getByLabel('Numéro', { exact: true }).fill(accounting);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  // Libellé obligatoire
  await expect(first.getByText('Indique à qui est ce numéro')).toBeVisible();
  await first.getByLabel('Libellé', { exact: true }).fill('Comptabilité');

  await page.getByRole('button', { name: 'Ajouter un numéro' }).click();
  const second = page.getByRole('group', { name: 'Autre numéro 2' });
  await second.getByLabel('Libellé', { exact: true }).fill('Chef d’atelier');
  await second.getByLabel('Numéro', { exact: true }).fill('06 98 76 54 32');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Fiche client enregistrée')).toBeVisible();

  // Rechargée : le contact de référence d'abord, puis les autres numéros dans l'ordre
  await page.reload();
  await expect(page.getByLabel('Contact de référence')).toHaveValue('Paul Martin');
  await expect(page.getByLabel('Téléphone du contact')).toHaveValue('06 12 34 56 78');
  await expect(first.getByLabel('Libellé', { exact: true })).toHaveValue('Comptabilité');
  await expect(second.getByLabel('Numéro', { exact: true })).toHaveValue('06 98 76 54 32');

  // Un numéro retiré disparaît
  await page.getByRole('button', { name: 'Retirer l’autre numéro 2' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Fiche client enregistrée')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('group', { name: /Autre numéro/ })).toHaveCount(1);

  // Liste des clients : le numéro de la comptabilité, tapé sans espaces, retrouve le client
  await page.goto('/clients');
  await page.getByRole('searchbox', { name: 'Rechercher un client' }).fill(accounting.replace(/\s/g, ''));
  await expect(page.getByRole('link', { name: clientName, exact: true })).toBeVisible();
});
