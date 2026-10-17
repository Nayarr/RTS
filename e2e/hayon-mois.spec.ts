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

/** Véhicule de test (API : réception). */
async function vehicle(testInfo: TestInfo) {
  const reception = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await reception.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: client } = await reception.from('clients').select('id').eq('name', 'Transports E2E').single();
  const plate = `HM${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-6)}`;
  const { data, error } = await reception
    .from('vehicles')
    .insert({ plate, client_id: client!.id, vehicle_type: 'pl' })
    .select('id, plate')
    .single();
  if (error) throw error;
  return data;
}

test('hayon : échéance choisie au mois et à l’année, affichée MM/AAAA dans les échéances', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Fiche véhicule du bureau');
  const { id, plate } = await vehicle(testInfo);
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear());

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/vehicules/${id}`);
  await expect(page.getByRole('heading', { name: new RegExp(plate) })).toBeVisible();
  // Pas de jour : un mois et une année
  await page.getByLabel('Contrôle hayon : mois').selectOption(month);
  await page.getByLabel('Contrôle hayon : année').selectOption(year);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Fiche véhicule enregistrée')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Contrôle hayon : mois')).toHaveValue(month);
  await expect(page.getByLabel('Contrôle hayon : année')).toHaveValue(year);

  // Valable jusqu'à la fin du mois : dans les échéances, sous la forme MM/AAAA
  await page.goto('/vehicules/echeances');
  const row = page.getByRole('row', { name: new RegExp(plate) });
  await expect(row).toContainText(`Contrôle hayon${month}/${year}`);
});
