import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
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

async function api(email: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  return client;
}

test('demande de chiffrage : tailles sous le seuil, quantité qui manque, mail sans marque au fournisseur choisi', async ({
  page,
}, testInfo) => {
  // Taille et fournisseur propres à chaque essai et à chaque navigateur
  const run = `${String(Date.now()).slice(-6)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const width = 100 + (Date.now() % 900);
  const ratio = testInfo.project.name.includes('mobile') ? '45' : '50';
  const size = `${width}/${ratio} R22.5`;
  const supplier = `Pneus E2E ${run}`;
  const email = `chiffrage-${run.toLowerCase()}@pneus-e2e.test`;

  // 2 pneus avant en stock pour un seuil de 6 : il en manque 4
  const reception = await api('reception@rts.local');
  const added = await reception.rpc('add_tires', {
    p_category: 'pl',
    p_size: `${width}${ratio}225`,
    p_profile: 'avant',
    p_brand: 'Michelin',
    p_model: 'X Multi Z',
    p_condition: 'neuf',
    p_quantity: 2,
    p_purchase_price: 300,
    p_sale_price: 400,
    p_min_qty: 6,
  });
  if (added.error) throw added.error;

  await loginAs(page, 'reception@rts.local');
  await page.goto('/stock/pneumatiques');

  // Fournisseur et e-mail des commandes
  await page.getByRole('button', { name: 'Fournisseurs' }).click();
  let dialog = page.getByRole('dialog');
  const form = dialog.getByRole('form', { name: 'Nouveau fournisseur' });
  await form.getByLabel('Nom du fournisseur').fill(supplier);
  await form.getByLabel('E-mail des commandes').fill(email);
  await form.getByRole('button', { name: 'Ajouter' }).click();
  await expect(dialog.getByRole('listitem', { name: supplier })).toContainText(email);
  await page.keyboard.press('Escape');

  // Demande : la taille est reprise avec les 4 pneus qui manquent
  await page.getByRole('button', { name: /Demander un chiffrage/ }).click();
  dialog = page.getByRole('dialog');
  const row = dialog.getByRole('row', { name: `${size} avant` });
  await expect(row.getByLabel(`Quantité ${size} avant`)).toHaveValue('4');
  await dialog.getByRole('button', { name: supplier }).click();
  const preview = dialog.getByRole('region', { name: 'Aperçu du mail' });
  await expect(preview).toContainText(email);
  await expect(preview).toContainText(`• ${size}, profil avant : 4 pneus`);
  await expect(preview).toContainText('Toutes marques possibles');
  await expect(preview).not.toContainText('Michelin');

  // Envoi par l'appli coupé : messagerie de l'ordinateur, fournisseur en copie cachée
  const link = dialog.getByRole('link', { name: 'Ouvrir la messagerie' });
  await expect(link).toHaveAttribute('href', new RegExp(`^mailto:\\?bcc=${encodeURIComponent(email)}`));
  await link.dispatchEvent('click');
  await expect(dialog).toBeHidden();
  expect(
    sql(
      `select count(*) from public.tire_quote_requests where '${email}' = any (recipients) and lines::text like '%${size}%'`,
    ),
  ).toBe('1');
});
