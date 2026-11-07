import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

test('kilométrage saisi par le technicien corrigé depuis la fiche OR, noté dans l’historique', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Fiche OR du bureau');
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'alice@rts.local', password: PASSWORD });
  const reception = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: false } },
  );
  await reception.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: alice } = await reception
    .from('technicians')
    .select('id')
    .eq('display_name', 'Alice')
    .single();
  const { data: order, error } = await reception.rpc('create_repair_order', {
    p_plate: `KM${String(Date.now()).slice(-6)}`,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Vidange',
    p_technician_id: alice?.id,
  });
  if (error) throw error;
  // Le technicien se trompe d'un zéro
  const typed = await api.rpc('tech_update_repair_order', {
    p_repair_order_id: order.id,
    p_patch: { mileage: 1234560 },
  });
  if (typed.error) throw typed.error;

  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill('direction@rts.local');
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
  await page.goto(`/or/${order.id}`);

  const mileage = page.getByLabel('Kilométrage');
  await expect(mileage).toHaveValue('1234560');
  await mileage.fill('123456');
  // Enregistré tout seul après la saisie
  await expect
    .poll(
      async () => (await reception.from('repair_orders').select('mileage').eq('id', order.id).single()).data,
    )
    .toEqual({ mileage: 123456 });
  await page.reload();
  await expect(page.getByLabel('Kilométrage')).toHaveValue('123456');
  await expect(
    page.getByRole('region', { name: 'Historique' }).getByText('Kilométrage : 1 234 560 km → 123 456 km'),
  ).toBeVisible();
});
