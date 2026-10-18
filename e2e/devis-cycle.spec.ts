import { createClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type Locator, type Page, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';
import { parisDay } from './support/dates';

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

const suffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.includes('mobile') ? 'M' : 'D'}${String(Date.now()).slice(-6)}`;

/** Devis en brouillon avec une ligne de main-d'œuvre (API, réception). */
async function draftQuote(plate: string, clientName: string) {
  const client = await api('reception@rts.local');
  const { data: quote, error } = await client.rpc('create_quote', {
    p_client_name: clientName,
    p_plate: plate,
    p_vehicle_type: 'pl',
  });
  if (error) throw error;
  const lines = await client.from('quote_lines').insert({
    quote_id: quote.id,
    position: 0,
    line_type: 'labor',
    description: 'Remplacement plaquettes avant',
    estimated_hours: 2,
    unit_price: 85,
    quantity: 2,
  });
  if (lines.error) throw lines.error;
  return quote.id;
}

/** Nouveau navigateur (la borne), avec les réglages du projet. */
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

test('client sur place : devis signé sur la borne, accepté au bureau', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Bureau sur PC, borne sur tablette');
  test.slow();
  const id = suffix(testInfo);
  const plate = `DB${id}`;
  const quoteId = await draftQuote(plate, `Client borne ${id}`);

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/devis/${quoteId}`);
  await page.getByRole('button', { name: 'Faire signer sur la borne' }).click();
  await expect(page.getByRole('status', { name: 'Signature sur la borne' })).toContainText(
    /Sur la borne : \d+ s/,
  );

  // Borne : le devis à signer, avec les travaux et le total TTC
  const kiosk = await newPage(browser, testInfo);
  await login(kiosk.page, 'borne@rts.local');
  // Borne partagée entre tests : une demande d'un autre test peut passer avant (1 minute au plus)
  const dialog = kiosk.page.getByRole('dialog', { name: /Signature du devis / }).filter({ hasText: plate });
  await expect(dialog).toBeVisible({ timeout: 75_000 });
  await expect(dialog).toContainText('Remplacement plaquettes avant');
  await expect(dialog).toContainText(/204,00\s€/);
  await dialog.getByLabel('Votre nom (facultatif)').fill('Paul Client');
  await drawSignature(kiosk.page, dialog.getByRole('img', { name: 'Signature du client' }));
  await dialog.getByRole('button', { name: 'Valider ma signature' }).click();
  await expect(kiosk.page.getByText('Merci, votre signature est enregistrée.')).toBeVisible();
  await kiosk.close();

  // Bureau : le devis passe accepté de lui-même
  await expect(page.getByText('Accepté par Paul Client')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Faire signer sur la borne' })).toHaveCount(0);
});

test('dupliquer un devis puis un OR : copies en brouillon, ouvertes tout de suite', async ({
  page,
}, testInfo) => {
  const id = suffix(testInfo);
  const plate = `DU${id}`;
  const quoteId = await draftQuote(plate, `Client copie ${id}`);

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/devis/${quoteId}`);
  await page.getByRole('button', { name: 'Dupliquer le devis' }).click();
  await expect(page.getByText('Devis dupliqué en brouillon')).toBeVisible();
  await expect(page).not.toHaveURL(new RegExp(quoteId));
  await expect(page).toHaveURL(/\/devis\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Remplacement plaquettes avant').first()).toBeVisible();

  const reception = await api('reception@rts.local');
  const { data: order, error } = await reception.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: `Client copie ${id}`,
    p_requested_work: 'Freins avant',
  });
  if (error) throw error;
  await page.goto(`/or/${order.id}`);
  await page.getByRole('button', { name: 'Dupliquer l’OR' }).click();
  await expect(page.getByText('OR dupliqué : non assigné, à compléter')).toBeVisible();
  await expect(page).not.toHaveURL(new RegExp(order.id));
  await expect(page).toHaveURL(/\/or\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('link', { name: plate, exact: true })).toBeVisible();
});

test('rendez-vous arrivé : la direction exige la fiche de contrôle complète', async ({ page }, testInfo) => {
  const id = suffix(testInfo);
  const plate = `RF${id}`;
  const reception = await api('reception@rts.local');
  const { error } = await reception.rpc('save_appointment', {
    p_client_name: `Client fiche ${id}`,
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_scheduled_date: parisDay(1),
    p_start_time: '09:00',
    p_reason: 'Révision complète',
  });
  if (error) throw error;

  await loginAs(page, 'direction@rts.local');
  await page.goto('/rendez-vous');
  await page.getByRole('listitem').filter({ hasText: plate }).getByRole('button').click();
  await page.getByLabel('Fiche de contrôle complète obligatoire').click();
  await page.getByRole('button', { name: 'Le véhicule est arrivé : créer l’OR' }).click();
  await expect(page).toHaveURL(/\/or\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('link', { name: plate, exact: true })).toBeVisible();

  const orderId = page.url().split('/').pop() ?? '';
  const direction = await api('direction@rts.local');
  const { data } = await direction
    .from('repair_orders')
    .select('inspection_required, requested_work')
    .eq('id', orderId)
    .single();
  expect(data).toEqual({ inspection_required: true, requested_work: 'Révision complète' });
});
