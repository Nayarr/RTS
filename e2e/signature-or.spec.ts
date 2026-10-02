import { createClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type Locator, type Page, type TestInfo } from '@playwright/test';
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

async function loginAs(page: Page, email: string) {
  await login(page, email);
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();
}

const uniquePlate = (prefix: string, testInfo: TestInfo) =>
  `${prefix}${String(Date.now()).slice(-7)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;

/** OR non signé créé par la réception (API). */
async function unsignedOrder(plate: string) {
  const client = createClient<Database>(
    env.VITE_SUPABASE_URL ?? '',
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
      auth: { persistSession: false },
    },
  );
  await client.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  const { data, error } = await client.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: `Client signature ${plate}`,
    p_requested_work: 'Freins avant\nVidange',
  });
  if (error) throw error;
  return data;
}

/** Nouveau navigateur (borne, client chez lui), avec les réglages du projet. */
async function newPage(browser: Browser, { project }: TestInfo) {
  const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId } =
    project.use;
  const context = await browser.newContext({
    baseURL,
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    locale,
    timezoneId,
  });
  return { page: await context.newPage(), close: () => context.close() };
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

test('client sur place : signature demandée sur la borne, reçue sur la fiche OR', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Bureau sur PC, borne sur tablette');
  test.slow();
  const plate = uniquePlate('SB', testInfo);
  const order = await unsignedOrder(plate);

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${order.id}`);
  const panel = page.getByLabel('Signature du client');
  await panel.getByRole('button', { name: 'Faire signer sur la borne' }).click();
  await expect(panel.getByRole('status')).toContainText(/En attente sur la borne… \d+ s/);

  // Borne : la fenêtre apparaît par-dessus le pointage, avec le temps restant
  const kiosk = await newPage(browser, testInfo);
  await login(kiosk.page, 'borne@rts.local');
  const dialog = kiosk.page.getByRole('dialog', { name: /Signature de l’ordre de réparation OR\d{5}/ });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog).toContainText(plate);
  await expect(dialog.getByRole('timer')).toHaveAccessibleName(/Temps restant : \d+ secondes/);
  await expect(dialog.getByRole('listitem')).toHaveText(['Freins avant', 'Vidange']);
  await dialog.getByLabel('Votre nom (facultatif)').fill('Paul Client');
  await drawSignature(kiosk.page, dialog.getByRole('img', { name: 'Signature du client' }));
  await dialog.getByRole('button', { name: 'Valider ma signature' }).click();
  await expect(kiosk.page.getByText('Merci, votre signature est enregistrée.')).toBeVisible();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await kiosk.close();

  // Bureau : la signature arrive d'elle-même sur la fiche OR
  const signature = page.getByRole('img', { name: 'Signature du client', exact: true });
  await expect(signature).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Signé par le client sur la borne : Paul Client')).toBeVisible();
});

test('client absent : lien de signature par e-mail, signé en ligne sans compte', async ({
  page,
  browser,
}, testInfo) => {
  test.slow();
  const plate = uniquePlate('SE', testInfo);
  const order = await unsignedOrder(plate);

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${order.id}`);
  await page.getByLabel('Signature du client').getByRole('button', { name: 'Demander par e-mail' }).click();
  const send = page.getByRole('dialog', { name: /signature à distance/ });
  await send.getByLabel('E-mail du client').fill('atelier-client@e2e.fr');
  await expect(send.getByRole('link', { name: /Envoyer par e-mail/ })).toHaveAttribute(
    'href',
    /^mailto:atelier-client@e2e\.fr\?subject=Ordre%20de%20r%C3%A9paration%20OR\d{5}%20%C3%A0%20signer/,
  );
  const link = await send.getByLabel('Lien', { exact: true }).inputValue();
  await page.keyboard.press('Escape');
  await expect(page.getByText(/Lien de signature envoyé, valable jusqu’au/)).toBeVisible();

  // Le client ouvre le lien chez lui
  const client = await newPage(browser, testInfo);
  await client.page.goto(new URL(link).pathname);
  await expect(client.page.getByRole('heading', { name: 'ORDRE DE RÉPARATION' })).toBeVisible();
  await expect(client.page.getByText(plate, { exact: true })).toBeVisible();
  await client.page.getByRole('button', { name: 'Signer l’ordre de réparation' }).click();
  await expect(client.page.getByRole('alert')).toContainText('Merci d’indiquer votre nom.');
  await client.page.getByLabel('Votre nom').fill('Marie Client');
  await drawSignature(client.page, client.page.getByRole('img', { name: 'Signature du client' }));
  await client.page.getByRole('button', { name: 'Signer l’ordre de réparation' }).click();
  await expect(client.page.getByText(/Signé par Marie Client le/)).toBeVisible();
  await client.page.reload();
  await expect(client.page.getByRole('button', { name: 'Signer l’ordre de réparation' })).toHaveCount(0);
  await client.close();

  // Bureau : signature visible sur l'OR
  await page.reload();
  await expect(page.getByRole('img', { name: 'Signature du client', exact: true })).toBeVisible();
  await expect(page.getByText('Signé en ligne par le client (lien e-mail) : Marie Client')).toBeVisible();
});

test('création de l’OR : « Sur la borne » lance la demande dès l’ouverture de la fiche', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Création d’OR depuis le PC');
  const plate = uniquePlate('SN', testInfo);
  await loginAs(page, 'reception@rts.local');
  await page.goto('/or/nouveau');
  await page.getByLabel('Immatriculation').fill(plate);
  await page.getByLabel('Client', { exact: true }).fill('Transports E2E');
  await page.getByLabel('Tâche à faire').fill('Contrôle complet');
  const where = page.getByRole('group', { name: 'Où le client signe-t-il ?' });
  await where.getByRole('button', { name: 'Sur la borne' }).click();
  await expect(page.getByRole('img', { name: 'Zone de signature du client' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Créer l’OR' }).click();

  const panel = page.getByLabel('Signature du client');
  await expect(panel.getByRole('status')).toContainText(/En attente sur la borne… \d+ s/);
  await expect(page).not.toHaveURL(/signature=/);
  // Pas de demande laissée en attente sur la borne
  await panel.getByRole('button', { name: 'Annuler la demande' }).click();
  await expect(panel.getByRole('button', { name: 'Faire signer sur la borne' })).toBeVisible();
});
