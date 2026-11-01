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

test('fiche OR : le bureau ajoute, modifie et supprime les lignes de travaux', async ({ page }, testInfo) => {
  const plate = `LB${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 90 + 10)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const reception = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: false } },
  );
  await reception.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: order, error } = await reception.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: `Client lignes ${plate}`,
    p_requested_work: 'Freinage',
  });
  if (error) throw error;

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${order.id}`);
  const card = page.getByRole('region', { name: 'Intervention atelier' });

  // Ligne ajoutée à prévoir, avec son temps
  await card.getByRole('button', { name: 'Ajouter une ligne (à prévoir)' }).click();
  await card.getByRole('textbox', { name: 'Nouvelle ligne (à prévoir)' }).fill('Géométrie train avant');
  await card.getByRole('textbox', { name: 'Temps en heures (à prévoir)' }).fill('1,5');
  await card.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(card.getByText('Géométrie train avant')).toBeVisible();
  expect(
    sql(
      `select estimated_hours from public.ro_lines where repair_order_id = '${order.id}' and kind = 'planned'`,
    ),
  ).toBe('1.50');

  // Texte modifié
  await card.getByRole('button', { name: 'Modifier : Géométrie train avant' }).click();
  await card
    .getByRole('textbox', { name: 'Texte de la ligne : Géométrie train avant' })
    .fill('Géométrie complète');
  await card.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(card.getByText('Géométrie complète')).toBeVisible();

  // Supprimée après confirmation
  await card.getByRole('button', { name: 'Supprimer : Géométrie complète' }).click();
  await page
    .getByRole('dialog', { name: 'Supprimer cette ligne ?' })
    .getByRole('button', { name: 'Supprimer' })
    .click();
  await expect(card.getByText('Géométrie complète')).toHaveCount(0);
  expect(
    sql(`select count(*) from public.ro_lines where repair_order_id = '${order.id}' and kind = 'planned'`),
  ).toBe('0');
});
