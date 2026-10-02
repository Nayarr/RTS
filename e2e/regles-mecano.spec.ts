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

/** OR assigné à Alice par la réception (API). */
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
    p_client_name: 'Transports E2E',
    p_requested_work: 'Contrôle complet',
    p_technician_id: alice?.id,
  });
  if (error) throw error;
  return data;
}

const choose = (page: Page, group: string, value: string) =>
  page.getByRole('radiogroup', { name: group }).getByRole('radio', { name: value }).click();

test('clôture du mécano : temps estimés, taille des pneus HS, photo de l’étiquette hayon HS', async ({
  page,
}, testInfo) => {
  test.slow();
  const plate = `RM${String(Date.now()).slice(-7)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const order = await orderForAlice(plate);
  await loginAs(page, 'alice@rts.local');
  await page.goto(`/atelier/or/${order.id}`);
  await expect(page.getByRole('heading', { name: plate, level: 1 })).toBeVisible();

  // Pneus avant HS sans taille, étiquette hayon HS sans photo
  await choose(page, 'Pneus avant', 'HS');
  await expect(page.getByText('Taille obligatoire : pneus à HS.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Taille pneus avant' })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await choose(page, 'Étiquette contrôle hayon', 'HS');
  await expect(page.getByText('Étiquette HS : photo obligatoire avant de terminer l’OR.')).toBeVisible();

  // Travaux effectués : 0,5 h proposé
  await page.getByRole('button', { name: 'Ajouter une tâche' }).first().click();
  const doneTask = page.getByRole('textbox', { name: 'Description de la tâche' }).first();
  await expect(doneTask).toHaveValue('');
  await doneTask.fill('Contrôle étiquettes');
  await doneTask.blur();
  const times = page.getByRole('combobox', { name: 'Temps estimé' });
  await expect(times.first().getByRole('option', { name: '0,5 h' })).toHaveCount(1);
  await times.first().selectOption('0.5h');
  await expect(times.first()).toHaveValue('0.5h');

  // Terminer : ce qui manque est listé, le bouton attend
  await page.getByRole('group', { name: 'Devis nécessaire ?' }).getByRole('button', { name: 'OUI' }).click();
  const blockers = page.getByRole('status', { name: 'À compléter avant de terminer' });
  await expect(blockers).toContainText('Temps estimé manquant : 2 tâches à prévoir');
  await expect(blockers).toContainText('Taille des pneus avant obligatoire (HS)');
  await expect(blockers).toContainText('Photo de l’étiquette contrôle hayon obligatoire (HS)');
  const finish = page.getByRole('button', { name: 'Travaux terminés' });
  await expect(finish).toBeDisabled();

  // On complète : taille, photo (icône sur la ligne OK / HS), temps des tâches à prévoir
  await page.getByRole('textbox', { name: 'Taille pneus avant' }).fill('315702.5');
  await expect(page.getByRole('textbox', { name: 'Taille pneus avant' })).toHaveValue('315/70/2.5');
  await expect(blockers).not.toContainText('Taille des pneus', { timeout: 10_000 });

  const photo = page.getByRole('button', { name: /^Photo de l’étiquette « Étiquette contrôle hayon »/ });
  await expect(photo).toHaveText('');
  const chooser = page.waitForEvent('filechooser');
  await photo.click();
  await (await chooser).setFiles({ name: 'hayon.png', mimeType: 'image/png', buffer: PNG });
  await expect(
    page.getByRole('button', { name: 'Photo de l’étiquette « Étiquette contrôle hayon » (déjà prise)' }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Étiquette HS : photo obligatoire avant de terminer l’OR.')).toHaveCount(0);

  for (const index of [1, 2]) {
    await times.nth(index).selectOption('1h');
    await expect(times.nth(index)).toHaveValue('1h');
  }
  await expect(blockers).toHaveCount(0, { timeout: 10_000 });
  await finish.click();
  await expect(page.getByRole('heading', { name: 'Mes ordres de réparation' })).toBeVisible();
});

test('fiche de contrôle sur téléphone : photo à droite de OK / HS, échéances l’une sous l’autre', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'Affichage téléphone');
  const order = await orderForAlice(`RL${String(Date.now()).slice(-7)}M`);
  await loginAs(page, 'alice@rts.local');
  await page.goto(`/atelier/or/${order.id}`);

  for (const label of ['Étiquettes angles morts', 'Étiquette contrôle hayon', 'Extincteur 1 kg cabine']) {
    const choices = await page.getByRole('radiogroup', { name: label }).boundingBox();
    const camera = await page
      .getByRole('button', { name: new RegExp(`^Photo de l’étiquette « ${label} »`) })
      .boundingBox();
    // Même ligne, à droite des choix
    expect(Math.abs((camera?.y ?? 0) - (choices?.y ?? 0))).toBeLessThan(2);
    expect(camera?.x ?? 0).toBeGreaterThan((choices?.x ?? 0) + (choices?.width ?? 0));
  }

  const ct = await page.getByLabel('Prochain contrôle technique').boundingBox();
  const tailgate = await page.getByLabel('Prochain contrôle hayon').boundingBox();
  expect(tailgate?.x).toBe(ct?.x);
  expect(tailgate?.width).toBe(ct?.width);
  expect(tailgate?.y ?? 0).toBeGreaterThan((ct?.y ?? 0) + (ct?.height ?? 0));
});
