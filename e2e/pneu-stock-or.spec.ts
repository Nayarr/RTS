import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

test('pneu du stock ajouté sur un OR : réservé, disponible, pas de pièce en attente', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Fiche OR du bureau');
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const suffix = String(Date.now()).slice(-6);
  const model = `Stock ${suffix}`;
  const { data: tire, error: tireError } = await api.rpc('add_tires', {
    p_category: 'pl',
    p_size: '29580225',
    p_profile: 'avant',
    p_brand: 'Michelin',
    p_model: model,
    p_condition: 'neuf',
    p_quantity: 4,
    p_purchase_price: 300,
    p_sale_price: 400,
  });
  if (tireError) throw tireError;
  const { data: order, error } = await api.rpc('create_repair_order', {
    p_plate: `PS${suffix}`,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Remplacement pneus avant',
  });
  if (error) throw error;

  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill('reception@rts.local');
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
  await page.goto(`/or/${order.id}`);

  await page.getByRole('button', { name: 'Pneu du stock' }).click();
  const dialog = page.getByRole('dialog', { name: 'Pneus du stock' });
  await dialog.getByLabel('Taille du pneu').fill('29580225');
  await dialog.getByRole('radio', { name: `Michelin ${model}` }).click();
  await dialog.getByRole('button', { name: 'Ajouter à l’OR' }).click();
  await expect(dialog).toBeHidden();

  const designation = `Pneu Michelin ${model} 295/80 R22.5`;
  await expect(page.getByText(designation)).toBeVisible();
  await expect(page.getByRole('combobox', { name: `Commande : ${designation}` })).toHaveValue('received');
  await expect(page.getByText(/Attente pièces/)).toHaveCount(0);

  const { data: lot } = await api
    .from('v_tire_lots')
    .select('stock_qty, reserved_qty, available_qty')
    .eq('id', tire)
    .single();
  expect(lot).toEqual({ stock_qty: 4, reserved_qty: 2, available_qty: 2 });
});
