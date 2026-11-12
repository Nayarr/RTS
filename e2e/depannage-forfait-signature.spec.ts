import { createClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { loadEnv } from 'vite';
import type { Database } from '../src/types/database';

const env = loadEnv('production', process.cwd(), 'VITE_');
// Comptes de développement créés par supabase/seed.sql (base locale uniquement).
const PASSWORD = 'atelier-dev-2026';
const ADDRESS = 'Aire de Roissy, 95700 Roissy-en-France';

async function login(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

const uniquePlate = (prefix: string, testInfo: TestInfo) =>
  `${prefix}${String(Date.now()).slice(-6)}${testInfo.project.name.includes('mobile') ? 'M' : 'D'}`;

async function receptionApi() {
  const api = createClient<Database>(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  await api.auth.signInWithPassword({ email: 'reception@rts.local', password: PASSWORD });
  return api;
}

/** OR de dépannage en zone 3, non signé (API). */
async function roadsideOrder(api: Awaited<ReturnType<typeof receptionApi>>, plate: string) {
  const { data: order, error } = await api.rpc('create_repair_order', {
    p_plate: plate,
    p_vehicle_type: 'pl',
    p_client_name: `Client dépannage ${plate}`,
    p_requested_work: 'Crevaison sur l’aire',
  });
  if (error) throw error;
  const { error: patchError } = await api
    .from('repair_orders')
    .update({
      intervention_type: 'roadside',
      roadside_address: ADDRESS,
      roadside_km: 30,
      roadside_minutes: 60,
    })
    .eq('id', order.id);
  if (patchError) throw patchError;
  return order;
}

/** Nouveau navigateur (borne), avec les réglages du projet. */
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

/** Adresses (IGN) et trajet (TomTom) simulés : rien ne part sur internet pendant le test. */
async function fakeMaps(page: Page) {
  await page.route('https://data.geopf.fr/geocodage/search?*', (route) =>
    route.fulfill({
      json: {
        features: [{ properties: { label: ADDRESS }, geometry: { coordinates: [2.55, 49.01] } }],
      },
    }),
  );
  await page.route('**/functions/v1/trajet', (route) =>
    route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { km: 30, minutes: 60 } }),
  );
}

async function expectRoadside(page: Page) {
  const summary = page.getByRole('group', { name: 'Dépannage extérieur' });
  await expect(summary).toContainText(`Lieu d’intervention : ${ADDRESS}`);
  await expect(summary).toContainText('Forfait déplacement zone 3');
  await expect(summary).toContainText(/130,00\s€ HT/);
}

test('zone 3 : lieu et forfait au-dessus de la signature à la création, puis sur la borne', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Création d’OR depuis le PC, borne sur tablette');
  test.slow();
  const plate = uniquePlate('DF', testInfo);
  await fakeMaps(page);
  await login(page, 'reception@rts.local');
  await expect(page.getByRole('button', { name: 'Se déconnecter' }).first()).toBeVisible();

  await page.goto('/or/nouveau');
  await page.getByLabel('Immatriculation').fill(plate);
  await page.getByLabel('Client', { exact: true }).fill('Transports E2E');
  await page.getByLabel('Tâche à faire').fill('Crevaison sur l’aire');
  const roadside = page.getByRole('region', { name: 'Lieu d’intervention' });
  await roadside.getByRole('checkbox', { name: /Dépannage extérieur/ }).check();
  await roadside.getByLabel('Lieu d’intervention').fill('aire de roissy');
  await roadside.getByRole('option', { name: /Aire de Roissy/ }).click();
  await roadside.getByRole('button', { name: /Calculer le trajet/ }).click();

  // Signature sur l'écran : au-dessus du cadre
  const card = page.getByRole('region', { name: 'Signature client' });
  await expect(card.getByRole('group', { name: 'Dépannage extérieur' })).toBeVisible();
  await expectRoadside(page);

  // Sur la borne : le client le voit dans la fenêtre de signature
  await card.getByRole('button', { name: 'Sur la borne' }).click();
  await expect(card.getByRole('group', { name: 'Dépannage extérieur' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Créer l’OR' }).click();
  const panel = page.getByLabel('Signature du client');
  await expect(panel.getByRole('status')).toContainText(/En attente sur la borne/);

  const kiosk = await newPage(browser, testInfo);
  await login(kiosk.page, 'signature@rts.local');
  const kioskCard = kiosk.page.getByRole('listitem').filter({ hasText: plate });
  await kioskCard.getByRole('button', { name: /^Signer : Ordre de réparation / }).click({ timeout: 15_000 });
  const dialog = kiosk.page.getByRole('dialog', { name: /Signature de l’ordre de réparation OR\d{5}/ });
  await expect(dialog).toContainText(plate);
  await expectRoadside(kiosk.page);
  await kiosk.close();
  await panel.getByRole('button', { name: 'Annuler la demande' }).click();
});

test('zone 3 : lieu et forfait en haut du lien à signer et du devis, ligne au devis une seule fois', async ({
  page,
}, testInfo) => {
  const api = await receptionApi();
  const order = await roadsideOrder(api, uniquePlate('DL', testInfo));

  // Lien de signature envoyé au client absent
  const request = await api.rpc('request_repair_order_signature', {
    p_repair_order_id: order.id,
    p_channel: 'email',
  });
  if (request.error) throw request.error;
  await page.goto(`/d/${(request.data as { token: string }).token}`);
  await expect(page.getByRole('heading', { name: 'ORDRE DE RÉPARATION' })).toBeVisible();
  await expectRoadside(page);

  // Devis issu de l'OR, repris deux fois : une seule ligne de déplacement
  const quote = await api.rpc('build_quote_from_repair_order', { p_repair_order_id: order.id });
  if (quote.error) throw quote.error;
  const again = await api.rpc('build_quote_from_repair_order', { p_repair_order_id: order.id });
  expect(again.data).toBe(quote.data);
  const { data: lines } = await api
    .from('quote_lines')
    .select('description, unit_price')
    .eq('quote_id', quote.data)
    .eq('line_type', 'travel');
  expect(lines).toEqual([{ description: `Forfait déplacement zone 3 · ${ADDRESS}`, unit_price: 130 }]);

  const token = await api.rpc('share_quote', { p_quote_id: quote.data });
  if (token.error) throw token.error;
  await page.goto(`/d/${token.data}`);
  await expect(page.getByRole('heading', { name: 'DEVIS' })).toBeVisible();
  await expectRoadside(page);
  await expect(page.getByRole('cell', { name: `Forfait déplacement zone 3 · ${ADDRESS}` })).toBeVisible();
});
