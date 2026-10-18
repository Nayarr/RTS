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

async function signedIn(email: string) {
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

/** Réglage de la direction « Lecture automatique des étiquettes ». */
async function setLabelScan(enabled: boolean) {
  const direction = await signedIn('direction@rts.local');
  const { error } = await direction
    .from('app_settings')
    .update({ label_scan_enabled: enabled })
    .eq('id', true);
  if (error) throw error;
}

/** OR assigné à Alice (API : réception). */
async function orderForAlice(plate: string) {
  const reception = await signedIn('reception@rts.local');
  const { data: alice } = await reception
    .from('technicians')
    .select('id')
    .eq('display_name', 'Alice')
    .single();
  const { data, error } = await reception.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: 'Transports E2E',
    p_requested_work: 'Contrôle hayon',
    p_technician_id: alice?.id,
  });
  if (error) throw error;
  return data;
}

async function photographTailgateLabel(page: Page) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /^Photo de l’étiquette « Étiquette contrôle hayon »/ }).click();
  await (await chooser).setFiles({ name: 'hayon.png', mimeType: 'image/png', buffer: PNG });
}

test.describe.configure({ mode: 'serial' }); // réglage commun à toute l'appli

test('lecture activée : la photo de l’étiquette ouvre la lecture ; sans clé, saisie à la main', async ({
  page,
}, testInfo) => {
  const plate = `LH${String(Date.now()).slice(-7)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const order = await orderForAlice(plate);
  await setLabelScan(true);
  try {
    await loginAs(page, 'alice@rts.local');
    await page.goto(`/atelier/or/${order.id}`);
    await photographTailgateLabel(page);

    const dialog = page.getByRole('dialog', { name: 'Lecture de l’étiquette du hayon' });
    await expect(dialog).toBeVisible();
    // Pas de clé de l'assistant en test : lecture indisponible, la photo est gardée
    await expect(dialog.getByRole('alert')).toContainText('saisis la date à la main');
    await dialog.getByRole('button', { name: 'Fermer' }).first().click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Photo de l’étiquette « Étiquette contrôle hayon » (déjà prise)' }),
    ).toBeVisible();
    // Le mois et l'année se choisissent dans les échéances du véhicule
    await expect(page.getByLabel('Prochain contrôle hayon : mois')).toBeEditable();
    await expect(page.getByLabel('Prochain contrôle hayon : année')).toBeEditable();
  } finally {
    await setLabelScan(false);
  }
});

test('lecture désactivée : la photo est simplement ajoutée', async ({ page }, testInfo) => {
  const plate = `LN${String(Date.now()).slice(-7)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;
  const order = await orderForAlice(plate);
  await setLabelScan(false);
  await loginAs(page, 'alice@rts.local');
  await page.goto(`/atelier/or/${order.id}`);
  await photographTailgateLabel(page);
  await expect(
    page.getByRole('button', { name: 'Photo de l’étiquette « Étiquette contrôle hayon » (déjà prise)' }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('dialog', { name: 'Lecture de l’étiquette du hayon' })).toHaveCount(0);
});
