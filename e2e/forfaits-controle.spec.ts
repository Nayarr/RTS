import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
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

const choose = (page: Page, group: string, value: string) =>
  page.getByRole('radiogroup', { name: group }).getByRole('radio', { name: value }).click();

test('disques à refaire : forfait disques et plaquettes seul, barème caché au technicien', async ({
  page,
}, testInfo) => {
  // Forfaits créés pour le test : un seul navigateur, pour ne pas croiser ceux de l'autre
  test.skip(testInfo.project.name.includes('mobile'), 'Forfaits partagés entre navigateurs');
  const id = String(Date.now()).slice(-6);
  // Forfaits propres au test (catégorie VUL), retirés à la fin
  const direction = await api('direction@rts.local');
  const { data: packages, error: packagesError } = await direction
    .from('service_packages')
    .insert([
      {
        name: `FORFAIT PLAQUETTE AR ${id}`,
        category: 'vul',
        standard_hours: 1,
        price: 99,
        trigger_fields: ['plaquettes_arriere'],
      },
      {
        name: `FORFAIT DISQUES ET PLAQUETTE AR ${id}`,
        category: 'vul',
        standard_hours: 2,
        price: 250,
        trigger_fields: ['disques_arriere'],
      },
    ])
    .select('id');
  if (packagesError) throw packagesError;

  const reception = await api('reception@rts.local');
  const { data: alice } = await reception
    .from('technicians')
    .select('id')
    .eq('display_name', 'Alice')
    .single();
  const { data: order, error } = await reception.rpc('create_repair_order', {
    p_plate: `FC${id}`,
    p_vehicle_type: 'vul',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Freins arrière',
    p_technician_id: alice?.id,
  });
  if (error) throw error;

  await loginAs(page, 'alice@rts.local');
  await page.goto(`/atelier/or/${order.id}`);
  await choose(page, 'Plaquettes arrière', 'HS');
  await choose(page, 'Disques de frein arrière', 'HS');
  // Valeur choisie en rouge (HS)
  await expect(
    page.getByRole('radiogroup', { name: 'Disques de frein arrière' }).getByRole('radio', { name: 'HS' }),
  ).toHaveClass(/tone/);

  const planned = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('heading', { name: 'Pièces / réparations à prévoir (devis)' }) });
  const tasks = planned.getByRole('textbox', { name: 'Description de la tâche' });
  await expect(tasks).toHaveCount(1);
  await expect(tasks.first()).toHaveValue(/DISQUES ET PLAQUETTE AR/);
  // Ni « Forfait », ni barème : le technicien donne son temps estimé
  await expect(planned.getByText('Forfait', { exact: true })).toHaveCount(0);
  await expect(planned.getByRole('option', { name: /Barème/ })).toHaveCount(0);

  // Essieu ajouté, taille mise en forme toute seule
  await page.getByRole('button', { name: 'Ajouter un essieu' }).click();
  await page.getByRole('textbox', { name: 'Taille pneus essieu 4' }).fill('31580225');
  await expect(page.getByRole('textbox', { name: 'Taille pneus essieu 4' })).toHaveValue('315/80/22.5');

  // Photo du contrôle technique exigée pour terminer
  await page.getByRole('group', { name: 'Devis nécessaire ?' }).getByRole('button', { name: 'OUI' }).click();
  await expect(page.getByRole('status', { name: 'À compléter avant de terminer' })).toContainText(
    'Photo du contrôle technique obligatoire',
  );

  await direction
    .from('service_packages')
    .update({ is_active: false })
    .in(
      'id',
      (packages ?? []).map((pkg) => pkg.id),
    );
});
