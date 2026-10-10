import { createClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
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
}

async function apiAs(email: string) {
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

test('borne allumée : le bureau la voit en ligne avant de lui envoyer une signature', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Bureau sur PC, borne sur tablette');
  const plate = `FL${String(Date.now()).slice(-7)}`;
  const reception = await apiAs('reception@rts.local');
  const { data: order, error } = await reception.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: `Client borne ${plate}`,
    p_requested_work: 'Freins avant',
  });
  if (error) throw error;

  // La borne s'allume : écran de pointage, signal de présence envoyé tout de suite.
  const kiosk = await newPage(browser, testInfo);
  await loginAs(kiosk.page, 'borne@rts.local');
  await expect(kiosk.page.getByRole('button', { name: 'Quitter la borne' })).toBeVisible();

  await loginAs(page, 'reception@rts.local');
  await page.goto(`/or/${order.id}`);
  const panel = page.getByLabel('Signature du client');
  await expect(panel.getByText('Borne en ligne')).toBeVisible();
  await kiosk.close();
});

test('lien client inconnu : message clair, et le lien est noté pour la direction', async ({
  page,
}, testInfo) => {
  // 12 premiers caractères propres à ce test (navigateur + horloge), puis complété à 64.
  const prefix = `${testInfo.project.name.includes('mobile') ? 'e' : 'd'}${String(Date.now()).slice(-11)}`;
  const token = prefix.padEnd(64, 'f');
  await page.goto(`/d/${token}`);
  await expect(page.getByText('Ce document est introuvable ou le lien a expiré.')).toBeVisible();

  const direction = await apiAs('direction@rts.local');
  const { data } = await direction
    .from('public_link_misses')
    .select('token_prefix, token_length')
    .eq('token_prefix', prefix);
  expect(data).toEqual([{ token_prefix: prefix, token_length: 64 }]);
});
