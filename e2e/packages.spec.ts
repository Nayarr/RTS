import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
const PASSWORD = 'atelier-dev-2026';

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
}

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-7)}`;

/** Devis PL sans OR (API : direction). */
async function createQuote(clientName: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'direction@rts.local', password: PASSWORD });
  const { data, error } = await client.rpc('create_quote', {
    p_client_name: clientName,
    p_vehicle_type: 'pl',
  });
  if (error) throw error;
  return data;
}

test('la direction crée un forfait, inséré dans un devis, puis le retire', async ({ page }, testInfo) => {
  test.slow();
  const id = suffix(testInfo);
  const name = `Forfait e2e ${id}`;

  await loginAs(page, 'direction@rts.local');
  await page.goto('/stock/forfaits');
  await page.getByRole('button', { name: 'Nouveau forfait' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouveau forfait' });
  await dialog.getByLabel('Nom du forfait').fill(name);
  await dialog.getByLabel('Temps barème (heures)').fill('2,5');
  await dialog.getByLabel('Prix forfaitaire HT (€)').fill('215');
  await dialog.getByLabel(/Mots-clés/).fill(`contrôle ${id.toLowerCase()}`);
  await dialog.getByLabel('Détail des opérations (une par ligne)').fill('Contrôle freinage\nEssai routier');
  await dialog.getByRole('button', { name: 'Ajouter le forfait' }).click();
  await expect(dialog).toBeHidden();

  const card = page.getByRole('article', { name });
  await expect(card).toContainText(/PL2,5 h barème/);
  await expect(card).toContainText(/215,00\s€/);

  // Le forfait est proposé dans les devis
  const quote = await createQuote(`Client forfait ${id}`);
  await page.goto(`/devis/${quote.id}`);
  await page.getByRole('button', { name: 'Insérer un forfait' }).click();
  await page
    .getByRole('dialog', { name: 'Insérer un forfait' })
    .getByRole('button', { name: new RegExp(name) })
    .click();
  await expect(page.getByText(name).first()).toBeVisible();
  await expect(page.getByText(/215,00\s€/).first()).toBeVisible();

  // Retiré du catalogue : plus proposé
  await page.goto('/stock/forfaits');
  await card.getByRole('button', { name: `Supprimer ${name}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByText('Forfait supprimé')).toBeVisible();
  await expect(card).toHaveCount(0, { timeout: 10_000 });
  await page.goto(`/devis/${quote.id}`);
  await page.getByRole('button', { name: 'Insérer un forfait' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Insérer un forfait' }).getByRole('button', { name: new RegExp(name) }),
  ).toHaveCount(0);
});

test('la réception n’a pas accès aux forfaits', async ({ page }) => {
  await loginAs(page, 'reception@rts.local');
  await page.goto('/stock/forfaits');
  await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
});
