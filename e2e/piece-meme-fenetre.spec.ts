import { createClient } from '@supabase/supabase-js';
import { expect, test, type Locator, type Page } from '@playwright/test';
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

/** Champs d'une pièce, les mêmes sur un OR et sur un devis. */
const FIELDS = [
  'Désignation',
  'Référence véhicule',
  'Réf. fabricant',
  'Réf. constructeur',
  'Marque',
  'Fournisseur',
  'Prix d’achat HT (€)',
  'Frais de port HT (€)',
  'Prix de vente HT (€)',
  'Marge (%)',
  'Quantité',
];

async function expectSameFields(dialog: Locator) {
  for (const label of FIELDS) await expect(dialog.getByLabel(label, { exact: true })).toBeVisible();
}

test('pièce : mêmes champs sur l’OR et sur le devis, réf. constructeur gardée sur la ligne du devis', async ({
  page,
}, testInfo) => {
  const id = `${String(Date.now()).slice(-7)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const reception = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: false } },
  );
  await reception.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: order, error } = await reception.rpc('create_repair_order', {
    p_plate: `PF${id}`,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Freinage',
  });
  if (error) throw error;

  await loginAs(page, 'reception@rts.local');
  // OR : fenêtre d'ajout d'une pièce
  await page.goto(`/or/${order.id}`);
  await page.getByRole('button', { name: 'Ajouter une pièce' }).first().click();
  const orDialog = page.getByRole('dialog', { name: 'Ajouter une pièce' });
  await expectSameFields(orDialog);
  await expect(orDialog.getByLabel('Commande')).toBeVisible();
  await orDialog.getByRole('button', { name: 'Annuler' }).click();

  // Devis : mêmes champs, la réf. constructeur se saisit et part sur la ligne
  await page.goto('/devis/nouveau');
  await page.getByLabel('Client').fill('Transports E2E');
  await page.getByRole('button', { name: 'Créer le devis' }).click();
  await expect(page.getByRole('heading', { name: 'DEVIS', exact: true, level: 2 })).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter une pièce' }).click();
  const quoteDialog = page.getByRole('dialog', { name: 'Ajouter une pièce' });
  await expectSameFields(quoteDialog);
  await quoteDialog.getByLabel('Désignation').fill(`Tambour de frein ${id}`);
  await quoteDialog.getByLabel('Réf. fabricant').fill(`TF-${id}`);
  await quoteDialog.getByLabel('Réf. constructeur').fill(`OE-${id}`);
  await quoteDialog.getByLabel('Prix de vente HT (€)').fill('120');
  await quoteDialog.getByRole('button', { name: 'Ajouter la pièce' }).click();
  await expect(quoteDialog).toBeHidden();
  await expect
    .poll(() => sql(`select oem_ref from public.quote_lines where description = 'Tambour de frein ${id}'`))
    .toBe(`OE-${id}`);
});
