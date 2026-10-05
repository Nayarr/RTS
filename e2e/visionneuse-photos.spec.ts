import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';
// PNG 1×1 : photo factice (assez légère pour ne pas être recompressée).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

/** OR assigné à Alice (API : réception). */
async function orderForAlice(plate: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: alice } = await client.from('technicians').select('id').eq('display_name', 'Alice').single();
  const { data, error } = await client.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports Photos',
    p_requested_work: 'Contrôle général',
    p_technician_id: alice?.id,
  });
  if (error) throw error;
  return data;
}

async function takePhoto(page: Page, label: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: label, exact: true }).click();
  await (await chooser).setFiles({ name: `${label}.png`, mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('img', { name: label, exact: true })).toBeVisible();
}

test('visionneuse : flèches, clavier, vignettes, auteur et téléchargement « plaque_libellé.jpg »', async ({
  page,
}, testInfo) => {
  test.slow();
  const plate = `VP${String(Date.now()).slice(-6)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const order = await orderForAlice(plate);

  // Le technicien prend trois photos, puis les regarde en grand
  await loginAs(page, 'alice@rts.local');
  await page.goto(`/atelier/or/${order.id}`);
  for (const label of ['Face avant', 'Côté gauche', 'Côté droit']) await takePhoto(page, label);
  await page.getByRole('button', { name: 'Voir la photo « Face avant » en grand' }).click();
  const viewer = page.getByRole('dialog', { name: /Photos de l’OR/ });
  await expect(viewer.getByText('1 / 3')).toBeVisible();
  await expect(viewer.getByText(plate, { exact: true })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(viewer.getByText('2 / 3')).toBeVisible();
  await expect(viewer.getByText('Côté gauche', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  await page.evaluate(() => localStorage.clear()); // nouvelle session, comme sur un autre poste

  // Le bureau ouvre la même photo depuis la fiche OR : auteur et téléchargement
  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${order.id}`);
  await page.getByRole('button', { name: 'Voir la photo « Côté gauche » en grand' }).click();
  const office = page.getByRole('dialog', { name: /Photos de l’OR/ });
  await expect(office.getByText('2 / 3')).toBeVisible();
  await expect(
    office.getByText(/^Photo 2 sur 3 · prise le \d{2}\/\d{2}\/\d{4} à \d{2}:\d{2} par /),
  ).toBeVisible();
  await office.getByRole('button', { name: 'Photo suivante' }).click();
  await expect(office.getByText('3 / 3')).toBeVisible();
  await office.getByRole('button', { name: 'Face avant (1 sur 3)' }).click();
  await expect(office.getByText('1 / 3')).toBeVisible();

  const download = page.waitForEvent('download');
  await office.getByRole('button', { name: 'Télécharger' }).click();
  expect((await download).suggestedFilename()).toBe(`${plate}_face-avant.jpg`);
});
