import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
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
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

test('client archivé avec son véhicule, hors de la liste, restauré depuis Réglages › Archives', async ({
  page,
}, testInfo) => {
  const id = suffix(testInfo);
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: order, error } = await api.rpc('create_repair_order', {
    p_plate: `AR${id}`,
    p_vehicle_type: 'pl',
    p_client_name: `Client archive ${id}`,
    p_requested_work: 'Vidange',
  });
  if (error) throw error;

  await loginAs(page, 'direction@rts.local');
  await page.goto(`/clients/${order.client_id}`);
  await page.getByRole('button', { name: 'Archiver' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archiver' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Client archivé le' })).toBeVisible();

  // Hors de la liste des clients
  await page.goto('/clients');
  await page.getByRole('searchbox', { name: 'Rechercher un client' }).fill(`Client archive ${id}`);
  await expect(page.getByText(`Client archive ${id}`)).toHaveCount(0);

  // Réglages › Archives : client et véhicule, puis restauré
  await page.goto('/reglages?onglet=archives');
  const clients = page.getByRole('region', { name: 'Clients archivés' });
  await expect(clients).toContainText(`Client archive ${id}`);
  await expect(page.getByRole('region', { name: 'Véhicules archivés' })).toContainText(`AR${id}`);
  await clients.getByRole('button', { name: `Restaurer Client archive ${id}` }).click();
  await expect(clients).not.toContainText(`Client archive ${id}`);
  await expect(page.getByRole('region', { name: 'Véhicules archivés' })).not.toContainText(`AR${id}`);

  await page.goto('/clients');
  await page.getByRole('searchbox', { name: 'Rechercher un client' }).fill(`Client archive ${id}`);
  await expect(page.getByText(`Client archive ${id}`).first()).toBeVisible();
});

test('véhicule sans historique supprimé par la direction', async ({ page }, testInfo) => {
  const id = suffix(testInfo);
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: vehicle, error } = await api
    .from('vehicles')
    .insert({ plate: `SU${id}`, vehicle_type: 'pl' })
    .select('id')
    .single();
  if (error) throw error;

  await loginAs(page, 'direction@rts.local');
  await page.goto(`/vehicules/${vehicle.id}`);
  await page.getByRole('button', { name: 'Supprimer' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page).toHaveURL(/\/vehicules$/);
  await expect(page.getByText('Véhicule supprimé')).toBeVisible();
});
