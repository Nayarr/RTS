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

const uid = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-6)}`;

test('pièce de l’OR : marge liée au prix, catalogue mis à jour ou complété selon la pièce', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Fiche OR du bureau');
  const id = uid(testInfo);
  const designation = `Courroie ${id}`;
  const api = await reception();
  const { data: order, error } = await api.rpc('create_repair_order', {
    p_plate: `PC${id}`,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Courroie',
  });
  if (error) throw error;

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${order.id}`);
  const parts = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('heading', { name: 'Pièces' }) });

  // Nouvelle pièce : marge saisie, prix de vente et total calculés
  await parts.getByRole('button', { name: 'Ajouter une pièce' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajouter une pièce' });
  await dialog.getByLabel('Désignation').fill(designation);
  await dialog.getByLabel('Marque').fill('Gates');
  await dialog.getByLabel('Réf. fabricant').fill(`G-${id}`);
  await dialog.getByLabel('Prix d’achat HT (€)').fill('40');
  await dialog.getByLabel('Marge (%)').fill('50');
  await expect(dialog.getByLabel('Prix de vente HT (€)')).toHaveValue('60');
  await dialog.getByLabel('Quantité').fill('2');
  await expect(dialog.getByLabel('Total HT de la ligne')).toHaveText(/120,00/);
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();

  // Même pièce reprise de la base, nouveau prix : la pièce du catalogue est mise à jour
  await parts.getByRole('button', { name: 'Ajouter une pièce' }).click();
  await dialog.getByLabel('Désignation').fill(designation);
  await dialog
    .getByRole('list', { name: 'Pièces de la base' })
    .getByRole('button', { name: new RegExp(designation) })
    .click();
  await expect(dialog.getByLabel('Marge (%)')).toHaveValue('50');
  await dialog.getByLabel('Prix de vente HT (€)').fill('64');
  await expect(dialog.getByLabel('Marge (%)')).toHaveValue('60');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(async () => (await api.from('parts').select('sale_price').eq('designation', designation)).data)
    .toEqual([{ sale_price: 64 }]);

  // Autre marque : nouvelle pièce au catalogue, la première est gardée
  await parts.getByRole('button', { name: 'Ajouter une pièce' }).click();
  await dialog.getByLabel('Désignation').fill(designation);
  await dialog
    .getByRole('list', { name: 'Pièces de la base' })
    .getByRole('button', { name: new RegExp(designation) })
    .click();
  await dialog.getByLabel('Marque').fill('Dayco');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(
      async () =>
        (await api.from('parts').select('brand').eq('designation', designation).order('brand')).data,
    )
    .toEqual([{ brand: 'Dayco' }, { brand: 'Gates' }]);
});
