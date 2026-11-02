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

/** OR de la remorque confié à Alice (API : réception). */
async function trailerOrder(testInfo: TestInfo) {
  const reception = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await reception.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: alice } = await reception
    .from('technicians')
    .select('id')
    .eq('display_name', 'Alice')
    .single();
  const id = `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-6)}`;
  const { data, error } = await reception.rpc('create_repair_order', {
    p_plate: `RM${id}`,
    p_vehicle_type: 'remorque',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Contrôle général',
    p_technician_id: alice?.id,
  });
  if (error) throw error;
  return data;
}

test('remorque : fiche par essieu sans barres ni kit, essieu ajouté, ligne à prévoir sans temps ni barème', async ({
  page,
}, testInfo) => {
  const order = await trailerOrder(testInfo);
  await loginAs(page, 'alice@rts.local');
  await page.goto(`/atelier/or/${order.id}`);

  // 3 essieux au départ : disques, plaquettes et pneus de chacun, plus d'avant ni d'arrière
  await expect(page.getByRole('radiogroup', { name: 'Plaquettes essieu 1' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Pneus essieu 3' })).toBeVisible();
  for (const absent of [
    'Barre de direction',
    'Barre d’accouplement',
    'Kit accessoires',
    'Pneus milieu',
    'Plaquettes avant',
    'Pneus avant',
    'Pneus arrière',
  ]) {
    await expect(page.getByRole('radiogroup', { name: absent })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Ajouter un essieu' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Disques de frein essieu 4' })).toBeVisible();

  // Extincteur HS : ligne « Remplacement … » à prévoir, temps à estimer par le technicien
  await page
    .getByRole('radiogroup', { name: 'Extincteur 1 kg cabine' })
    .getByRole('radio', { name: 'HS' })
    .click();
  const planned = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('heading', { name: 'Pièces / réparations à prévoir (devis)' }) });
  const line = planned.getByRole('listitem').filter({
    has: page.getByRole('textbox', { name: 'Description de la tâche' }),
  });
  await expect(line.getByRole('textbox', { name: 'Description de la tâche' })).toHaveValue(
    'Remplacement Extincteur 1 kg cabine',
    { timeout: 10_000 },
  );
  const time = line.getByRole('combobox', { name: 'Temps estimé' });
  await expect(time).toHaveValue('');
  await expect(time.locator('option').first()).toHaveText('Estimation');
  await expect(planned.getByText(/Barème/)).toHaveCount(0);
});
