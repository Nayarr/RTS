import { createClient } from '@supabase/supabase-js';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';

async function login(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

const uniquePlate = (prefix: string, testInfo: TestInfo) =>
  `${prefix}${String(Date.now()).slice(-6)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;

/** OR créé par la réception puis envoyé sur la borne (API). */
async function orderOnKiosk(plate: string) {
  const reception = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    { auth: { persistSession: false } },
  );
  await reception.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data: order, error } = await reception.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: `Client borne ${plate}`,
    p_requested_work: 'Freins avant',
  });
  if (error) throw error;
  const sent = await reception.rpc('request_repair_order_signature', {
    p_repair_order_id: order.id,
    p_channel: 'kiosk',
  });
  if (sent.error) throw sent.error;
  return order;
}

async function drawSignature(page: Page, pad: Locator) {
  await pad.scrollIntoViewIfNeeded();
  const box = await pad.boundingBox();
  if (!box) throw new Error('Zone de signature introuvable');
  await page.mouse.move(box.x + 30, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 100, { steps: 8 });
  await page.mouse.move(box.x + 220, box.y + 30, { steps: 8 });
  await page.mouse.up();
}

test('borne de signature : deux clients, deux demandes listées, chacun signe la sienne', async ({
  page,
}, testInfo) => {
  test.slow();
  const first = uniquePlate('BS', testInfo);
  const second = uniquePlate('BT', testInfo);
  await orderOnKiosk(first);
  await orderOnKiosk(second);

  await login(page, 'signature@rts.local');
  await expect(page.getByRole('heading', { name: 'Signature client' })).toBeVisible();
  const firstCard = page.getByRole('listitem').filter({ hasText: first });
  const secondCard = page.getByRole('listitem').filter({ hasText: second });
  await expect(firstCard.getByRole('timer')).toHaveAccessibleName(/Temps restant : \d+ secondes/);
  await expect(secondCard.getByRole('button', { name: /^Signer : Ordre de réparation / })).toBeVisible();

  // Le second client signe le sien
  await secondCard.getByRole('button', { name: /^Signer : Ordre de réparation / }).click();
  const dialog = page.getByRole('dialog', { name: /Signature de l’ordre de réparation / });
  await expect(dialog).toContainText(second);
  await drawSignature(page, dialog.getByRole('img', { name: 'Signature du client' }));
  await dialog.getByRole('button', { name: 'Valider ma signature' }).click();
  await expect(page.getByText('Merci, votre signature est enregistrée.')).toBeVisible();

  // Retour à la liste : son document est parti, celui de l'autre client reste
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(secondCard).toHaveCount(0);
  await expect(firstCard.getByRole('button', { name: /^Signer : / })).toBeVisible();
});

test('borne de badgeage : pointage seulement, aucune demande de signature', async ({ page }, testInfo) => {
  const plate = uniquePlate('BB', testInfo);
  await orderOnKiosk(plate);

  await login(page, 'borne@rts.local');
  await expect(page.getByText('Borne de pointage')).toBeVisible();
  // Laisse passer le relevé des demandes de l'ancienne borne (toutes les 3 s) : rien ne s'affiche
  await page.waitForTimeout(4_000);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(plate)).toHaveCount(0);
});
