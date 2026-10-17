import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { fillNewProClient } from './support/new-client';

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

/** Réglage commun à toute l'appli : remis à vide après le test (comme en local et en CI). */
async function resetSuppliesFee() {
  const direction = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: false } },
  );
  await direction.auth.signInWithPassword({ email: 'direction@rts.local', password: PASSWORD });
  const { error } = await direction.from('company_settings').update({ supplies_fee_ht: null }).eq('id', true);
  if (error) throw error;
}

test.describe.configure({ mode: 'serial' });

test('ligne « Fournitures et recyclage » : réglée par la direction, ajoutée au nouveau devis, modifiable', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Réglage commun : un seul projet');
  const plate = `LF${String(Date.now()).slice(-7)}D`;
  try {
    await loginAs(page, 'direction@rts.local');
    await page.goto('/reglages?section=facturation');
    await page.getByRole('tab', { name: 'Devis et factures' }).click();
    await page.getByLabel('Ligne « Fournitures et recyclage » (€ HT)').fill('15');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Réglages de facturation enregistrés')).toBeVisible();

    await page.goto('/devis/nouveau');
    await page.getByLabel('Client', { exact: true }).fill(`Client ${plate}`);
    await fillNewProClient(page);
    await page.getByLabel('Immatriculation (facultatif)').fill(plate);
    await page.getByRole('button', { name: 'Créer le devis' }).click();
    await expect(page.getByRole('heading', { name: 'DEVIS', exact: true, level: 2 })).toBeVisible();

    const designation = page.getByRole('textbox', { name: 'Désignation' });
    await expect(designation).toHaveValue('Fournitures et recyclage');
    await expect(page.getByLabel('Totaux')).toContainText('15,00 €');

    // Montant modifiable, ligne supprimable
    const price = page.getByRole('textbox', { name: 'Prix unit. HT' });
    await price.fill('12,5');
    await price.blur();
    await expect(page.getByLabel('Totaux')).toContainText('12,50 €');
    await page.getByRole('button', { name: 'Supprimer Fournitures et recyclage' }).click();
    await expect(designation).toHaveCount(0);
  } finally {
    await resetSuppliesFee();
  }
});
